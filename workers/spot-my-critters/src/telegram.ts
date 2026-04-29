import type { Env } from "./env";
import type { ScoredEvent } from "./ranking";
import {
  trackLastfmUser,
  getUser,
  listTrackedLastfmUsers,
  registerUser,
  setLastfmUsername,
  setUserLocation,
  setUserRadius,
  untrackLastfmUser,
} from "./storage";
import { getFriends } from "./lastfm";
import { reverseGeocode } from "./geocode";

const FRIENDS_PAGE_SIZE = 10;

function tgApi(env: Env, method: string): string {
  return `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;
}

async function tgPost(env: Env, method: string, body: unknown): Promise<Response> {
  return fetch(tgApi(env, method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function sendMessage(
  env: Env,
  text: string,
  opts: { chatId: string | number; parseMode?: "Markdown" | "HTML" }
): Promise<void> {
  const res = await tgPost(env, "sendMessage", {
    chat_id: opts.chatId,
    text,
    parse_mode: opts.parseMode ?? "HTML",
    disable_web_page_preview: true,
  });
  if (!res.ok) console.log(`Telegram sendMessage failed: ${res.status} ${await res.text()}`);
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatPT(iso: string | undefined, localDate: string, tz: string): string {
  const d = iso ? new Date(iso) : new Date(localDate + "T20:00:00");
  return d.toLocaleString("en-us", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function eventStart(s: ScoredEvent): Date {
  return s.event.dateTimeIso
    ? new Date(s.event.dateTimeIso)
    : new Date(s.event.localDate + "T20:00:00");
}

function gcalLink(s: ScoredEvent): string {
  const start = eventStart(s);
  const end = new Date(start.getTime() + 3 * 3600 * 1000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: s.matchedName,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: s.event.url,
    location: s.event.venueName ?? "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function icsLink(env: Env, s: ScoredEvent): string {
  const params = new URLSearchParams({
    n: s.matchedName,
    s: eventStart(s).toISOString(),
    id: s.event.id,
    loc: s.event.venueName ?? "",
    u: s.event.url,
  });
  return `${new URL(env.SPOTIFY_REDIRECT_URI).origin}/ics?${params.toString()}`;
}

export function renderDigest(
  env: Env,
  scored: ScoredEvent[],
  opts: { headerLabel: string; tz: string; prices?: Map<string, number> }
): string {
  if (scored.length === 0) {
    return `<b>${escHtml(opts.headerLabel)}</b>\nNo matching shows. 🦗`;
  }
  const lines: string[] = [`<b>${escHtml(opts.headerLabel)}</b>`];
  for (const s of scored) {
    const when = formatPT(s.event.dateTimeIso, s.event.localDate, opts.tz);
    const venue = s.event.venueName ?? "";
    const price = opts.prices?.get(s.event.id);
    const priceStr = price !== undefined ? ` · from $${price}` : "";
    const reasons = s.reasons.length ? ` — <i>${escHtml(s.reasons.join(", "))}</i>` : "";
    const cal = ` · <a href="${escHtml(gcalLink(s))}">📅</a><a href="${escHtml(icsLink(env, s))}">🍎</a>`;
    lines.push(
      `• <a href="${escHtml(s.event.url)}">${escHtml(s.matchedName)}</a> @ ${escHtml(
        venue
      )} — ${escHtml(when)}${priceStr}${cal}${reasons}`
    );
  }
  return lines.join("\n");
}

// --- Webhook command routing ---

interface Update {
  message?: {
    chat: { id: number; type: string };
    text?: string;
    location?: { latitude: number; longitude: number };
    venue?: { location: { latitude: number; longitude: number }; title?: string; address?: string };
    from?: { id: number; username?: string };
  };
  callback_query?: {
    id: string;
    from: { id: number; username?: string };
    message?: { chat: { id: number; type: string }; message_id: number };
    data?: string;
  };
}

type CommandContext = {
  env: Env;
  chatId: number;
  chatType: string;
  fromId: number;
  fromUsername: string | null;
  runOnDemandDigest: (days: number) => Promise<void>;
};

function workerOrigin(env: Env): string {
  return new URL(env.SPOTIFY_REDIRECT_URI).origin;
}

async function answerCallback(env: Env, id: string, text?: string): Promise<void> {
  await tgPost(env, "answerCallbackQuery", { callback_query_id: id, text });
}

async function editFriendsKeyboard(
  env: Env,
  tgUserId: number,
  chatId: number,
  messageId: number,
  page: number
): Promise<void> {
  const { text, markup } = await renderFriendsKeyboard(env, tgUserId, page);
  await tgPost(env, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    reply_markup: markup,
  });
}

async function renderFriendsKeyboard(
  env: Env,
  tgUserId: number,
  page = 0
): Promise<{ text: string; markup: unknown }> {
  const user = await getUser(env, tgUserId);
  if (!user?.lastfmUsername) {
    return {
      text: "Set your Last.fm username first: <code>/lastfm &lt;name&gt;</code>",
      markup: { inline_keyboard: [] },
    };
  }
  const friends = await getFriends(env, user.lastfmUsername);
  const followed = new Set(await listTrackedLastfmUsers(env, tgUserId));
  const totalPages = Math.max(1, Math.ceil(friends.length / FRIENDS_PAGE_SIZE));
  const p = Math.max(0, Math.min(page, totalPages - 1));
  const slice = friends.slice(p * FRIENDS_PAGE_SIZE, (p + 1) * FRIENDS_PAGE_SIZE);
  const rows = slice.map((name) => [
    {
      text: `${followed.has(name) ? "✅" : "▫️"} ${name}`,
      callback_data: `tg:${followed.has(name) ? "u" : "f"}:${name}:${p}`,
    },
  ]);
  const nav: Array<{ text: string; callback_data: string }> = [];
  if (p > 0) nav.push({ text: "◀︎ Prev", callback_data: `tg:p:${p - 1}` });
  if (p < totalPages - 1) nav.push({ text: "Next ▶︎", callback_data: `tg:p:${p + 1}` });
  if (nav.length) rows.push(nav);
  return {
    text: `<b>Last.fm friends</b> (page ${p + 1}/${totalPages}) — tap to toggle`,
    markup: { inline_keyboard: rows },
  };
}

const DM_ONLY_HELP = "DM the bot to use this command.";
const NEED_REGISTER = "Send /start in a DM to register first.";

async function handleCommand(ctx: CommandContext, text: string): Promise<void> {
  const { env, chatId, chatType, fromId } = ctx;
  const trimmed = text.trim();
  const [rawCmd = "", ...rest] = trimmed.split(/\s+/);
  const cmd = rawCmd.split("@")[0];
  const arg = rest.join(" ");

  if (cmd === "/ping") {
    await sendMessage(env, "pong", { chatId });
    return;
  }

  // All other commands are DM-only.
  if (chatType !== "private") {
    await sendMessage(env, DM_ONLY_HELP, { chatId });
    return;
  }

  switch (cmd) {
    case "/start": {
      await registerUser(env, fromId, ctx.fromUsername);
      await sendMessage(
        env,
        [
          "👋 Welcome to Spot My Critters.",
          "",
          "I post a weekly digest of upcoming shows ranked by what you (and your Last.fm friends) actually listen to.",
          "",
          "Setup:",
          "1. 📎 → Location → share your area, or <code>/city &lt;City, State&gt;</code>",
          "2. <code>/lastfm &lt;your username&gt;</code>",
          "3. <code>/spotify</code> to connect your Spotify",
          "",
          "Then <code>/friends</code> to pick Last.fm friends to track, <code>/upcoming</code> for an on-demand peek, and <code>/radius &lt;miles&gt;</code> to widen the search.",
        ].join("\n"),
        { chatId }
      );
      return;
    }
    case "/lastfm": {
      if (!arg) {
        await sendMessage(env, "Usage: <code>/lastfm &lt;your last.fm username&gt;</code>", {
          chatId,
        });
        return;
      }
      const user = await getUser(env, fromId);
      if (!user) {
        await sendMessage(env, NEED_REGISTER, { chatId });
        return;
      }
      await setLastfmUsername(env, fromId, arg);
      await sendMessage(env, `Last.fm username set to <b>${escHtml(arg)}</b> ✓`, { chatId });
      return;
    }
    case "/spotify": {
      const user = await getUser(env, fromId);
      if (!user) {
        await sendMessage(env, NEED_REGISTER, { chatId });
        return;
      }
      const link = `${workerOrigin(env)}/oauth/spotify/start?u=${fromId}`;
      await sendMessage(
        env,
        `Tap to connect Spotify:\n<a href="${link}">${link}</a>`,
        { chatId }
      );
      return;
    }
    case "/friends": {
      const user = await getUser(env, fromId);
      if (!user) {
        await sendMessage(env, NEED_REGISTER, { chatId });
        return;
      }
      const { text: body, markup } = await renderFriendsKeyboard(env, fromId);
      await tgPost(env, "sendMessage", {
        chat_id: chatId,
        text: body,
        parse_mode: "HTML",
        reply_markup: markup,
      });
      return;
    }
    case "/track": {
      const user = await getUser(env, fromId);
      if (!user) return sendMessage(env, NEED_REGISTER, { chatId });
      if (!arg) return sendMessage(env, "Usage: /track <lastfm_username>", { chatId });
      await trackLastfmUser(env, fromId, arg);
      await sendMessage(env, `Now tracking <b>${escHtml(arg)}</b>`, { chatId });
      return;
    }
    case "/untrack": {
      const user = await getUser(env, fromId);
      if (!user) return sendMessage(env, NEED_REGISTER, { chatId });
      if (!arg) return sendMessage(env, "Usage: /untrack <lastfm_username>", { chatId });
      await untrackLastfmUser(env, fromId, arg);
      await sendMessage(env, `Untracked <b>${escHtml(arg)}</b>`, { chatId });
      return;
    }
    case "/tracked": {
      const user = await getUser(env, fromId);
      if (!user) return sendMessage(env, NEED_REGISTER, { chatId });
      const list = await listTrackedLastfmUsers(env, fromId);
      await sendMessage(
        env,
        list.length ? `Tracking:\n• ${list.map(escHtml).join("\n• ")}` : "Not tracking anyone yet.",
        { chatId }
      );
      return;
    }
    case "/city": {
      const user = await getUser(env, fromId);
      if (!user) return sendMessage(env, NEED_REGISTER, { chatId });
      if (!arg) {
        await sendMessage(
          env,
          "Share your location 📎 or use <code>/city Seattle, WA</code>.",
          { chatId }
        );
        return;
      }
      // Forward-geocode via Nominatim search.
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=${encodeURIComponent(arg)}`;
      const res = await fetch(url, {
        headers: { "User-Agent": "spot-my-critters (https://github.com/sparkyfen/sparky.works)" },
      });
      const hits = (await res.json()) as Array<{
        lat: string;
        lon: string;
        address?: { city?: string; town?: string; village?: string; "ISO3166-2-lvl4"?: string };
      }>;
      const hit = hits[0];
      if (!hit) {
        await sendMessage(env, `Couldn't find "<b>${escHtml(arg)}</b>". Try sharing a location instead.`, { chatId });
        return;
      }
      const lat = parseFloat(hit.lat);
      const lon = parseFloat(hit.lon);
      const city = hit.address?.city ?? hit.address?.town ?? hit.address?.village ?? null;
      const iso = hit.address?.["ISO3166-2-lvl4"];
      const stateCode = iso?.includes("-") ? iso.split("-")[1]! : null;
      await setUserLocation(env, fromId, { city, stateCode, latitude: lat, longitude: lon });
      const label = [city, stateCode].filter(Boolean).join(", ") || `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
      await sendMessage(env, `Location set: <b>${escHtml(label)}</b> ✓`, { chatId });
      return;
    }
    case "/radius": {
      const user = await getUser(env, fromId);
      if (!user) return sendMessage(env, NEED_REGISTER, { chatId });
      const n = parseInt(arg, 10);
      if (!Number.isFinite(n) || n < 1 || n > 200) {
        await sendMessage(env, "Usage: <code>/radius &lt;miles&gt;</code> (1–200)", { chatId });
        return;
      }
      await setUserRadius(env, fromId, n);
      await sendMessage(env, `Search radius set to <b>${n} mi</b> ✓`, { chatId });
      return;
    }
    case "/upcoming": {
      const user = await getUser(env, fromId);
      if (!user) return sendMessage(env, NEED_REGISTER, { chatId });
      const days = arg
        ? Math.min(parseInt(arg, 10) || 60, parseInt(env.UPCOMING_MAX_DAYS, 10))
        : 60;
      await sendMessage(env, `Scanning the next ${days} days…`, { chatId });
      await ctx.runOnDemandDigest(days);
      return;
    }
    default:
      await sendMessage(
        env,
        "Commands:\n/start\n/city &lt;City, State&gt; (or share location 📎)\n/radius &lt;miles&gt;\n/lastfm &lt;name&gt;\n/spotify\n/friends\n/track &lt;name&gt;\n/untrack &lt;name&gt;\n/tracked\n/upcoming [days]\n/ping",
        { chatId }
      );
  }
}

export async function handleTelegramUpdate(
  update: Update,
  baseCtx: Omit<CommandContext, "chatId" | "chatType" | "fromId" | "fromUsername" | "runOnDemandDigest"> & {
    runOnDemandDigest: (tgUserId: number, days: number) => Promise<void>;
  }
): Promise<void> {
  if (update.callback_query) {
    const cq = update.callback_query;
    const data = cq.data ?? "";
    const msg = cq.message;
    if (!msg) return answerCallback(baseCtx.env, cq.id);
    const [ns, op, ...parts] = data.split(":");
    if (ns !== "tg") return answerCallback(baseCtx.env, cq.id);
    const fromId = cq.from.id;
    if (op === "p") {
      const page = parseInt(parts[0] ?? "0", 10) || 0;
      await editFriendsKeyboard(baseCtx.env, fromId, msg.chat.id, msg.message_id, page);
      return answerCallback(baseCtx.env, cq.id);
    }
    if (op === "f" || op === "u") {
      const page = parseInt(parts[parts.length - 1] ?? "0", 10) || 0;
      const name = parts.slice(0, -1).join(":");
      if (op === "f") await trackLastfmUser(baseCtx.env, fromId, name);
      else await untrackLastfmUser(baseCtx.env, fromId, name);
      await editFriendsKeyboard(baseCtx.env, fromId, msg.chat.id, msg.message_id, page);
      return answerCallback(baseCtx.env, cq.id, op === "f" ? "Tracking" : "Untracked");
    }
    return answerCallback(baseCtx.env, cq.id);
  }

  const message = update.message;
  if (!message?.from) return;
  const fromId = message.from.id;

  // Location share (or venue forward) sets the user's lat/long.
  const loc = message.location ?? message.venue?.location;
  if (loc) {
    if (message.chat.type !== "private") {
      await sendMessage(baseCtx.env, "DM the bot to share a location.", { chatId: message.chat.id });
      return;
    }
    const user = await getUser(baseCtx.env, fromId);
    if (!user) {
      await sendMessage(baseCtx.env, "Send /start in a DM to register first.", {
        chatId: message.chat.id,
      });
      return;
    }
    const geo = await reverseGeocode(baseCtx.env, loc.latitude, loc.longitude);
    await setUserLocation(baseCtx.env, fromId, {
      city: geo.city,
      stateCode: geo.stateCode,
      latitude: loc.latitude,
      longitude: loc.longitude,
    });
    const label =
      [geo.city, geo.stateCode].filter(Boolean).join(", ") ||
      `${loc.latitude.toFixed(2)}, ${loc.longitude.toFixed(2)}`;
    await sendMessage(baseCtx.env, `Location saved: <b>${escHtml(label)}</b> ✓`, {
      chatId: message.chat.id,
    });
    return;
  }

  if (!message.text) return;
  await handleCommand(
    {
      env: baseCtx.env,
      chatId: message.chat.id,
      chatType: message.chat.type,
      fromId,
      fromUsername: message.from.username ?? null,
      runOnDemandDigest: (days: number) => baseCtx.runOnDemandDigest(fromId, days),
    },
    message.text
  );
}
