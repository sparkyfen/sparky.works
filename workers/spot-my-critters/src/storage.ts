import type { Env } from "./env";

export interface User {
  tgUserId: number;
  tgUsername: string | null;
  lastfmUsername: string | null;
  city: string | null;
  stateCode: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusMiles: number | null;
  registeredAt: number;
}

interface UserRow {
  tg_user_id: number;
  tg_username: string | null;
  lastfm_username: string | null;
  city: string | null;
  state_code: string | null;
  latitude: number | null;
  longitude: number | null;
  radius_miles: number | null;
  registered_at: number;
}

const USER_COLUMNS =
  "tg_user_id, tg_username, lastfm_username, city, state_code, latitude, longitude, radius_miles, registered_at";

function rowToUser(r: UserRow): User {
  return {
    tgUserId: r.tg_user_id,
    tgUsername: r.tg_username,
    lastfmUsername: r.lastfm_username,
    city: r.city,
    stateCode: r.state_code,
    latitude: r.latitude,
    longitude: r.longitude,
    radiusMiles: r.radius_miles,
    registeredAt: r.registered_at,
  };
}

export async function getUser(env: Env, tgUserId: number): Promise<User | null> {
  const row = await env.DB.prepare(
    `SELECT ${USER_COLUMNS} FROM users WHERE tg_user_id = ?1`
  )
    .bind(tgUserId)
    .first<UserRow>();
  return row ? rowToUser(row) : null;
}

export async function registerUser(
  env: Env,
  tgUserId: number,
  tgUsername: string | null
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO users (tg_user_id, tg_username, registered_at)
     VALUES (?1, ?2, ?3)
     ON CONFLICT(tg_user_id) DO UPDATE SET tg_username = excluded.tg_username`
  )
    .bind(tgUserId, tgUsername, Math.floor(Date.now() / 1000))
    .run();
}

export async function setLastfmUsername(
  env: Env,
  tgUserId: number,
  lastfmUsername: string
): Promise<void> {
  await env.DB.prepare("UPDATE users SET lastfm_username = ?1 WHERE tg_user_id = ?2")
    .bind(lastfmUsername, tgUserId)
    .run();
}

export async function listAllUsers(env: Env): Promise<User[]> {
  const { results } = await env.DB.prepare(
    `SELECT ${USER_COLUMNS} FROM users`
  ).all<UserRow>();
  return results.map(rowToUser);
}

export async function setUserLocation(
  env: Env,
  tgUserId: number,
  loc: {
    city: string | null;
    stateCode: string | null;
    latitude: number;
    longitude: number;
  }
): Promise<void> {
  await env.DB.prepare(
    `UPDATE users SET city = ?1, state_code = ?2, latitude = ?3, longitude = ?4 WHERE tg_user_id = ?5`
  )
    .bind(loc.city, loc.stateCode, loc.latitude, loc.longitude, tgUserId)
    .run();
}

export async function setUserRadius(
  env: Env,
  tgUserId: number,
  radiusMiles: number
): Promise<void> {
  await env.DB.prepare("UPDATE users SET radius_miles = ?1 WHERE tg_user_id = ?2")
    .bind(radiusMiles, tgUserId)
    .run();
}

// --- Tracked Last.fm users (per Telegram user) ---

export async function listTrackedLastfmUsers(
  env: Env,
  tgUserId: number
): Promise<string[]> {
  const { results } = await env.DB.prepare(
    "SELECT lastfm_username FROM tracked_lastfm_users WHERE tg_user_id = ?1 ORDER BY lastfm_username"
  )
    .bind(tgUserId)
    .all<{ lastfm_username: string }>();
  return results.map((r) => r.lastfm_username);
}

export async function isLastfmUserTracked(
  env: Env,
  tgUserId: number,
  username: string
): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT 1 FROM tracked_lastfm_users WHERE tg_user_id = ?1 AND lastfm_username = ?2"
  )
    .bind(tgUserId, username)
    .first();
  return row !== null;
}

export async function trackLastfmUser(
  env: Env,
  tgUserId: number,
  username: string
): Promise<void> {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO tracked_lastfm_users (tg_user_id, lastfm_username, added_at) VALUES (?1, ?2, ?3)"
  )
    .bind(tgUserId, username, Math.floor(Date.now() / 1000))
    .run();
}

export async function untrackLastfmUser(
  env: Env,
  tgUserId: number,
  username: string
): Promise<void> {
  await env.DB.prepare(
    "DELETE FROM tracked_lastfm_users WHERE tg_user_id = ?1 AND lastfm_username = ?2"
  )
    .bind(tgUserId, username)
    .run();
}

// --- Posted events (per user) ---

export async function hasPostedEvent(
  env: Env,
  tgUserId: number,
  eventId: string
): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT 1 FROM posted_events WHERE tg_user_id = ?1 AND ticketmaster_id = ?2"
  )
    .bind(tgUserId, eventId)
    .first();
  return row !== null;
}

export async function recordPostedEvents(
  env: Env,
  tgUserId: number,
  events: Array<{ id: string; eventDate: string }>
): Promise<void> {
  if (events.length === 0) return;
  const now = Math.floor(Date.now() / 1000);
  const stmt = env.DB.prepare(
    "INSERT OR IGNORE INTO posted_events (tg_user_id, ticketmaster_id, posted_at, event_date) VALUES (?1, ?2, ?3, ?4)"
  );
  await env.DB.batch(events.map((e) => stmt.bind(tgUserId, e.id, now, e.eventDate)));
}

export async function pruneOldPostedEvents(env: Env): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await env.DB.prepare("DELETE FROM posted_events WHERE event_date < ?1")
    .bind(today)
    .run();
}

// --- KV: Spotify tokens (per user) ---

const refreshKey = (tgUserId: number) => `spotify:refresh:${tgUserId}`;
const accessKey = (tgUserId: number) => `spotify:access:${tgUserId}`;

export async function getSpotifyRefreshToken(
  env: Env,
  tgUserId: number
): Promise<string | null> {
  return env.TOKENS.get(refreshKey(tgUserId));
}

export async function setSpotifyRefreshToken(
  env: Env,
  tgUserId: number,
  token: string
): Promise<void> {
  await env.TOKENS.put(refreshKey(tgUserId), token);
}

export async function getSpotifyAccessToken(
  env: Env,
  tgUserId: number
): Promise<string | null> {
  return env.TOKENS.get(accessKey(tgUserId));
}

export async function setSpotifyAccessToken(
  env: Env,
  tgUserId: number,
  token: string,
  expiresInSeconds: number
): Promise<void> {
  const ttl = Math.max(60, expiresInSeconds - 60);
  await env.TOKENS.put(accessKey(tgUserId), token, { expirationTtl: ttl });
}
