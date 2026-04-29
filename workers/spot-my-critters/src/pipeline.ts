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
  listFollowedFriends,
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

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.log(`pipeline step failed: ${(err as Error).message}`);
    return fallback;
  }
}

async function gatherSignalsForUser(env: Env, user: User) {
  const hasSpotify = !!(await getSpotifyRefreshToken(env, user.tgUserId));
  const [topShort, topMedium, followed] = hasSpotify
    ? await Promise.all([
        safe(() => getTopArtists(env, user.tgUserId, "short_term", 50), [] as Artist[]),
        safe(() => getTopArtists(env, user.tgUserId, "medium_term", 50), [] as Artist[]),
        safe(() => getFollowedArtists(env, user.tgUserId), [] as Artist[]),
      ])
    : [[] as Artist[], [] as Artist[], [] as Artist[]];

  const lastfmMine = user.lastfmUsername
    ? await safe(() => getUserTopArtists(env, user.lastfmUsername!, 50), [] as string[])
    : [];

  const friends = await listFollowedFriends(env, user.tgUserId);
  const since = Math.floor(Date.now() / 1000) - 14 * 86400;
  const friendTopByUser: Record<string, string[]> = {};
  const friendRecentByUser: Record<string, string[]> = {};

  await Promise.all(
    friends.map(async (u) => {
      friendTopByUser[u] = await safe(() => getUserTopArtists(env, u, 50, "3month"), []);
      friendRecentByUser[u] = await safe(() => getRecentArtistsSince(env, u, since, 200), []);
    })
  );

  return buildSignals({
    spotifyTopShort: topShort,
    spotifyTopMedium: topMedium,
    spotifyFollowed: followed,
    lastfmTopMine: lastfmMine,
    friendTopByUser,
    friendRecentByUser,
  });
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
  const signals = await gatherSignalsForUser(env, user);
  const scored = rankEvents(events, signals, threshold, now.getTime());

  const filtered: ScoredEvent[] = [];
  for (const s of scored) {
    if (opts.writeDedupe && (await hasPostedEvent(env, user.tgUserId, s.event.id))) continue;
    filtered.push(s);
  }

  const prices = new Map<string, number>();
  if (opts.withPrices && env.SEATGEEK_CLIENT_ID) {
    await Promise.all(
      filtered.map(async (s) => {
        if (!s.event.venueName) return;
        const p = await safe(
          () => lookupLowestPrice(env, s.matchedName, s.event.venueName!),
          undefined as number | undefined
        );
        if (p !== undefined) prices.set(s.event.id, p);
      })
    );
  }

  const msg = renderDigest(filtered, {
    headerLabel: opts.headerLabel,
    tz: env.TIMEZONE,
    prices,
  });
  await sendMessage(env, msg, { chatId: user.tgUserId });

  if (opts.writeDedupe && filtered.length > 0) {
    await recordPostedEvents(
      env,
      user.tgUserId,
      filtered.map((s) => ({ id: s.event.id, eventDate: s.event.localDate }))
    );
  }

  return filtered;
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
  const now = new Date();
  const end = new Date(now.getTime() + opts.days * 86400 * 1000);
  const events = await getEventsInWindow(env, now, end);
  return runDigestForUser(env, user, events, opts);
}

export async function fetchEventsWindow(env: Env, days: number): Promise<TMEvent[]> {
  const now = new Date();
  const end = new Date(now.getTime() + days * 86400 * 1000);
  return getEventsInWindow(env, now, end);
}

export { pruneOldPostedEvents };
