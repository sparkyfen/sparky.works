import type { Env } from "./env";
import { cached } from "./cache";

const TTL_EVENTS = 10 * 60; // 10m

export interface TMAttraction {
  id: string;
  name: string;
  externalLinks?: {
    spotify?: Array<{ url: string; id?: string }>;
    musicbrainz?: Array<{ id: string }>;
  };
}

export interface TMEvent {
  id: string;
  name: string;
  url: string;
  dateTimeIso?: string;
  localDate: string;
  localTime?: string;
  venueName?: string;
  venueCity?: string;
  attractions: TMAttraction[];
}

interface RawEvent {
  id: string;
  name: string;
  url: string;
  dates: {
    start: { dateTime?: string; localDate: string; localTime?: string };
  };
  _embedded?: {
    venues?: Array<{ name?: string; city?: { name?: string } }>;
    attractions?: Array<{
      id: string;
      name: string;
      externalLinks?: Record<string, Array<{ url?: string; id?: string }>>;
    }>;
  };
}

function extractSpotifyId(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const m = url.match(/artist\/([a-zA-Z0-9]+)/);
  return m ? m[1] : undefined;
}

function toEvent(raw: RawEvent): TMEvent {
  const venue = raw._embedded?.venues?.[0];
  const attractions: TMAttraction[] = (raw._embedded?.attractions ?? []).map((a) => {
    const sp = a.externalLinks?.spotify?.map((l) => ({
      url: l.url ?? "",
      id: l.id ?? extractSpotifyId(l.url),
    }));
    const mb = a.externalLinks?.musicbrainz?.map((l) => ({ id: l.id ?? "" })).filter((x) => x.id);
    return {
      id: a.id,
      name: a.name,
      externalLinks: {
        ...(sp && sp.length ? { spotify: sp } : {}),
        ...(mb && mb.length ? { musicbrainz: mb } : {}),
      },
    };
  });
  return {
    id: raw.id,
    name: raw.name,
    url: raw.url,
    dateTimeIso: raw.dates.start.dateTime,
    localDate: raw.dates.start.localDate,
    localTime: raw.dates.start.localTime,
    venueName: venue?.name,
    venueCity: venue?.city?.name,
    attractions,
  };
}

function isoZ(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export interface EventQuery {
  latitude: number;
  longitude: number;
  radiusMiles: number;
}

export async function getEventsInWindow(
  env: Env,
  query: EventQuery,
  startDate: Date,
  endDate: Date
): Promise<TMEvent[]> {
  const startDay = startDate.toISOString().slice(0, 10);
  const endDay = endDate.toISOString().slice(0, 10);
  // Bucket coords to ~1km so users in the same neighborhood share cache entries.
  const lat = query.latitude.toFixed(2);
  const lng = query.longitude.toFixed(2);
  const cacheKey = `tm:${lat}:${lng}:${query.radiusMiles}:${startDay}:${endDay}`;
  return cached(env, cacheKey, TTL_EVENTS, () =>
    fetchEventsInWindow(env, query, startDate, endDate)
  );
}

const PAGE_SIZE = 200;
// Ticketmaster refuses deep paging past ~1000 items, so a single query can never
// return more. Sorted date,asc, exceeding it silently drops the END of the date
// range — widening the radius used to make later events vanish entirely.
const DEEP_PAGING_LIMIT = 1000;
const MAX_PAGES_PER_WINDOW = DEEP_PAGING_LIMIT / PAGE_SIZE;
// Split a too-dense window in half and re-query each side instead of truncating.
const MAX_SPLIT_DEPTH = 5;
const MIN_SPLIT_MS = 12 * 3600 * 1000;
// Backstop so a pathologically dense region can't burn the subrequest budget.
const MAX_REQUESTS = 40;

interface PageResult {
  events: TMEvent[];
  totalElements: number;
  totalPages: number;
}

async function fetchPage(
  env: Env,
  query: EventQuery,
  startDate: Date,
  endDate: Date,
  page: number
): Promise<PageResult> {
  const qs = new URLSearchParams({
    apikey: env.TICKETMASTER_API_KEY,
    latlong: `${query.latitude},${query.longitude}`,
    radius: String(query.radiusMiles),
    unit: "miles",
    classificationName: "music",
    startDateTime: isoZ(startDate),
    endDateTime: isoZ(endDate),
    size: String(PAGE_SIZE),
    page: String(page),
    sort: "date,asc",
  });
  const res = await fetch(
    `https://app.ticketmaster.com/discovery/v2/events.json?${qs.toString()}`
  );
  if (!res.ok) {
    throw new Error(`Ticketmaster failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    _embedded?: { events?: RawEvent[] };
    page?: { totalPages?: number; totalElements?: number };
  };
  const events = (data._embedded?.events ?? []).map(toEvent);
  return {
    events,
    totalElements: data.page?.totalElements ?? events.length,
    totalPages: data.page?.totalPages ?? 1,
  };
}

async function collectWindow(
  env: Env,
  query: EventQuery,
  startDate: Date,
  endDate: Date,
  depth: number,
  budget: { used: number }
): Promise<TMEvent[]> {
  if (budget.used >= MAX_REQUESTS) {
    console.log(
      `tm: request budget exhausted, dropping window ${isoZ(startDate)}..${isoZ(endDate)}`
    );
    return [];
  }
  budget.used++;
  const first = await fetchPage(env, query, startDate, endDate, 0);
  const spanMs = endDate.getTime() - startDate.getTime();

  // Too dense to page through — halve the date range rather than lose the tail.
  if (
    first.totalElements > DEEP_PAGING_LIMIT &&
    depth < MAX_SPLIT_DEPTH &&
    spanMs > MIN_SPLIT_MS
  ) {
    const mid = new Date(startDate.getTime() + Math.floor(spanMs / 2));
    console.log(
      `tm: splitting ${isoZ(startDate)}..${isoZ(endDate)} (${first.totalElements} events, depth ${depth})`
    );
    const left = await collectWindow(env, query, startDate, mid, depth + 1, budget);
    const right = await collectWindow(env, query, mid, endDate, depth + 1, budget);
    return [...left, ...right];
  }

  const out = [...first.events];
  const pages = Math.min(first.totalPages, MAX_PAGES_PER_WINDOW);
  for (let page = 1; page < pages; page++) {
    if (budget.used >= MAX_REQUESTS) {
      console.log(`tm: request budget exhausted mid-window, truncating at page ${page}`);
      break;
    }
    budget.used++;
    const next = await fetchPage(env, query, startDate, endDate, page);
    out.push(...next.events);
  }
  if (first.totalPages > MAX_PAGES_PER_WINDOW) {
    // Only reachable when we could not split further (min span or max depth).
    console.log(
      `tm: TRUNCATED ${isoZ(startDate)}..${isoZ(endDate)} — ${first.totalElements} events exceed the deep-paging limit`
    );
  }
  return out;
}

async function fetchEventsInWindow(
  env: Env,
  query: EventQuery,
  startDate: Date,
  endDate: Date
): Promise<TMEvent[]> {
  const budget = { used: 0 };
  const collected = await collectWindow(env, query, startDate, endDate, 0, budget);
  // Adjacent sub-windows share a boundary instant, so dedupe by event id.
  const byId = new Map<string, TMEvent>();
  for (const e of collected) if (!byId.has(e.id)) byId.set(e.id, e);
  const out = [...byId.values()];
  console.log(
    `tm: ${out.length} events (${collected.length - out.length} dupes) in ${budget.used} requests, ` +
      `radius ${query.radiusMiles}mi, ${isoZ(startDate)}..${isoZ(endDate)}`
  );
  return out;
}
