# Plan: Multi-tenant bot

Each Telegram user gets their own Spotify auth, Last.fm username, followed-friends list, and weekly digest in their DM. Seattle is hardcoded for everyone (mention in bot description).

## Schema (D1)

```sql
CREATE TABLE users (
  tg_user_id INTEGER PRIMARY KEY,
  tg_username TEXT,
  lastfm_username TEXT,
  registered_at INTEGER NOT NULL
);

CREATE TABLE followed_friends (
  tg_user_id INTEGER NOT NULL,
  lastfm_username TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (tg_user_id, lastfm_username)
);

CREATE TABLE posted_events (
  tg_user_id INTEGER NOT NULL,
  ticketmaster_id TEXT NOT NULL,
  posted_at INTEGER NOT NULL,
  event_date TEXT NOT NULL,
  PRIMARY KEY (tg_user_id, ticketmaster_id)
);
CREATE INDEX idx_posted_events_date ON posted_events(event_date);
```

Migration: drop existing tables (no real data yet) and re-init via `npm run db:init`.

## KV (Spotify tokens)

- `spotify:refresh:{tg_user_id}` (no TTL)
- `spotify:access:{tg_user_id}` (TTL = expires_in − 60)

OAuth `state` carries `tg_user_id` so the callback can write to the right key.

## Onboarding flow

1. User DMs `/start` → `users` row created (tg_user_id, tg_username); reply explains the 3 steps + Seattle-only note.
2. `/lastfm <username>` → set `users.lastfm_username`. Required before `/friends`.
3. `/spotify` → returns OAuth link with `state = randomUUID + tg_user_id` stored in KV briefly.

Other commands (`/friends`, `/follow`, `/unfollow`, `/followed`, `/upcoming`) require `/start` first — bot replies "DM /start to register" otherwise.

## Pipeline

`runDigest` becomes per-user: takes `tg_user_id`, loads that user's Spotify/Last.fm/follows, posts to that user's DM. Ticketmaster fetch is shared (Seattle, fixed window) — fetch once per cron invocation, score per user.

## Cron

Iterate registered users; for each, run digest into their DM. Skip users who haven't completed Spotify auth + Last.fm setup.

## Commands (post-change)

| Command | Scope | Behavior |
|---|---|---|
| `/start` | DM only | register the user |
| `/lastfm <name>` | DM only | save lastfm username |
| `/spotify` | DM only | OAuth link |
| `/friends` | DM only | toggle keyboard for *your* lastfm friends |
| `/follow <name>` | DM only | follow lastfm user |
| `/unfollow <name>` | DM only | unfollow |
| `/followed` | DM only | list |
| `/upcoming [days]` | DM only | run digest now |
| `/ping` | anywhere | open |

In groups: bot ignores everything except `/ping` (digests are personal).

## Env / config changes

- Drop `TELEGRAM_CHAT_ID` (no longer used).
- Drop `LASTFM_USERNAME` from `wrangler.toml` (per-user now).
- Drop `OWNER_TELEGRAM_USER_ID` (no special owner anymore — every user is their own owner).

Bot description gets updated to mention Seattle-only.

## Files touched

- `schema.sql` — new tables
- `src/storage.ts` — every fn takes `tgUserId`; add user CRUD
- `src/spotify.ts` + `src/oauth.ts` — token storage keyed by user; state encodes user
- `src/pipeline.ts` — `runDigest(env, tgUserId, opts)`; cron iterates users
- `src/telegram.ts` — new commands, registration gate, group restriction
- `src/index.ts` — cron loop, OAuth state parsing
- `src/env.ts` + `wrangler.toml` — drop unused vars

## Out of scope

- Per-user city / region.
- Migrating my existing followed-friends list (re-add via `/friends`).
- Sharing/recommending across users.
