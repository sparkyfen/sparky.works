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
