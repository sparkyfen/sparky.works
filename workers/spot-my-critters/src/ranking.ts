import type { TMEvent } from "./ticketmaster";

export const WEIGHTS = {
  spotifyTopShort: 3.0,
  spotifyTopMedium: 2.0,
  spotifyFollowed: 2.5,
  lastfmTopMine: 2.0,
  friendTop: 1.5,
  friendRecent: 0.5,
  recencyBoost: 0.5,
};

export interface Signals {
  spotifyTopShort: Set<string>; // normalized names
  spotifyTopMedium: Set<string>;
  spotifyFollowed: Set<string>;
  spotifyIds: Set<string>; // union of my spotify artist ids (top + followed)
  lastfmTopMine: Set<string>;
  friendTop: Map<string, string[]>; // normalized artist -> friend names with it in top
  friendRecent: Map<string, string[]>; // normalized artist -> friend names with a recent play
}

export interface ScoredEvent {
  event: TMEvent;
  score: number;
  reasons: string[];
  matchedName: string;
}

function formatNames(names: string[]): string {
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]}, and ${names[2]}`;
  return `${names[0]}, ${names[1]}, +${names.length - 2} more`;
}

export function normalizeArtist(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+&\s+the\s+.*$/i, "")
    .replace(/\s+and\s+the\s+.*$/i, "")
    .replace(/\s+feat\.?\s+.*$/i, "")
    .replace(/[^\w\s]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

export function buildSignals(input: {
  spotifyTopShort: Array<{ id: string; name: string }>;
  spotifyTopMedium: Array<{ id: string; name: string }>;
  spotifyFollowed: Array<{ id: string; name: string }>;
  lastfmTopMine: string[];
  friendTopByUser: Record<string, string[]>;
  friendRecentByUser: Record<string, string[]>;
}): Signals {
  const friendTop = new Map<string, string[]>();
  const friendRecent = new Map<string, string[]>();
  for (const [user, artists] of Object.entries(input.friendTopByUser)) {
    const uniq = new Set(artists.map(normalizeArtist));
    for (const n of uniq) {
      const arr = friendTop.get(n) ?? [];
      arr.push(user);
      friendTop.set(n, arr);
    }
  }
  for (const [user, artists] of Object.entries(input.friendRecentByUser)) {
    const uniq = new Set(artists.map(normalizeArtist));
    for (const n of uniq) {
      const arr = friendRecent.get(n) ?? [];
      arr.push(user);
      friendRecent.set(n, arr);
    }
  }
  const spotifyIds = new Set<string>();
  for (const a of input.spotifyTopShort) spotifyIds.add(a.id);
  for (const a of input.spotifyTopMedium) spotifyIds.add(a.id);
  for (const a of input.spotifyFollowed) spotifyIds.add(a.id);
  return {
    spotifyTopShort: new Set(input.spotifyTopShort.map((a) => normalizeArtist(a.name))),
    spotifyTopMedium: new Set(input.spotifyTopMedium.map((a) => normalizeArtist(a.name))),
    spotifyFollowed: new Set(input.spotifyFollowed.map((a) => normalizeArtist(a.name))),
    spotifyIds,
    lastfmTopMine: new Set(input.lastfmTopMine.map(normalizeArtist)),
    friendTop,
    friendRecent,
  };
}

function pickHeadlineAttraction(event: TMEvent): {
  name: string;
  spotifyId?: string;
} | null {
  const first = event.attractions[0];
  if (!first) return null;
  const spId = first.externalLinks?.spotify?.[0]?.id;
  return { name: first.name, spotifyId: spId };
}

export function scoreEvent(event: TMEvent, signals: Signals, nowMs: number): ScoredEvent | null {
  const head = pickHeadlineAttraction(event);
  if (!head) return null;
  const norm = normalizeArtist(head.name);
  let score = 0;
  const reasons: string[] = [];

  const spotifyIdMatch = head.spotifyId ? signals.spotifyIds.has(head.spotifyId) : false;

  if (signals.spotifyTopShort.has(norm) || (spotifyIdMatch && signals.spotifyTopShort.size > 0)) {
    // spotifyIdMatch alone doesn't say which bucket; only use the name check for bucket attribution.
  }
  if (signals.spotifyTopShort.has(norm)) {
    score += WEIGHTS.spotifyTopShort;
    reasons.push("in your Spotify top (recent)");
  } else if (signals.spotifyTopMedium.has(norm)) {
    score += WEIGHTS.spotifyTopMedium;
    reasons.push("in your Spotify top (6mo)");
  }
  if (signals.spotifyFollowed.has(norm) || spotifyIdMatch) {
    score += WEIGHTS.spotifyFollowed;
    reasons.push("you follow on Spotify");
  }
  if (signals.lastfmTopMine.has(norm)) {
    score += WEIGHTS.lastfmTopMine;
    reasons.push("in your Last.fm top");
  }
  const fTop = signals.friendTop.get(norm) ?? [];
  if (fTop.length > 0) {
    score += WEIGHTS.friendTop * fTop.length;
    reasons.push(`a top artist for ${formatNames(fTop)}`);
  }
  const fRecent = signals.friendRecent.get(norm) ?? [];
  if (fRecent.length > 0) {
    score += WEIGHTS.friendRecent * fRecent.length;
    reasons.push(`recently played by ${formatNames(fRecent)}`);
  }

  // Recency boost: event in next 7 days.
  const eventMs = event.dateTimeIso ? Date.parse(event.dateTimeIso) : Date.parse(event.localDate);
  if (Number.isFinite(eventMs) && eventMs - nowMs <= 7 * 24 * 3600 * 1000) {
    score += WEIGHTS.recencyBoost;
  }

  if (score <= 0) return null;
  return { event, score, reasons, matchedName: head.name };
}

export function rankEvents(
  events: TMEvent[],
  signals: Signals,
  threshold: number,
  nowMs: number
): ScoredEvent[] {
  const scored: ScoredEvent[] = [];
  for (const e of events) {
    const s = scoreEvent(e, signals, nowMs);
    if (s && s.score >= threshold) scored.push(s);
  }
  scored.sort((a, b) => {
    const ad = a.event.dateTimeIso ?? a.event.localDate;
    const bd = b.event.dateTimeIso ?? b.event.localDate;
    if (ad !== bd) return ad < bd ? -1 : 1;
    return b.score - a.score;
  });
  return scored;
}
