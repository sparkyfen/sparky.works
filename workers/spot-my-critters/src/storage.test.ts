import { describe, it, expect } from "vitest";
import { DEFAULT_RADIUS_MILES, setUserLocation } from "./storage";
import type { Env } from "./env";

/** Minimal D1 stand-in that records the SQL and bindings it was handed. */
function fakeDb() {
  const calls: Array<{ sql: string; binds: unknown[] }> = [];
  const DB = {
    prepare(sql: string) {
      return {
        bind(...binds: unknown[]) {
          calls.push({ sql, binds });
          return { run: async () => ({}) };
        },
      };
    },
  };
  return { DB, calls };
}

describe("setUserLocation", () => {
  const loc = { city: "Seattle", stateCode: "WA", latitude: 47.6, longitude: -122.3 };

  it("seeds a default radius so the user isn't skipped by the digest", async () => {
    const { DB, calls } = fakeDb();
    await setUserLocation({ DB } as unknown as Env, 42, loc);

    expect(calls).toHaveLength(1);
    const { sql, binds } = calls[0]!;
    // Without this, /city leaves radius_miles NULL and both the weekly cron and
    // /upcoming silently treat the user as having no location at all.
    expect(sql).toMatch(/radius_miles\s*=\s*COALESCE\(radius_miles,\s*\?5\)/);
    expect(binds).toEqual([
      loc.city,
      loc.stateCode,
      loc.latitude,
      loc.longitude,
      DEFAULT_RADIUS_MILES,
      42,
    ]);
  });

  it("uses COALESCE so an explicit /radius is never overwritten", async () => {
    const { DB, calls } = fakeDb();
    await setUserLocation({ DB } as unknown as Env, 42, loc);
    // COALESCE keeps the existing value when radius_miles is already set.
    expect(calls[0]!.sql).toContain("COALESCE(radius_miles,");
    expect(calls[0]!.sql).not.toMatch(/radius_miles\s*=\s*\?5\s*(,|WHERE)/);
  });

  it("defaults to a sane search radius", () => {
    expect(DEFAULT_RADIUS_MILES).toBeGreaterThan(0);
    expect(DEFAULT_RADIUS_MILES).toBeLessThanOrEqual(200);
  });
});
