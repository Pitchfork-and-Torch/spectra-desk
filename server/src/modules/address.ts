import type { AddressIntel } from "../types.js";

export async function analyzeAddress(parts: {
  address?: string;
  city?: string;
  state?: string;
  country?: string;
}): Promise<AddressIntel | undefined> {
  const raw = [parts.address, parts.city, parts.state, parts.country].filter(Boolean).join(", ");
  if (!raw) return undefined;

  try {
    const q = encodeURIComponent(raw);
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=1`, {
      headers: { "User-Agent": "SpectraDesk-OSINT/1.0 (research tool)" },
    });
    const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    if (data[0]) {
      const lat = Number(data[0].lat);
      const lon = Number(data[0].lon);
      return {
        raw,
        geocoded: { lat, lon, displayName: data[0].display_name },
        mapUrl: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}`,
      };
    }
  } catch {
    /* ignore */
  }

  return { raw };
}