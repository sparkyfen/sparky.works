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
  const events = await fetchEventsWindow(env, days);
  for (const user of users) {
    try {
      const out = await runDigestForUser(env, user, events, {
        days,
        writeDedupe: true,
        headerLabel: `🎸 Seattle shows — next ${days} days`,
        withPrices: true,
      });
      console.log(`digest user=${user.tgUserId}: posted ${out.length} events`);
    } catch (e) {
      console.log(`digest user=${user.tgUserId} failed: ${(e as Error).message}`);
    }
  }
  await pruneOldPostedEvents(env);
}
