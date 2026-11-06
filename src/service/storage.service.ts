// External-module work: attachment file storage (env.UPLOAD_DIR or object storage).
// Files are stored outside the web root under an opaque storageKey, never the original name.
import { createReadStream } from "node:fs";
import { mkdir, unlink, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { env } from "@/config/env";
import { Errors } from "@/utilities/api-error";

export interface StoredFile {
  storageKey: string;
  sizeBytes: number;
  /** MIME type detected from the file CONTENT, not the extension or the client header. */
  mimeType: string;
}

const KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function root(): string {
  return path.resolve(env.UPLOAD_DIR);
}

function fileFor(storageKey: string): string {
  // The key is generated here, so anything else is tampering. Also blocks path traversal.
  if (!KEY_PATTERN.test(storageKey)) throw Errors.notFound("File");
  return path.join(root(), storageKey.slice(0, 2), storageKey);
}

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  return magic.every((b, i) => bytes[i] === b);
}

/** Sniff the real MIME type from the bytes. Anything unrecognised is application/octet-stream (and so rejected by the allow-list). */
export async function detectMimeType(bytes: Uint8Array): Promise<string> {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  // %PDF- may be preceded by up to 1 KiB of junk per the spec; be strict and require it at the start.
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (bytes.length > 0 && isPlainText(bytes)) return "text/plain";
  return "application/octet-stream";
}

function isPlainText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 8192));
  for (const b of sample) {
    if (b === 0) return false;
    if (b < 9 || (b > 13 && b < 32 && b !== 27)) return false;
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample);
    return true;
  } catch {
    // A multi-byte character may be cut at the sample boundary; only accept that for a truncated sample.
    if (bytes.length > sample.length) {
      try {
        new TextDecoder("utf-8", { fatal: true }).decode(sample.subarray(0, sample.length - 3));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

/** Persist the bytes and return the opaque key. */
export async function save(bytes: Uint8Array): Promise<Omit<StoredFile, "mimeType" | "sizeBytes">> {
  const storageKey = randomUUID();
  const file = fileFor(storageKey);
  await mkdir(path.dirname(file), { recursive: true, mode: 0o750 });
  await writeFile(file, bytes, { mode: 0o640, flag: "wx" });
  return { storageKey };
}

/** Stream a stored file back for download. */
export async function openStream(storageKey: string): Promise<ReadableStream> {
  const file = fileFor(storageKey);
  try {
    await stat(file);
  } catch {
    throw Errors.notFound("File");
  }
  return Readable.toWeb(createReadStream(file)) as unknown as ReadableStream;
}

export async function remove(storageKey: string): Promise<void> {
  try {
    await unlink(fileFor(storageKey));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}
