import type { Env } from "./env";
import { setSpotifyRefreshToken } from "./storage";

const SCOPES = ["user-top-read", "user-follow-read", "user-read-recently-played"].join(" ");

export function spotifyAuthorizeUrl(env: Env, state: string): string {
  const u = new URL("https://accounts.spotify.com/authorize");
  u.searchParams.set("client_id", env.SPOTIFY_CLIENT_ID);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", env.SPOTIFY_REDIRECT_URI);
  u.searchParams.set("scope", SCOPES);
  u.searchParams.set("state", state);
  return u.toString();
}

export async function exchangeSpotifyCode(
  env: Env,
  tgUserId: number,
  code: string
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: env.SPOTIFY_REDIRECT_URI,
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
    throw new Error(`Spotify code exchange failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { refresh_token?: string };
  if (!data.refresh_token) throw new Error("Spotify did not return a refresh_token");
  await setSpotifyRefreshToken(env, tgUserId, data.refresh_token);
  return data.refresh_token;
}
