import type { Env } from "./env";

const ROOT = "https://api.seatgeek.com/2";

async function sgGet<T>(env: Env, path: string, params: Record<string, string>): Promise<T | null> {
  if (!env.SEATGEEK_CLIENT_ID) return null;
  const qs = new URLSearchParams({ ...params, client_id: env.SEATGEEK_CLIENT_ID });
  const res = await fetch(`${ROOT}${path}?${qs.toString()}`);
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export async function lookupLowestPrice(
  env: Env,
  performerName: string,
  venueName: string
): Promise<number | undefined> {
  if (!env.SEATGEEK_CLIENT_ID) return undefined;
  const perf = await sgGet<{ performers: Array<{ id: number; name: string }> }>(
    env,
    "/performers",
    { q: performerName }
  );
  const performer = perf?.performers.find(
    (p) => p.name.toLowerCase() === performerName.toLowerCase()
  );
  if (!performer) return undefined;

  const ven = await sgGet<{ venues: Array<{ id: number; name: string }> }>(env, "/venues", {
    q: venueName,
  });
  const venue = ven?.venues.find((v) => v.name.toLowerCase() === venueName.toLowerCase());
  if (!venue) return undefined;

  const evs = await sgGet<{
    events: Array<{ id: number; stats: { lowest_price: number | null } }>;
  }>(env, "/events", {
    "performers.id": String(performer.id),
    "venue.id": String(venue.id),
  });
  const evt = evs?.events[0];
  return evt?.stats.lowest_price ?? undefined;
}
