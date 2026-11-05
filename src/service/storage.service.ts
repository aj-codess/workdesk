// External-module work: attachment file storage (env.UPLOAD_DIR or object storage).
// Files are stored outside the web root under an opaque storageKey, never the original name.
import { notImplemented } from "@/utilities/not-implemented";

export interface StoredFile {
  storageKey: string;
  sizeBytes: number;
  /** MIME type detected from the file CONTENT, not the extension or the client header. */
  mimeType: string;
}

/** Sniff the real MIME type from the bytes. */
export async function detectMimeType(_bytes: Uint8Array): Promise<string> {
  return notImplemented("StorageService.detectMimeType");
}

/** Persist the bytes and return the opaque key. */
export async function save(_bytes: Uint8Array): Promise<Omit<StoredFile, "mimeType" | "sizeBytes">> {
  return notImplemented("StorageService.save");
}

/** Stream a stored file back for download. */
export async function openStream(_storageKey: string): Promise<ReadableStream> {
  return notImplemented("StorageService.openStream");
}

export async function remove(_storageKey: string): Promise<void> {
  return notImplemented("StorageService.remove");
}
