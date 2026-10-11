export interface WaybackSnapshot {
  available: boolean;
  snapshotUrl?: string;
  timestamp?: string;
  originalUrl: string;
}

export async function fetchWaybackSnapshot(url: string): Promise<WaybackSnapshot> {
  const clean = url.startsWith("http") ? url : `https://${url}`;
  try {
    const res = await fetch(
      `https://archive.org/wayback/available?url=${encodeURIComponent(clean)}`,
      { headers: { "User-Agent": "SpectraDesk-OSINT/2.1" }, signal: AbortSignal.timeout(12_000) },
    );
    if (!res.ok) return { available: false, originalUrl: clean };
    const data = (await res.json()) as {
      archived_snapshots?: { closest?: { available: boolean; url: string; timestamp: string } };
    };
    const closest = data.archived_snapshots?.closest;
    if (closest?.available && closest.url) {
      return {
        available: true,
        snapshotUrl: closest.url,
        timestamp: closest.timestamp,
        originalUrl: clean,
      };
    }
    return { available: false, originalUrl: clean };
  } catch {
    return { available: false, originalUrl: clean };
  }
}