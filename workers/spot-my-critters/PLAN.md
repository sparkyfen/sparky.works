# Spot My Critters — Concert digest bot

## Context

A Telegram bot that posts Seattle concerts worth caring about, based on (a) your own Spotify + Last.fm listening and (b) a curated subset of your Last.fm friends' listening. Rebuilds an earlier Cloudflare Worker (`sparkyfen/sparky.works/workers/songkick-telegram-bot`) that broke when Songkick sunset their public API for non-partners.

**Out of scope:**
- Spotify "Friend Activity" (`sp_dc` buddylist) — ToS-violating and unstable. Friend signal comes from Last.fm only.
- Bandsintown / Songkick / Ticketweb — add later only if Ticketmaster coverage gaps appear.

## Architecture

**Stack:** Cloudflare Worker (TypeScript) + Cron Triggers + D1 + KV + Telegram Bot webhook.

```
                   ┌──────────────────────┐
 Telegram ───────▶ │  fetch() handler     │  /friends /follow /unfollow /upcoming
                   │  (webhook router)    │
                   └──────────┬───────────┘
                              │
                      ┌───────▼───────┐
                      │  D1 + KV      │  followed_friends, posted_events,
                      │               │  spotify refresh/access tokens
                      └───────┬───────┘
                              │
 Cron (Mon 10am PT) ─▶ scheduled() pipeline:
   1. My Spotify top + followed artists (OAuth refresh)
   2. My Last.fm top artists
   3. Each followed friend's Last.fm top + recent
   4. Build artist→score map
   5. Ticketmaster events: Seattle, next N days
   6. Match events to artist map; score
   7. Filter by threshold, dedupe vs posted_events
   8. (Optional) SeatGeek price lookup
   9. Post digest; record posted IDs
```

## Data sources

| Source | Auth | Used for |
|---|---|---|
| Spotify Web API | OAuth 2.0 PKCE, refresh token in KV | My `/me/top/artists` (short+medium), `/me/following?type=artist`, `/me/player/recently-played` |
| Last.fm | API key | `user.getTopArtists`, `user.getFriends`, per-friend `user.getTopArtists` + `user.getRecentTracks` |
| Ticketmaster Discovery | API key | `/discovery/v2/events.json?city=Seattle&stateCode=WA&classificationName=music&startDateTime=...&endDateTime=...&size=200` |
| SeatGeek (optional) | client_id | Price lookup (port from prior worker) |
| Telegram Bot | bot token | Digest + webhook commands |

## Scoring

```
score =   3.0 * (artist in my_spotify_top_short)
        + 2.0 * (artist in my_spotify_top_medium)
        + 2.5 * (artist in my_spotify_followed)
        + 2.0 * (artist in my_lastfm_top)
        + 1.5 * (# followed friends with artist in their top-50)
        + 0.5 * (# followed friends who played artist in last 14d)
        + 0.5 * (event in next 7 days)
```

Include if `score >= 2.0`. Weights are tunable constants. Each digest line shows *why* it scored ("you + 3 friends").

Matching: normalize `lower().trim()`, strip `" & the ..."` suffixes. Prefer Spotify/MB external IDs from Ticketmaster `_embedded.attractions[].externalLinks` when present; fall back to normalized name.

## D1 schema

```sql
CREATE TABLE followed_friends (
  lastfm_username TEXT PRIMARY KEY,
  added_at INTEGER NOT NULL
);

CREATE TABLE posted_events (
  ticketmaster_id TEXT PRIMARY KEY,
  posted_at INTEGER NOT NULL,
  event_date TEXT NOT NULL
);
```

KV keys:
- `spotify:refresh_token`
- `spotify:access_token` (TTL = expires_in - 60)

## Telegram commands

- `/friends` — paginated inline keyboard (10 per page, prev/next) with ✅ for followed; toggle via callback_query.
- `/follow <username>` / `/unfollow <username>` — text fallback.
- `/upcoming [days]` — on-demand, default 30 days, read-only (no dedupe write).
- `/ping` — health check.

Webhook: `POST /tg` on the worker. Set once via `setWebhook`.

## File layout

```
spot-my-critters/
├── wrangler.toml            # cron "0 17 * * 1", D1 + KV bindings
├── package.json
├── tsconfig.json
├── schema.sql
└── src/
    ├── index.ts             # scheduled() + fetch()
    ├── env.ts               # Env interface
    ├── spotify.ts           # OAuth refresh, top/followed
    ├── lastfm.ts            # top, friends, recent
    ├── ticketmaster.ts      # events in window
    ├── seatgeek.ts          # price lookup (ported)
    ├── ranking.ts           # artist→score, event scoring
    ├── telegram.ts          # send, webhook router, inline keyboards
    ├── storage.ts           # D1 + KV helpers
    └── pipeline.ts          # digest + /upcoming orchestration
```

## Reuse from prior worker

From `sparkyfen/sparky.works/workers/songkick-telegram-bot/src/index.ts`:
- `sendMessageToTelegram()` — port, but use numeric `chat_id` (no `@` prefix).
- SeatGeek `getPerformance` / `getVenue` / `getEvent` / `getListings` / `getPrice` → `seatgeek.ts`.
- PT date formatting via `toLocaleTimeString('en-us', { timeZone: "America/Los_Angeles", ... })`.
- Cron `"0 17 * * 1"` (Mon 10am PT during PST).

## One-time setup (user does this)

1. **Telegram bot** — @BotFather → bot token + your chat ID. *(you said this is done)*
2. **Spotify app** — reuse your existing app (Spotify caps each developer at one Client ID as of Feb 2026). Add `https://spot-my-critters.sparky.works/oauth/spotify/callback` to redirect URIs. OAuth flow is hosted by the Worker itself at `/oauth/spotify/start?key=<DEBUG_KEY>` — no local script needed.
3. **Last.fm API key** — last.fm/api/account/create.
4. **Ticketmaster Consumer Key** — developer.ticketmaster.com/user/register.
5. **SeatGeek client_id** — seatgeek.com/account/develop (optional, for prices).
6. `wrangler d1 create spot-my-critters` → paste binding.
7. `wrangler kv:namespace create TOKENS` → paste binding.
8. `wrangler secret put ...` for each token.
9. `wrangler deploy`.
10. `setWebhook` → `https://<worker>/tg`.

## Verification

- `GET /debug/digest?days=7&key=<secret>` — dry-run JSON.
- `wrangler dev` + `curl http://localhost:8787/__scheduled?cron=0+17+*+*+1` — force cron locally.
- `vitest` test on `ranking.ts` with fixture data.
- Telegram `/upcoming` smoke after deploy.
- First real Monday run: confirm `posted_events` populates and no reposts the next week.

## Resolved decisions

- **Matching fallback:** normalized-name only when no Spotify/MB link on the Ticketmaster attraction.
- **Friends UX:** ~14 friends today; build with pagination (10/page) from the start so it scales.
