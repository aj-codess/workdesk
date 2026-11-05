// Metadata only. The bytes live in StorageService.
import type { Attachment, AttachmentRecord } from "@/types/dto";
import { notImplemented } from "@/utilities/not-implemented";

export async function listForTicket(_ticketId: string): Promise<Attachment[]> {
  return notImplemented("AttachmentModel.listForTicket");
}

/** Includes storageKey and uploadedById (never serialised to clients). */
export async function findById(_ticketId: string, _attachmentId: string): Promise<AttachmentRecord | null> {
  return notImplemented("AttachmentModel.findById");
}

export async function create(_input: {
  ticketId: string;
  commentId: string | null;
  uploadedById: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
}): Promise<Attachment> {
  return notImplemented("AttachmentModel.create");
}

export async function remove(_attachmentId: string): Promise<void> {
  return notImplemented("AttachmentModel.remove");
}
