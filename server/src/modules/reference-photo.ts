import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { sha256 } from "../hash.js";
import { bufferToDataUri } from "./image-phash.js";

const MAX_BYTES = 5 * 1024 * 1024;

export interface SavedReferencePhoto {
  localPath: string;
  hash: string;
  dataUri: string;
  width: number;
  height: number;
  bytes: number;
  savedAt: string;
}

function decodeDataUri(input: string): Buffer | null {
  const trimmed = input.trim();
  const match = /^data:image\/[\w+.-]+;base64,(.+)$/i.exec(trimmed);
  const b64 = match ? match[1]! : trimmed;
  try {
    const buf = Buffer.from(b64, "base64");
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}

export async function saveReferencePhoto(
  caseDir: string,
  input: string,
): Promise<SavedReferencePhoto | null> {
  const raw = decodeDataUri(input);
  if (!raw || raw.length > MAX_BYTES) return null;

  let width = 0;
  let height = 0;
  let normalized: Buffer;
  try {
    const img = sharp(raw).rotate();
    const meta = await img.metadata();
    if (!meta.width || !meta.height) return null;
    width = meta.width;
    height = meta.height;
    normalized = await img.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  } catch {
    return null;
  }

  const refDir = path.join(caseDir, "reference");
  if (!existsSync(refDir)) mkdirSync(refDir, { recursive: true });

  const localPath = path.join(refDir, "subject-reference.jpg");
  writeFileSync(localPath, normalized);
  const hash = sha256(normalized.toString("base64"));
  writeFileSync(
    path.join(refDir, "metadata.json"),
    JSON.stringify(
      {
        hash,
        width,
        height,
        bytes: normalized.length,
        source: "investigator-upload",
        savedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    localPath,
    hash,
    dataUri: bufferToDataUri(normalized),
    width,
    height,
    bytes: normalized.length,
    savedAt: new Date().toISOString(),
  };
}

export function loadReferencePhotoBuffer(caseDir: string): Buffer | null {
  const p = path.join(caseDir, "reference", "subject-reference.jpg");
  if (!existsSync(p)) return null;
  try {
    return readFileSync(p);
  } catch {
    return null;
  }
}