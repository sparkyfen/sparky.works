import type { Env } from "./env";
import { exchangeSpotifyCode, spotifyAuthorizeUrl } from "./oauth";
import {
  fetchEventsWindow,
  pruneOldPostedEvents,
  runDigestForUser,
  runDigestOnDemand,
} from "./pipeline";
import { listAllUsers } from "./storage";
import { handleTelegramUpdate, sendMessage } from "./telegram";

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const days = parseInt(env.DIGEST_DAYS, 10) || 7;
    ctx.waitUntil(runWeeklyDigest(env, days));
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/tg") {
      const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
      if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response("forbidden", { status: 403 });
      }
      const update = (await request.json()) as Parameters<typeof handleTelegramUpdate>[0];
      ctx.waitUntil(
        handleTelegramUpdate(update, {
          env,
          runOnDemandDigest: async (tgUserId: number, days: number) => {
            await runDigestOnDemand(env, tgUserId, {
              days,
              writeDedupe: false,
              headerLabel: `🎸 Upcoming — next ${days} days`,
              withPrices: true,
            });
          },
        }).catch(async (e) => {
          console.log(`tg handler error: ${(e as Error).message}`);
          const fromChat =
            update.message?.chat.id ?? update.callback_query?.message?.chat.id;
          if (fromChat) {
            await sendMessage(env, `⚠️ ${(e as Error).message}`, { chatId: fromChat });
          }
        })
      );
      return new Response("ok");
    }

    if (request.method === "GET" && url.pathname === "/debug/digest") {
      if (url.searchParams.get("key") !== env.DEBUG_KEY) {
        return new Response("forbidden", { status: 403 });
      }
      const days = parseInt(url.searchParams.get("days") ?? "7", 10) || 7;
      const tgUserIdRaw = url.searchParams.get("u");
      if (!tgUserIdRaw) return new Response("missing ?u=<tg_user_id>", { status: 400 });
      const tgUserId = parseInt(tgUserIdRaw, 10);
      const out = await runDigestOnDemand(env, tgUserId, {
        days,
        writeDedupe: false,
        headerLabel: `(debug) next ${days} days`,
        withPrices: false,
      });
      return Response.json(
        out.map((s) => ({
          id: s.event.id,
          name: s.matchedName,
          when: s.event.dateTimeIso ?? s.event.localDate,
          venue: s.event.venueName,
          score: s.score,
          reasons: s.reasons,
          url: s.event.url,
        }))
      );
    }

    if (request.method === "GET" && url.pathname === "/oauth/spotify/start") {
      const tgUserIdRaw = url.searchParams.get("u");
      if (!tgUserIdRaw) return new Response("missing ?u=<tg_user_id>", { status: 400 });
      const tgUserId = parseInt(tgUserIdRaw, 10);
      if (!Number.isFinite(tgUserId)) return new Response("bad u", { status: 400 });
      const stateId = crypto.randomUUID();
      await env.TOKENS.put(`oauth:state:${stateId}`, String(tgUserId), {
        expirationTtl: 600,
      });
      return Response.redirect(spotifyAuthorizeUrl(env, stateId), 302);
    }

    if (request.method === "GET" && url.pathname === "/oauth/spotify/callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (!code || !state) return new Response("missing code/state", { status: 400 });
      const tgUserIdStr = await env.TOKENS.get(`oauth:state:${state}`);
      if (!tgUserIdStr) return new Response("bad or expired state", { status: 400 });
      await env.TOKENS.delete(`oauth:state:${state}`);
      const tgUserId = parseInt(tgUserIdStr, 10);
      try {
        await exchangeSpotifyCode(env, tgUserId, code);
        await sendMessage(env, "Spotify connected ✓", { chatId: tgUserId });
        return new Response(
          "<h2>Spotify connected ✓</h2><p>You can close this tab and return to Telegram.</p>",
          { headers: { "content-type": "text/html; charset=utf-8" } }
        );
      } catch (e) {
        return new Response(`exchange failed: ${(e as Error).message}`, { status: 500 });
      }
    }

    if (request.method === "GET" && url.pathname === "/ics") {
      const name = url.searchParams.get("n");
      const start = url.searchParams.get("s");
      const id = url.searchParams.get("id");
      if (!name || !start || !id) return new Response("missing params", { status: 400 });
      const startDate = new Date(start);
      if (isNaN(startDate.getTime())) return new Response("bad start", { status: 400 });
      const endDate = new Date(startDate.getTime() + 3 * 3600 * 1000);
      const fmt = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, "");
      const escIcs = (s: string) =>
        s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
      const venue = url.searchParams.get("loc") ?? "";
      const eventUrl = url.searchParams.get("u") ?? "";
      const ics = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//spot-my-critters//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        `UID:${id}@spot-my-critters`,
        `DTSTAMP:${fmt(new Date())}`,
        `DTSTART:${fmt(startDate)}`,
        `DTEND:${fmt(endDate)}`,
        `SUMMARY:${escIcs(name)}`,
        venue ? `LOCATION:${escIcs(venue)}` : "",
        eventUrl ? `URL:${escIcs(eventUrl)}` : "",
        eventUrl ? `DESCRIPTION:${escIcs(eventUrl)}` : "",
        "END:VEVENT",
        "END:VCALENDAR",
      ]
        .filter(Boolean)
        .join("\r\n");
      return new Response(ics, {
        headers: {
          "content-type": "text/calendar; charset=utf-8",
          "content-disposition": `attachment; filename="${id}.ics"`,
        },
      });
    }

    if (url.pathname === "/") {
      return new Response("spot-my-critters ok");
    }

    return new Response("not found", { status: 404 });
  },
};

async function runWeeklyDigest(env: Env, days: number): Promise<void> {
  const users = await listAllUsers(env);
  if (users.length === 0) {
    console.log("weekly digest: no registered users");
    return;
  }
  // Group by location bucket so users in the same area share one TM fetch.
  const groups = new Map<string, typeof users>();
  for (const user of users) {
    if (user.latitude == null || user.longitude == null || user.radiusMiles == null) continue;
    const key = `${user.latitude.toFixed(2)}:${user.longitude.toFixed(2)}:${user.radiusMiles}`;
    const arr = groups.get(key) ?? [];
    arr.push(user);
    groups.set(key, arr);
  }
  for (const groupUsers of groups.values()) {
    const head = groupUsers[0]!;
    const events = await fetchEventsWindow(
      env,
      { latitude: head.latitude!, longitude: head.longitude!, radiusMiles: head.radiusMiles! },
      days
    );
    const cityLabel = head.city ?? "Local";
    for (const user of groupUsers) {
      try {
        const out = await runDigestForUser(env, user, events, {
          days,
          writeDedupe: true,
          headerLabel: `🎸 ${cityLabel} shows — next ${days} days`,
          withPrices: true,
        });
        console.log(`digest user=${user.tgUserId}: posted ${out.length} events`);
      } catch (e) {
        console.log(`digest user=${user.tgUserId} failed: ${(e as Error).message}`);
      }
    }
  }
  await pruneOldPostedEvents(env);
}
