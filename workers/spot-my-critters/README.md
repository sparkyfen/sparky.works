# spot-my-critters

Telegram bot that posts a personalized weekly digest of upcoming concerts in your area, ranked by **your** Spotify + Last.fm listening and a hand-picked subset of your **Last.fm friends**' listening. Multi-tenant: each Telegram user registers via DM and gets their own digest.

Runs as a Cloudflare Worker on a weekly cron (Mondays 17:00 UTC), plus on-demand commands.

See [PLAN.md](./PLAN.md) and [PLAN-multitenant.md](./PLAN-multitenant.md) for historical design notes, and [STRETCH-GOALS.md](./STRETCH-GOALS.md) for what's queued up next.

## End-user setup (in Telegram)

1. DM the bot `/start` — registers you.
2. Share your location 📎 → Location → Send Current Location, or `/city Seattle, WA`.
3. `/lastfm <your username>` to set your Last.fm.
4. `/spotify` and tap the link to connect your Spotify account.
5. `/friends` to pick which Last.fm friends to track (paginated keyboard).
6. `/upcoming [days]` for an on-demand peek; weekly digest auto-runs Mondays.

Each event in the digest gets 📅 (Google Calendar) and 🍎 (Apple Calendar `.ics`) quick-add links. Apple links are HMAC-signed to prevent forgery.

## Operator setup (one-time)

### 1. API keys

| Service | Where | What to save |
|---|---|---|
| Telegram Bot | [@BotFather](https://t.me/BotFather) | Bot token |
| Spotify | https://developer.spotify.com/dashboard — reuse one app per developer (Spotify caps each developer at one Client ID). Add `https://<your-domain>/oauth/spotify/callback` to Redirect URIs. | Client ID, Client Secret |
| Last.fm | https://www.last.fm/api/account/create | API key |
| Ticketmaster | https://developer-acct.ticketmaster.com/user/register | Consumer Key |
| SeatGeek (optional, for prices) | https://seatgeek.com/account/develop | Client ID |

### 2. Cloudflare resources

```bash
npm install
npx wrangler login
npx wrangler d1 create spot-my-critters
npx wrangler kv namespace create TOKENS
```

Paste the printed `database_id` and KV `id` into `wrangler.toml`, then:

```bash
npm run db:init
```

### 3. Secrets

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET   # any random string
npx wrangler secret put SPOTIFY_CLIENT_ID
npx wrangler secret put SPOTIFY_CLIENT_SECRET
npx wrangler secret put LASTFM_API_KEY
npx wrangler secret put TICKETMASTER_API_KEY
npx wrangler secret put SEATGEEK_CLIENT_ID        # optional
npx wrangler secret put DEBUG_KEY                 # any random string
npx wrangler secret put ICS_SIGNING_KEY           # any random string (>=32 chars)
```

### 4. Deploy

```bash
npm run deploy
```

### 5. Point Telegram at the worker

```bash
BOT=<your bot token>
WH=<your TELEGRAM_WEBHOOK_SECRET>
URL=<your worker URL>

curl -sS "https://api.telegram.org/bot$BOT/setWebhook" \
  -d "url=$URL/tg" \
  -d "secret_token=$WH"
```

Optionally also set the bot's command menu and descriptions via `setMyCommands`, `setMyDescription`, `setMyShortDescription`.

## Commands

| Command | Effect |
|---|---|
| `/start` | Register and see setup steps |
| `/city <City, State>` | Set your search area (or share location 📎) |
| `/radius <miles>` | Search radius (1–200) |
| `/lastfm <username>` | Set your Last.fm username |
| `/spotify` | Get a one-tap link to connect Spotify |
| `/friends` | Paginated list of Last.fm friends — tap to toggle tracking |
| `/track <name>` / `/untrack <name>` | Text fallback for the friends keyboard |
| `/tracked` | List Last.fm users you're currently tracking |
| `/upcoming [days]` | On-demand digest (default 60, capped at `UPCOMING_MAX_DAYS`) |
| `/ping` | Health check (works in groups too) |

All commands except `/ping` are DM-only.

## Routes

- `POST /tg` — Telegram webhook (secret-token gated)
- `GET /oauth/spotify/start?u=<tg_user_id>` — kicks off Spotify OAuth for that user
- `GET /oauth/spotify/callback` — exchange code, store refresh token in KV
- `GET /ics?n=&s=&id=&loc=&u=&sig=` — HMAC-signed Apple Calendar download
- `GET /debug/digest?u=<tg_user_id>&days=<n>&key=<DEBUG_KEY>` — dry-run digest as JSON

## Dev / test

```bash
npm run typecheck
npm test
npm run dev
# Force cron locally:
curl "http://localhost:8787/__scheduled?cron=0+17+*+*+1"
# Dry-run digest for a specific user:
curl "http://localhost:8787/debug/digest?u=<tg_user_id>&days=7&key=<DEBUG_KEY>"
```

## Tuning

- Scoring weights: `src/ranking.ts` `WEIGHTS`
- Score threshold, default digest window, etc: `wrangler.toml` `[vars]`
- Cache TTLs: `src/cache.ts` callers in `lastfm.ts` and `ticketmaster.ts`
