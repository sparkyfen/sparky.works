import type { Env } from "./env";
import { cached } from "./cache";

const TTL = 30 * 24 * 3600; // 30d — places don't move

export interface GeoLabel {
  city: string | null;
  stateCode: string | null;
}

interface NominatimResponse {
  address?: {
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    state?: string;
    "ISO3166-2-lvl4"?: string;
  };
}

// Reverse-geocode lat/long to a (city, state) label using OSM Nominatim (free, fair-use).
// Returns nulls if the lookup fails — caller can still store coords without a label.
export async function reverseGeocode(
  env: Env,
  latitude: number,
  longitude: number
): Promise<GeoLabel> {
  // Bucket coords to ~1km so cache hits across nearby pings.
  const lat = latitude.toFixed(2);
  const lng = longitude.toFixed(2);
  return cached<GeoLabel>(env, `geo:${lat}:${lng}`, TTL, async () => {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "spot-my-critters (https://github.com/sparkyfen/sparky.works)" },
      });
      if (!res.ok) return { city: null, stateCode: null };
      const data = (await res.json()) as NominatimResponse;
      const a = data.address ?? {};
      const city = a.city ?? a.town ?? a.village ?? a.hamlet ?? null;
      // ISO code looks like "US-WA" — take the part after the dash.
      const iso = a["ISO3166-2-lvl4"];
      const stateCode = iso?.includes("-") ? iso.split("-")[1]! : null;
      return { city, stateCode };
    } catch {
      return { city: null, stateCode: null };
    }
  });
}
