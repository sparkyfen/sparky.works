import type { Env } from "./env";
import { cached } from "./cache";

const LASTFM_ROOT = "https://ws.audioscrobbler.com/2.0/";

const TTL_TOP_ARTISTS = 6 * 3600; // 6h
const TTL_FRIENDS = 24 * 3600; // 24h
const TTL_RECENT = 30 * 60; // 30m

async function lastfmGet<T>(env: Env, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({
    ...params,
    api_key: env.LASTFM_API_KEY,
    format: "json",
  });
  const res = await fetch(`${LASTFM_ROOT}?${qs.toString()}`);
  if (!res.ok) {
    throw new Error(`Last.fm ${params.method} failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as T & { error?: number; message?: string };
  if (typeof (data as any).error === "number") {
    throw new Error(`Last.fm ${params.method} error ${(data as any).error}: ${(data as any).message}`);
  }
  return data;
}

export async function getUserTopArtists(
  env: Env,
  username: string,
  limit = 50,
  period: "overall" | "7day" | "1month" | "3month" | "6month" | "12month" = "3month"
): Promise<string[]> {
  return cached(env, `lfm:top:${username}:${period}:${limit}`, TTL_TOP_ARTISTS, async () => {
    const data = await lastfmGet<{
      topartists?: { artist: Array<{ name: string }> };
    }>(env, {
      method: "user.getTopArtists",
      user: username,
      period,
      limit: String(limit),
    });
    return (data.topartists?.artist ?? []).map((a) => a.name);
  });
}

export async function getFriends(env: Env, username: string, limit = 200): Promise<string[]> {
  return cached(env, `lfm:friends:${username}:${limit}`, TTL_FRIENDS, async () => {
    const data = await lastfmGet<{
      friends?: { user: Array<{ name: string }> };
    }>(env, {
      method: "user.getFriends",
      user: username,
      limit: String(limit),
    });
    return (data.friends?.user ?? []).map((u) => u.name);
  });
}

export async function getRecentArtistsSince(
  env: Env,
  username: string,
  sinceUnixSeconds: number,
  limit = 200
): Promise<string[]> {
  // Bucket `since` to the nearest 30min so the cache key actually hits across calls.
  const bucket = Math.floor(sinceUnixSeconds / 1800) * 1800;
  return cached(env, `lfm:recent:${username}:${bucket}:${limit}`, TTL_RECENT, async () => {
    const data = await lastfmGet<{
      recenttracks?: { track: Array<{ artist: { "#text": string } | { name: string } }> };
    }>(env, {
      method: "user.getRecentTracks",
      user: username,
      from: String(sinceUnixSeconds),
      limit: String(limit),
    });
    const tracks = data.recenttracks?.track ?? [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of tracks) {
      const name = "#text" in t.artist ? t.artist["#text"] : t.artist.name;
      if (name && !seen.has(name)) {
        seen.add(name);
        out.push(name);
      }
    }
    return out;
  });
}
