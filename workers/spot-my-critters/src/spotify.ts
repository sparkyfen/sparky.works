import type { Env } from "./env";
import {
  getSpotifyAccessToken,
  getSpotifyRefreshToken,
  setSpotifyAccessToken,
  setSpotifyRefreshToken,
} from "./storage";

export interface Artist {
  id: string;
  name: string;
}

async function refreshAccessToken(env: Env, tgUserId: number): Promise<string> {
  const refresh = await getSpotifyRefreshToken(env, tgUserId);
  if (!refresh) {
    throw new Error("No Spotify refresh token. DM /spotify to connect.");
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refresh,
  });
  const basic = btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`);
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`Spotify token refresh failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };
  await setSpotifyAccessToken(env, tgUserId, data.access_token, data.expires_in);
  if (data.refresh_token && data.refresh_token !== refresh) {
    await setSpotifyRefreshToken(env, tgUserId, data.refresh_token);
  }
  return data.access_token;
}

async function getAccessToken(env: Env, tgUserId: number): Promise<string> {
  const cached = await getSpotifyAccessToken(env, tgUserId);
  if (cached) return cached;
  return refreshAccessToken(env, tgUserId);
}

async function spotifyGet<T>(env: Env, tgUserId: number, path: string): Promise<T> {
  let token = await getAccessToken(env, tgUserId);
  let res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    token = await refreshAccessToken(env, tgUserId);
    res = await fetch(`https://api.spotify.com/v1${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
  if (!res.ok) {
    throw new Error(`Spotify ${path} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export async function getTopArtists(
  env: Env,
  tgUserId: number,
  timeRange: "short_term" | "medium_term" | "long_term",
  limit = 50
): Promise<Artist[]> {
  const data = await spotifyGet<{ items: Array<{ id: string; name: string }> }>(
    env,
    tgUserId,
    `/me/top/artists?time_range=${timeRange}&limit=${limit}`
  );
  return data.items.map((a) => ({ id: a.id, name: a.name }));
}

export async function getFollowedArtists(env: Env, tgUserId: number): Promise<Artist[]> {
  const artists: Artist[] = [];
  let after: string | null = null;
  for (let i = 0; i < 10; i++) {
    const qs = new URLSearchParams({ type: "artist", limit: "50" });
    if (after) qs.set("after", after);
    const data = await spotifyGet<{
      artists: { items: Array<{ id: string; name: string }>; cursors: { after: string | null } };
    }>(env, tgUserId, `/me/following?${qs.toString()}`);
    for (const a of data.artists.items) artists.push({ id: a.id, name: a.name });
    after = data.artists.cursors.after;
    if (!after) break;
  }
  return artists;
}

export async function getRecentlyPlayedArtists(
  env: Env,
  tgUserId: number,
  limit = 50
): Promise<Artist[]> {
  const data = await spotifyGet<{
    items: Array<{ track: { artists: Array<{ id: string; name: string }> } }>;
  }>(env, tgUserId, `/me/player/recently-played?limit=${limit}`);
  const seen = new Set<string>();
  const out: Artist[] = [];
  for (const item of data.items) {
    for (const a of item.track.artists) {
      if (!seen.has(a.id)) {
        seen.add(a.id);
        out.push(a);
      }
    }
  }
  return out;
}
