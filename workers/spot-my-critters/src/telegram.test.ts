import { describe, it, expect } from "vitest";
import { renderDigest, USAGE_TRACK, USAGE_UNTRACK } from "./telegram";
import type { Env } from "./env";
import type { ScoredEvent } from "./ranking";

const env = {
  ICS_SIGNING_KEY: "test-signing-key-at-least-32-chars-long",
  SPOTIFY_REDIRECT_URI: "https://example.com/oauth/spotify/callback",
  TIMEZONE: "America/Los_Angeles",
} as unknown as Env;

function scored(n: number): ScoredEvent[] {
  return Array.from({ length: n }, (_, i) => ({
    event: {
      id: `ev${i}`,
      name: `Band ${i} Live`,
      url: `https://www.ticketmaster.com/event/${i}`,
      dateTimeIso: new Date(Date.now() + (i + 1) * 86400 * 1000).toISOString(),
      localDate: "2026-09-01",
      localTime: "20:00:00",
      venueName: "Neumos",
      venueCity: "Seattle",
      attractions: [{ id: `a${i}`, name: `Band ${i}` }],
    },
    matchedName: `Band ${i}`,
    score: 5,
    reasons: ["you listen a lot"],
  })) as ScoredEvent[];
}

// Telegram's limits, which the pre-fix single-message render blew past.
const TG_MAX_CHARS = 4096;
const MAX_ENTITIES_PER_MESSAGE = 50;

const countAnchors = (s: string) => (s.match(/<a href=/g) ?? []).length;

describe("renderDigest chunking", () => {
  it("keeps a small digest in one message", async () => {
    const msgs = await renderDigest(env, scored(3), { headerLabel: "Shows", tz: "UTC" });
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain("<b>Shows</b>");
  });

  it("returns the empty-state message", async () => {
    const msgs = await renderDigest(env, [], { headerLabel: "Shows", tz: "UTC" });
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain("No matching shows");
  });

  it("splits a 100-day-sized digest instead of sending one oversized message", async () => {
    // 60 events is a realistic /upcoming 100 result — this is what returned
    // ENTITIES_TOO_LONG and was then silently swallowed.
    const msgs = await renderDigest(env, scored(60), { headerLabel: "Shows", tz: "UTC" });
    expect(msgs.length).toBeGreaterThan(1);
    for (const m of msgs) {
      expect(m.length).toBeLessThanOrEqual(TG_MAX_CHARS);
      // The entity count, not the char count, is what Telegram actually rejected.
      expect(countAnchors(m)).toBeLessThanOrEqual(MAX_ENTITIES_PER_MESSAGE);
    }
  });

  it("emits every event exactly once across the chunks", async () => {
    const msgs = await renderDigest(env, scored(60), { headerLabel: "Shows", tz: "UTC" });
    const joined = msgs.join("\n");
    for (let i = 0; i < 60; i++) {
      expect(joined.split(`>Band ${i}</a>`).length - 1).toBe(1);
    }
    // Bullets are preserved with no blank chunk.
    expect(joined.split("• ").length - 1).toBe(60);
    for (const m of msgs) expect(m.trim()).not.toBe("");
  });

  it("warns when a signal source degraded, naming it", async () => {
    const msgs = await renderDigest(env, scored(3), {
      headerLabel: "Shows",
      tz: "UTC",
      degraded: ["spotify:top:short", "lastfm:mine"],
    });
    // A degraded source silently lowers scores and drops events — the user has to
    // be able to tell a short list from a complete one.
    expect(msgs[0]).toContain("may be missing");
    expect(msgs[0]).toContain("spotify:top:short");
    expect(msgs[0]).toContain("lastfm:mine");
  });

  it("warns on an empty digest too, so 'no shows' isn't mistaken for complete", async () => {
    const msgs = await renderDigest(env, [], {
      headerLabel: "Shows",
      tz: "UTC",
      degraded: ["lastfm:mine"],
    });
    expect(msgs[0]).toContain("No matching shows");
    expect(msgs[0]).toContain("lastfm:mine");
  });

  it("stays clean when nothing degraded", async () => {
    const msgs = await renderDigest(env, scored(3), { headerLabel: "Shows", tz: "UTC" });
    expect(msgs[0]).not.toContain("may be missing");
    const empty = await renderDigest(env, [], { headerLabel: "Shows", tz: "UTC" });
    expect(empty[0]).not.toContain("may be missing");
  });

  it("puts the header on the first chunk only", async () => {
    const msgs = await renderDigest(env, scored(60), { headerLabel: "Shows", tz: "UTC" });
    expect(msgs[0]!.startsWith("<b>Shows</b>")).toBe(true);
    expect(msgs.slice(1).filter((m) => m.includes("<b>Shows</b>"))).toHaveLength(0);
  });
});

// Telegram's HTML parse mode accepts only this tag set and rejects the entire
// message on anything else, so an unescaped placeholder like <lastfm_username>
// makes the reply vanish with only a 400 in the logs.
const TELEGRAM_HTML_TAGS = new Set([
  "b", "strong", "i", "em", "u", "ins", "s", "strike", "del",
  "span", "tg-spoiler", "a", "code", "pre", "blockquote",
]);

const unsupportedTags = (text: string): string[] =>
  [...text.matchAll(/<\/?([A-Za-z][A-Za-z0-9_-]*)/g)]
    .map((m) => m[1]!.toLowerCase())
    .filter((tag) => !TELEGRAM_HTML_TAGS.has(tag));

describe("usage messages survive parse_mode HTML", () => {
  it.each([
    ["/track", USAGE_TRACK],
    ["/untrack", USAGE_UNTRACK],
  ])("%s usage text contains no unsupported tag", (_cmd, text) => {
    expect(unsupportedTags(text)).toEqual([]);
  });

  it.each([
    ["/track", USAGE_TRACK],
    ["/untrack", USAGE_UNTRACK],
  ])("%s usage text escapes the placeholder angle brackets", (_cmd, text) => {
    expect(text).toContain("&lt;lastfm_username&gt;");
  });

  it("would have caught the original unescaped string", () => {
    expect(unsupportedTags("Usage: /untrack <lastfm_username>")).toEqual(["lastfm_username"]);
  });
});
