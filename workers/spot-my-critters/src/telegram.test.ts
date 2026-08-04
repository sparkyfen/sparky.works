import { describe, it, expect } from "vitest";
import { renderDigest } from "./telegram";
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

  it("puts the header on the first chunk only", async () => {
    const msgs = await renderDigest(env, scored(60), { headerLabel: "Shows", tz: "UTC" });
    expect(msgs[0]!.startsWith("<b>Shows</b>")).toBe(true);
    expect(msgs.slice(1).filter((m) => m.includes("<b>Shows</b>"))).toHaveLength(0);
  });
});
