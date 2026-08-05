import { describe, it, expect, vi, afterEach } from "vitest";
import { getEventsInWindow } from "./ticketmaster";
import type { Env } from "./env";

/** Env with a KV stub that never caches, so each call exercises the real fetch. */
function testEnv(): Env {
  return {
    TICKETMASTER_API_KEY: "k",
    TOKENS: {
      get: async () => null,
      put: async () => undefined,
    },
  } as unknown as Env;
}

function rawEvent(id: string, localDate: string) {
  return {
    id,
    name: `Event ${id}`,
    url: `https://tm.example/${id}`,
    dates: { start: { dateTime: `${localDate}T02:00:00Z`, localDate } },
    _embedded: { venues: [{ name: "Venue" }], attractions: [{ id: `a${id}`, name: `Band ${id}` }] },
  };
}

/**
 * Fake Ticketmaster. `densityFor` decides how many events a date window claims to
 * hold, letting us drive the deep-paging split without 1000 real fixtures.
 */
function mockTM(densityFor: (startMs: number, endMs: number) => number) {
  const windows: Array<{ start: string; end: string; page: number }> = [];
  const fetchMock = vi.fn(async (url: string) => {
    const q = new URL(url).searchParams;
    const start = q.get("startDateTime")!;
    const end = q.get("endDateTime")!;
    const page = Number(q.get("page"));
    windows.push({ start, end, page });

    const total = densityFor(Date.parse(start), Date.parse(end));
    const totalPages = Math.ceil(total / 200);
    // Only materialize events for windows small enough to actually be paged.
    const events =
      total > 1000
        ? []
        : Array.from({ length: Math.min(200, Math.max(0, total - page * 200)) }, (_, i) =>
            rawEvent(`${start}-${page * 200 + i}`, start.slice(0, 10))
          );
    return {
      ok: true,
      json: async () => ({
        _embedded: { events },
        page: { totalElements: total, totalPages },
      }),
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return { windows, fetchMock };
}

const query = { latitude: 47.6, longitude: -122.3, radiusMiles: 200 };
const start = new Date("2026-08-05T00:00:00Z");
const end = new Date("2026-11-13T00:00:00Z"); // ~100 days

afterEach(() => vi.unstubAllGlobals());

describe("getEventsInWindow deep-paging", () => {
  it("pages through a normal window without splitting", async () => {
    const { windows } = mockTM(() => 350);
    const out = await getEventsInWindow(testEnv(), query, start, end);

    expect(out).toHaveLength(350);
    // One window, two pages — no split.
    expect(new Set(windows.map((w) => `${w.start}|${w.end}`)).size).toBe(1);
    expect(windows.map((w) => w.page)).toEqual([0, 1]);
  });

  it("splits a window that exceeds the deep-paging limit instead of truncating", async () => {
    // Dense only while the window spans more than ~25 days; smaller slices are sparse.
    const { windows } = mockTM((s, e) => (e - s > 25 * 86400000 ? 5000 : 300));
    const out = await getEventsInWindow(testEnv(), query, start, end);

    const distinct = new Set(windows.map((w) => `${w.start}|${w.end}`));
    expect(distinct.size).toBeGreaterThan(1);
    // The old code capped at 1000; splitting must beat that.
    expect(out.length).toBeGreaterThan(1000);
  });

  it("covers the whole range — the END of the window is not dropped", async () => {
    const { windows } = mockTM((s, e) => (e - s > 25 * 86400000 ? 5000 : 300));
    await getEventsInWindow(testEnv(), query, start, end);

    // Sorted date,asc, truncation silently lost the tail. Assert the final
    // sub-window still reaches the requested end instant.
    const ends = windows.map((w) => Date.parse(w.end));
    expect(Math.max(...ends)).toBe(end.getTime());
    const starts = windows.map((w) => Date.parse(w.start));
    expect(Math.min(...starts)).toBe(start.getTime());
  });

  it("dedupes events shared across a split boundary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const q = new URL(url).searchParams;
        const dense = Date.parse(q.get("endDateTime")!) - Date.parse(q.get("startDateTime")!) >
          25 * 86400000;
        return {
          ok: true,
          json: async () => ({
            // Every sub-window returns the SAME event id.
            _embedded: { events: dense ? [] : [rawEvent("dupe", "2026-08-06")] },
            page: { totalElements: dense ? 5000 : 1, totalPages: dense ? 25 : 1 },
          }),
        } as unknown as Response;
      })
    );
    const out = await getEventsInWindow(testEnv(), query, start, end);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("dupe");
  });

  it("bounds total requests even when every sub-window stays dense", async () => {
    const { fetchMock } = mockTM(() => 100000);
    await getEventsInWindow(testEnv(), query, start, end);
    // Backstop against burning the Workers subrequest budget.
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(40);
  });

  it("propagates a Ticketmaster error rather than returning a short list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 429, text: async () => "rate limited" }) as unknown as Response)
    );
    await expect(getEventsInWindow(testEnv(), query, start, end)).rejects.toThrow(/429/);
  });
});
