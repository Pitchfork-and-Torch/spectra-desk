import sharp from "sharp";

const UA = "SpectraDesk-OSINT/4.3 (+https://github.com/Pitchfork-and-Torch/spectra-desk)";

/** 64-bit difference hash (dHash) as a binary string. */
export async function computeDHash(buffer: Buffer): Promise<string | null> {
  try {
    const { data } = await sharp(buffer)
      .rotate()
      .grayscale()
      .resize(9, 8, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });

    let hash = "";
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const left = data[y * 9 + x] ?? 0;
        const right = data[y * 9 + x + 1] ?? 0;
        hash += left < right ? "1" : "0";
      }
    }
    return hash;
  } catch {
    return null;
  }
}

export function hammingDistance(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  let d = Math.abs(a.length - b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) d++;
  }
  return d;
}

/** Map Hamming distance on 64-bit hash to similarity 0 - 1. */
export function hashSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const dist = hammingDistance(a, b);
  return Math.max(0, 1 - dist / 64);
}

export type PortraitMatchVerdict = "matches-anchor" | "likely-same" | "distinct-person" | "unknown";

export function verdictFromSimilarity(sim: number, hasAnchor: boolean): PortraitMatchVerdict {
  if (!hasAnchor) return "unknown";
  if (sim >= 0.82) return "matches-anchor";
  if (sim >= 0.62) return "likely-same";
  if (sim <= 0.42) return "distinct-person";
  return "unknown";
}

export async function fetchImageBuffer(url: string, maxBytes = 2_500_000): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "image/*,*/*;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(14_000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("text/html")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes || buf.length < 200) return null;
    return buf;
  } catch {
    return null;
  }
}

export function mimeFromBuffer(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf[0] === 0x47 && buf[1] === 0x49) return "image/gif";
  if (buf.slice(0, 4).toString() === "RIFF") return "image/webp";
  return "image/jpeg";
}

export function bufferToDataUri(buf: Buffer): string {
  return `data:${mimeFromBuffer(buf)};base64,${buf.toString("base64")}`;
}