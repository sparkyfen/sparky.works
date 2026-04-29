# Stretch goals & future features

Living list. Roughly grouped by effort/impact. Order within a group is rough priority.

---

## Already discussed in this session

### Result caching for `/upcoming`
**Why**: each call hits Ticketmaster + Spotify + Last.fm (1 + 2N requests for N followed friends). With ~20 friends you're already near the 50-subrequest free-tier worker cap.
**Sketch**: KV cache keyed by `(city, days-bucket)` for Ticketmaster, `(lastfm_user)` for friend top/recent. 5–15 min TTL. Skip cache on cron run.
**Effort**: small.

### Registration allowlist
**Why**: bot is currently open — anyone who finds it can register and get personalized digests, which costs subrequests.
**Sketch**: env var `ALLOWED_TG_USER_IDS = "728854954,…"`. `/start` rejects with "ask the owner for access" if not on the list.
**Effort**: tiny.

### Per-user city
**Why**: hardcoded Seattle limits the bot to one geography. Real generalization.
**Sketch**: `users` table gets `city`, `state_code`, `radius_miles` columns. `/city <name>` command. Ticketmaster fetch becomes per-user (kills the "fetch once, score per user" cron optimization — needs grouping by city).
**Effort**: medium.

### SeatGeek price lookup
**Why**: the integration is already wired (`pipeline.ts` + `seatgeek.ts`); just need the API key.
**Sketch**: `npx wrangler secret put SEATGEEK_CLIENT_ID`.
**Effort**: trivial.

---

## High value, small effort

### `/blacklist <artist>` — user-level mute
**Why**: false positives feel bad. Letting users opt out of an artist they don't want to see again is a clean escape hatch.
**Sketch**: `user_blacklist (tg_user_id, artist_norm)` table. `scoreEvent` returns null when the normalized headline matches. `/blacklist <name>` and `/unblacklist <name>` commands; `/blacklist` with no arg lists current entries.
**Effort**: small.

### `/why <artist>` — explain why an event did or didn't surface
**Why**: helps debug both ranking and your own signal coverage ("oh, I haven't listened to them on Spotify in 6 months").
**Sketch**: command takes an artist name, runs the same signal collection, prints which weights would/wouldn't fire and the resulting score.
**Effort**: small.

### Mid-week alerts for high-confidence matches
**Why**: weekly digest is fine, but a near-cert match (score >= 4.0) shouldn't wait 6 days.
**Sketch**: separate cron (daily?) that runs the digest with a higher threshold; relies on existing `posted_events` dedupe to avoid re-pinging.
**Effort**: small. Tune the threshold by feel.

### `.ics` "add to calendar" link per event
**Why**: clicking through to TM and re-typing a calendar entry is friction.
**Sketch**: worker route `/ics/<event_id>` returns a generated .ics; render an extra link in the digest line.
**Effort**: small.

---

## Bigger features

### Bandsintown / Songkick as second event source
**Why**: Ticketmaster misses smaller venues — the very thing a Seattle indie listener cares about. (Your previous `songkick-telegram-bot` worker presumably hit this.)
**Sketch**: new module `src/bandsintown.ts` returning the same `TMEvent` shape; pipeline merges + dedupes by `(name, venue, localDate)`.
**Effort**: medium. Real value here.

### Tour-dates-anywhere mode
**Why**: for your top artists, knowing they're touring at all is useful for trip planning, even if not Seattle.
**Sketch**: opt-in flag per user. Separate command `/tours` that runs an artist-first query (vs the current city-first query) for your spotify-top artists only.
**Effort**: medium.

### Setlist.fm "typically plays" line per event
**Why**: useful texture — "are they playing the new album or the deep cuts?"
**Sketch**: lookup last 3 setlists for the artist; surface top 3 most-played songs as a small italic line under the event.
**Effort**: small-medium. Setlist.fm rate limits matter.

### Cross-user taste recommendations
**Why**: once you have multiple users, "3 other people on this bot are excited about Slowdive" is a fun signal without exposing identities.
**Sketch**: aggregate (privately) which artists are scoring high across registered users; surface as a soft signal weighted small.
**Effort**: medium. Privacy/UX call.

### Tiny web dashboard at `/dashboard`
**Why**: the Telegram inline keyboard is fine for friend toggles but bad for browsing 100 events with filters. A web view auth'd via Telegram login widget would be nicer.
**Sketch**: HTML rendered server-side, Telegram login widget for auth, same data pulled from D1.
**Effort**: medium-large.

---

## Long shots / nice-to-haves

### Spotify Release Radar / Discover Weekly as signals
**Why**: catches artists you'd like but haven't surfaced yet. Spotify already does the heavy lifting.
**Sketch**: pull those playlists' artists; small weight. Watch out: these change weekly.
**Effort**: small to add, but iffy on signal quality.

### Price-drop notifications
**Why**: someone who reacted to an event might want to know if it dropped below their threshold.
**Sketch**: store reactions per user; daily SeatGeek re-poll; DM if cheaper than baseline.
**Effort**: medium. Adds a reaction UX layer.

### Group/share recommendations
**Why**: "look at this show" is naturally a group activity.
**Sketch**: Telegram inline mode (`@SparkyMoosicBot Slowdive`) returns a card the user can share into any chat.
**Effort**: medium.

### Year-end "shows I missed"
**Why**: a fun retrospective.
**Sketch**: cron at year boundary, query D1 + apply current ranking against past events. Could use Last.fm "first scrobbled" timestamps to detect "you started liking X *after* their show came through here."
**Effort**: small (mostly query work).

---

## Recommendation

If I were picking the next three: **caching**, **`/blacklist`**, **mid-week alerts**. They're all small, all immediately useful, and they together harden the daily-usability of the bot before adding new sources.
