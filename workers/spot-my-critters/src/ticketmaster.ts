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

export async function getEventsInWindow(
  env: Env,
  startDate: Date,
  endDate: Date
): Promise<TMEvent[]> {
  // Bucket the window to whole-day boundaries so cache keys hit across calls within a day.
  const startDay = startDate.toISOString().slice(0, 10);
  const endDay = endDate.toISOString().slice(0, 10);
  const cacheKey = `tm:${env.TM_CITY}:${env.TM_STATE_CODE}:${env.TM_RADIUS_MILES}:${startDay}:${endDay}`;
  return cached(env, cacheKey, TTL_EVENTS, () =>
    fetchEventsInWindow(env, startDate, endDate)
  );
}

async function fetchEventsInWindow(
  env: Env,
  startDate: Date,
  endDate: Date
): Promise<TMEvent[]> {
  const out: TMEvent[] = [];
  const pageSize = 200;
  for (let page = 0; page < 5; page++) {
    const qs = new URLSearchParams({
      apikey: env.TICKETMASTER_API_KEY,
      city: env.TM_CITY,
      stateCode: env.TM_STATE_CODE,
      radius: env.TM_RADIUS_MILES,
      unit: "miles",
      classificationName: "music",
      startDateTime: isoZ(startDate),
      endDateTime: isoZ(endDate),
      size: String(pageSize),
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
      page?: { totalPages?: number; number?: number };
    };
    const events = data._embedded?.events ?? [];
    for (const raw of events) out.push(toEvent(raw));
    const totalPages = data.page?.totalPages ?? 1;
    if (page + 1 >= totalPages) break;
  }
  return out;
}
