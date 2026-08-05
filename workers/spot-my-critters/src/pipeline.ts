import type { Env } from "./env";
import {
  getFollowedArtists,
  getTopArtists,
  type Artist,
} from "./spotify";
import {
  getRecentArtistsSince,
  getUserTopArtists,
} from "./lastfm";
import { buildSignals, rankEvents, type ScoredEvent } from "./ranking";
import { getEventsInWindow, type TMEvent } from "./ticketmaster";
import { lookupLowestPrice } from "./seatgeek";
import {
  getSpotifyRefreshToken,
  getUser,
  hasPostedEvent,
  listTrackedLastfmUsers,
  pruneOldPostedEvents,
  recordPostedEvents,
  type User,
} from "./storage";
import { renderDigest, sendMessage } from "./telegram";

export interface DigestOptions {
  days: number;
  writeDedupe: boolean;
  headerLabel: string;
  withPrices: boolean;
}

/**
 * A failed signal source silently becomes empty, which drops an artist's score and
 * makes events vanish for no visible reason. Record which source degraded so the
 * loss is attributable rather than mysterious.
 */
async function safe<T>(
  source: string,
  fn: () => Promise<T>,
  fallback: T,
  degraded: Set<string>
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    degraded.add(source);
    console.log(`signal source degraded: ${source}: ${(err as Error).message}`);
    return fallback;
  }
}

async function gatherSignalsForUser(env: Env, user: User) {
  const degraded = new Set<string>();
  const hasSpotify = !!(await getSpotifyRefreshToken(env, user.tgUserId));
  const [topShort, topMedium, followed] = hasSpotify
    ? await Promise.all([
        safe("spotify:top:short", () => getTopArtists(env, user.tgUserId, "short_term", 50), [] as Artist[], degraded),
        safe("spotify:top:medium", () => getTopArtists(env, user.tgUserId, "medium_term", 50), [] as Artist[], degraded),
        safe("spotify:followed", () => getFollowedArtists(env, user.tgUserId), [] as Artist[], degraded),
      ])
    : [[] as Artist[], [] as Artist[], [] as Artist[]];

  const lastfmMine = user.lastfmUsername
    ? await safe("lastfm:mine", () => getUserTopArtists(env, user.lastfmUsername!, 50), [] as string[], degraded)
    : [];

  const friends = await listTrackedLastfmUsers(env, user.tgUserId);
  const since = Math.floor(Date.now() / 1000) - 14 * 86400;
  const friendTopByUser: Record<string, string[]> = {};
  const friendRecentByUser: Record<string, string[]> = {};

  await Promise.all(
    friends.map(async (u) => {
      friendTopByUser[u] = await safe(`lastfm:top:${u}`, () => getUserTopArtists(env, u, 50, "3month"), [], degraded);
      friendRecentByUser[u] = await safe(`lastfm:recent:${u}`, () => getRecentArtistsSince(env, u, since, 200), [], degraded);
    })
  );

  const signals = buildSignals({
    spotifyTopShort: topShort,
    spotifyTopMedium: topMedium,
    spotifyFollowed: followed,
    lastfmTopMine: lastfmMine,
    friendTopByUser,
    friendRecentByUser,
  });
  if (degraded.size > 0) {
    console.log(`user=${user.tgUserId} signals degraded: ${[...degraded].join(", ")}`);
  }
  return { signals, degraded: [...degraded] };
}

export interface PerUserContext {
  user: User;
  events: TMEvent[];
}

export async function runDigestForUser(
  env: Env,
  user: User,
  events: TMEvent[],
  opts: DigestOptions
): Promise<ScoredEvent[]> {
  const threshold = parseFloat(env.SCORE_THRESHOLD) || 2.0;
  const now = new Date();
  const { signals, degraded } = await gatherSignalsForUser(env, user);
  const scored = rankEvents(events, signals, threshold, now.getTime());
  console.log(
    `user=${user.tgUserId}: ${events.length} events in, ${scored.length} above threshold ${threshold}`
  );

  const filtered: ScoredEvent[] = [];
  for (const s of scored) {
    if (opts.writeDedupe && (await hasPostedEvent(env, user.tgUserId, s.event.id))) continue;
    filtered.push(s);
  }

  const prices = new Map<string, number>();
  if (opts.withPrices && env.SEATGEEK_CLIENT_ID) {
    const priceDegraded = new Set<string>();
    await Promise.all(
      filtered.map(async (s) => {
        if (!s.event.venueName) return;
        const p = await safe(
          "seatgeek:price",
          () => lookupLowestPrice(env, s.matchedName, s.event.venueName!),
          undefined as number | undefined,
          priceDegraded
        );
        if (p !== undefined) prices.set(s.event.id, p);
      })
    );
  }

  const messages = await renderDigest(env, filtered, {
    headerLabel: opts.headerLabel,
    tz: env.TIMEZONE,
    prices,
    degraded,
  });
  // Sequential, not Promise.all — Telegram orders by arrival, and a parallel burst
  // both scrambles the digest and risks 429s.
  for (const msg of messages) {
    await sendMessage(env, msg, { chatId: user.tgUserId });
  }

  if (opts.writeDedupe && filtered.length > 0) {
    await recordPostedEvents(
      env,
      user.tgUserId,
      filtered.map((s) => ({ id: s.event.id, eventDate: s.event.localDate }))
    );
  }

  return filtered;
}

function userLocation(user: User): { latitude: number; longitude: number; radiusMiles: number } | null {
  if (user.latitude == null || user.longitude == null || user.radiusMiles == null) return null;
  return { latitude: user.latitude, longitude: user.longitude, radiusMiles: user.radiusMiles };
}

export async function runDigestOnDemand(
  env: Env,
  tgUserId: number,
  opts: DigestOptions
): Promise<ScoredEvent[]> {
  const user = await getUser(env, tgUserId);
  if (!user) {
    await sendMessage(env, "DM /start to register first.", { chatId: tgUserId });
    return [];
  }
  const loc = userLocation(user);
  if (!loc) {
    await sendMessage(
      env,
      "Set your location first — share a location 📎 or use /city &lt;City, State&gt;.",
      { chatId: tgUserId }
    );
    return [];
  }
  const now = new Date();
  const end = new Date(now.getTime() + opts.days * 86400 * 1000);
  const events = await getEventsInWindow(env, loc, now, end);
  return runDigestForUser(env, user, events, opts);
}

export async function fetchEventsWindow(
  env: Env,
  query: { latitude: number; longitude: number; radiusMiles: number },
  days: number
): Promise<TMEvent[]> {
  const now = new Date();
  const end = new Date(now.getTime() + days * 86400 * 1000);
  return getEventsInWindow(env, query, now, end);
}

export { pruneOldPostedEvents };
