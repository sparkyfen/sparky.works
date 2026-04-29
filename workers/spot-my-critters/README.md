# spot-my-critters

Telegram bot that posts Seattle concerts worth caring about, ranked by **your** Spotify + Last.fm listening and a hand-picked subset of your **Last.fm friends**' listening. Runs as a Cloudflare Worker on a weekly cron, plus on-demand Telegram commands.

See [PLAN.md](./PLAN.md) for architecture and scoring details.

## One-time setup

### 1. Get API keys

| Service | Where | What to save |
|---|---|---|
| Telegram Bot | [@BotFather](https://t.me/BotFather) | Bot token, your chat ID |
| Spotify | https://developer.spotify.com/dashboard — **reuse your existing app** (Spotify caps each developer at one Client ID as of Feb 2026). In Edit Settings → Redirect URIs, **add** `https://spot-my-critters.sparky.works/oauth/spotify/callback` alongside any existing entries. | Client ID, Client Secret |
| Last.fm | https://www.last.fm/api/account/create | API key |
| Ticketmaster | https://developer-acct.ticketmaster.com/user/register | Consumer Key |
| SeatGeek (optional, for prices) | https://seatgeek.com/account/develop | Client ID |

### 2. Install & scaffold Cloudflare resources

```bash
npm install
wrangler login              # if not already
wrangler d1 create spot-my-critters
wrangler kv:namespace create TOKENS
```

Paste the printed `database_id` and KV `id` into `wrangler.toml`, then:

```bash
npm run db:init             # creates tables in D1
```

Set `LASTFM_USERNAME` in `wrangler.toml` to your Last.fm username.

### 3. Set secrets

```bash
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_CHAT_ID
wrangler secret put TELEGRAM_WEBHOOK_SECRET      # any random string
wrangler secret put SPOTIFY_CLIENT_ID
wrangler secret put SPOTIFY_CLIENT_SECRET
wrangler secret put LASTFM_API_KEY
wrangler secret put TICKETMASTER_API_KEY
wrangler secret put SEATGEEK_CLIENT_ID           # optional
wrangler secret put DEBUG_KEY                    # any random string
```

### 4. Deploy

```bash
npm run deploy
```

### 5. One-time Spotify OAuth (Worker-hosted)

In your browser, open:

```
https://spot-my-critters.sparky.works/oauth/spotify/start?key=<DEBUG_KEY>
```

Authorize Spotify. The Worker exchanges the code and writes the refresh token straight to KV. You'll see a "Spotify connected ✓" page.

### 6. Point Telegram at the worker

```bash
BOT=<your bot token>
WH_SECRET=<same value you set as TELEGRAM_WEBHOOK_SECRET>
WORKER_URL=<your worker URL, e.g. https://spot-my-critters.<sub>.workers.dev>

curl -sS "https://api.telegram.org/bot$BOT/setWebhook" \
  -d "url=$WORKER_URL/tg" \
  -d "secret_token=$WH_SECRET"
```

## Commands

- `/ping` — health check
- `/friends` — paginated list of Last.fm friends; tap to toggle follow
- `/follow <username>` / `/unfollow <username>` — text fallback
- `/followed` — list everyone you currently follow
- `/upcoming [days]` — on-demand digest (default 30, capped at `UPCOMING_MAX_DAYS`)

## Dev / test

```bash
npm run typecheck
npm test
npm run dev                             # wrangler dev
# Force cron locally:
curl "http://localhost:8787/__scheduled?cron=0+17+*+*+1"
# Dry-run digest:
curl "http://localhost:8787/debug/digest?days=7&key=<DEBUG_KEY>"
```

## Tuning

All knobs live in `wrangler.toml` `[vars]` and `src/ranking.ts` `WEIGHTS`.
