import { describe, it, expect } from "vitest";
import { buildSignals, normalizeArtist, rankEvents } from "./ranking";
import type { TMEvent } from "./ticketmaster";

function ev(name: string, id = name, daysOut = 3): TMEvent {
  const d = new Date(Date.now() + daysOut * 86400 * 1000);
  return {
    id,
    name: `${name} Live`,
    url: "https://example.com",
    dateTimeIso: d.toISOString(),
    localDate: d.toISOString().slice(0, 10),
    localTime: "20:00:00",
    venueName: "Neumos",
    venueCity: "Seattle",
    attractions: [{ id: `a-${id}`, name }],
  };
}

describe("normalizeArtist", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeArtist("Florence + The Machine!")).toBe("florence the machine");
  });
  it("strips feat. suffix", () => {
    expect(normalizeArtist("Artist feat. Other")).toBe("artist");
  });
});

describe("rankEvents", () => {
  it("includes events matching my top artists", () => {
    const signals = buildSignals({
      spotifyTopShort: [{ id: "1", name: "Boygenius" }],
      spotifyTopMedium: [],
      spotifyFollowed: [],
      lastfmTopMine: [],
      friendTopByUser: {},
      friendRecentByUser: {},
    });
    const out = rankEvents([ev("Boygenius"), ev("Random Band")], signals, 2.0, Date.now());
    expect(out).toHaveLength(1);
    expect(out[0]!.matchedName).toBe("Boygenius");
    expect(out[0]!.reasons).toContain("in your Spotify top (recent)");
  });

  it("includes events that enough friends care about", () => {
    const signals = buildSignals({
      spotifyTopShort: [],
      spotifyTopMedium: [],
      spotifyFollowed: [],
      lastfmTopMine: [],
      friendTopByUser: {
        alice: ["Slowdive"],
        bob: ["Slowdive"],
        carol: ["Slowdive"],
      },
      friendRecentByUser: {},
    });
    const out = rankEvents([ev("Slowdive")], signals, 2.0, Date.now());
    expect(out).toHaveLength(1);
    expect(out[0]!.score).toBeGreaterThanOrEqual(2.0);
  });

  it("matches an artist billed as support, not just the headliner", () => {
    const bill = ev("Headliner", "bill");
    bill.attractions = [
      { id: "h", name: "Some Headliner" },
      { id: "s", name: "Jane Remover" },
    ];
    const signals = buildSignals({
      spotifyTopShort: [{ id: "1", name: "Jane Remover" }],
      spotifyTopMedium: [],
      spotifyFollowed: [],
      lastfmTopMine: [],
      friendTopByUser: {},
      friendRecentByUser: {},
    });
    // Scoring only attractions[0] made support acts invisible at any radius.
    const out = rankEvents([bill], signals, 2.0, Date.now());
    expect(out).toHaveLength(1);
    expect(out[0]!.matchedName).toBe("Jane Remover");
    expect(out[0]!.reasons).toContain("supporting Some Headliner");
  });

  it("keeps the headliner when it is the better match", () => {
    const bill = ev("Headliner", "bill");
    bill.attractions = [
      { id: "h", name: "Boygenius" },
      { id: "s", name: "Jane Remover" },
    ];
    const signals = buildSignals({
      spotifyTopShort: [{ id: "1", name: "Boygenius" }],
      spotifyTopMedium: [],
      spotifyFollowed: [],
      lastfmTopMine: [],
      friendTopByUser: { alice: ["Jane Remover"] },
      friendRecentByUser: {},
    });
    const out = rankEvents([bill], signals, 2.0, Date.now());
    expect(out[0]!.matchedName).toBe("Boygenius");
    // Not a support billing, so no such note.
    expect(out[0]!.reasons.join()).not.toContain("supporting");
  });

  it("takes the best match rather than summing the bill", () => {
    // 20 days out, so the recency boost doesn't confound the arithmetic.
    const bill = ev("Headliner", "bill", 20);
    bill.attractions = [
      { id: "a", name: "Act A" },
      { id: "b", name: "Act B" },
      { id: "c", name: "Act C" },
    ];
    const signals = buildSignals({
      spotifyTopShort: [],
      spotifyTopMedium: [],
      spotifyFollowed: [],
      lastfmTopMine: [],
      // Each act is one friend's top artist: 1.5 apiece, 4.5 if wrongly summed.
      friendTopByUser: { alice: ["Act A"], bob: ["Act B"], carol: ["Act C"] },
      friendRecentByUser: {},
    });
    // Low threshold so the event surfaces and its score can be inspected.
    const out = rankEvents([bill], signals, 1.0, Date.now());
    expect(out).toHaveLength(1);
    // Best single act (1.5), not the sum of all three (4.5) — a stacked bill
    // must not out-score a genuine match.
    expect(out[0]!.score).toBe(1.5);
    // And at the real threshold it stays out.
    expect(rankEvents([bill], signals, 2.0, Date.now())).toHaveLength(0);
  });

  it("ignores an event with no attractions", () => {
    const bare = ev("Nothing", "bare");
    bare.attractions = [];
    const signals = buildSignals({
      spotifyTopShort: [{ id: "1", name: "Nothing" }],
      spotifyTopMedium: [],
      spotifyFollowed: [],
      lastfmTopMine: [],
      friendTopByUser: {},
      friendRecentByUser: {},
    });
    expect(rankEvents([bare], signals, 2.0, Date.now())).toHaveLength(0);
  });

  it("filters out low-score events", () => {
    const signals = buildSignals({
      spotifyTopShort: [],
      spotifyTopMedium: [],
      spotifyFollowed: [],
      lastfmTopMine: [],
      friendTopByUser: { alice: ["Nobody"] },
      friendRecentByUser: {},
    });
    const out = rankEvents([ev("Nobody", "Nobody", 20)], signals, 2.0, Date.now());
    expect(out).toHaveLength(0);
  });
});
