import type { Env } from "./env";
import type { ScoredEvent } from "./ranking";
import {
  followFriend,
  getUser,
  listFollowedFriends,
  registerUser,
  setLastfmUsername,
  unfollowFriend,
} from "./storage";
import { getFriends } from "./lastfm";

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

export function renderDigest(
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
    lines.push(
      `• <a href="${escHtml(s.event.url)}">${escHtml(s.matchedName)}</a> @ ${escHtml(
        venue
      )} — ${escHtml(when)}${priceStr}${reasons}`
    );
  }
  return lines.join("\n");
}

// --- Webhook command routing ---

interface Update {
  message?: {
    chat: { id: number; type: string };
    text?: string;
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
  const followed = new Set(await listFollowedFriends(env, tgUserId));
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
          "I post a weekly digest of <b>Seattle</b> shows ranked by what you (and your Last.fm friends) actually listen to. Seattle-only for now.",
          "",
          "Two-step setup:",
          "1. <code>/lastfm &lt;your username&gt;</code>",
          "2. <code>/spotify</code> to connect your Spotify",
          "",
          "Then <code>/friends</code> to pick which Last.fm friends to track, and <code>/upcoming</code> for an on-demand peek.",
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
      await followFriend(env, fromId, arg);
      await sendMessage(env, `Now tracking <b>${escHtml(arg)}</b>`, { chatId });
      return;
    }
    case "/untrack": {
      const user = await getUser(env, fromId);
      if (!user) return sendMessage(env, NEED_REGISTER, { chatId });
      if (!arg) return sendMessage(env, "Usage: /untrack <lastfm_username>", { chatId });
      await unfollowFriend(env, fromId, arg);
      await sendMessage(env, `Untracked <b>${escHtml(arg)}</b>`, { chatId });
      return;
    }
    case "/tracked": {
      const user = await getUser(env, fromId);
      if (!user) return sendMessage(env, NEED_REGISTER, { chatId });
      const list = await listFollowedFriends(env, fromId);
      await sendMessage(
        env,
        list.length ? `Tracking:\n• ${list.map(escHtml).join("\n• ")}` : "Not tracking anyone yet.",
        { chatId }
      );
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
        "Commands:\n/start\n/lastfm &lt;name&gt;\n/spotify\n/friends\n/track &lt;name&gt;\n/untrack &lt;name&gt;\n/tracked\n/upcoming [days]\n/ping",
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
      if (op === "f") await followFriend(baseCtx.env, fromId, name);
      else await unfollowFriend(baseCtx.env, fromId, name);
      await editFriendsKeyboard(baseCtx.env, fromId, msg.chat.id, msg.message_id, page);
      return answerCallback(baseCtx.env, cq.id, op === "f" ? "Tracking" : "Untracked");
    }
    return answerCallback(baseCtx.env, cq.id);
  }

  const message = update.message;
  if (!message?.text || !message.from) return;
  const fromId = message.from.id;
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
