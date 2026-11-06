// Metadata only. The bytes live in StorageService.
// Attachments linked to a WORK_NOTE comment are internal: hidden unless `includeWorkNotes`.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/config/prisma";
import type { Attachment, AttachmentRecord } from "@/types/dto";
import { Errors } from "@/utilities/api-error";
import { iso, toUserRef, userRefSelect } from "@/utilities/mappers";

const include = { uploadedBy: { select: userRefSelect } } satisfies Prisma.TicketAttachmentInclude;
type Row = Prisma.TicketAttachmentGetPayload<{ include: typeof include }>;

const toAttachment = (a: Row): Attachment => ({
  id: a.id, fileName: a.fileName, mimeType: a.mimeType, sizeBytes: a.sizeBytes,
  uploadedBy: toUserRef(a.uploadedBy), commentId: a.commentId, createdAt: iso(a.createdAt),
});

const visibility = (includeWorkNotes: boolean): Prisma.TicketAttachmentWhereInput =>
  includeWorkNotes ? {} : { OR: [{ commentId: null }, { comment: { kind: { not: "WORK_NOTE" } } }] };

export async function listForTicket(ticketId: string, opts: { includeWorkNotes?: boolean } = {}): Promise<Attachment[]> {
  const rows = await prisma.ticketAttachment.findMany({
    where: { ticketId, ...visibility(!!opts.includeWorkNotes) }, include, orderBy: { createdAt: "asc" }, take: 200,
  });
  return rows.map(toAttachment);
}

/** Includes storageKey and uploadedById (never serialised to clients). */
export async function findById(
  ticketId: string,
  attachmentId: string,
  opts: { includeWorkNotes?: boolean } = {}
): Promise<AttachmentRecord | null> {
  const row = await prisma.ticketAttachment.findFirst({
    where: { id: attachmentId, ticketId, ...visibility(!!opts.includeWorkNotes) }, include,
  });
  return row ? { ...toAttachment(row), storageKey: row.storageKey, uploadedById: row.uploadedById } : null;
}

export async function create(input: {
  ticketId: string;
  commentId: string | null;
  uploadedById: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
}): Promise<Attachment> {
  if (input.commentId) {
    // Anti-IDOR: the comment must be on THIS ticket and written by the uploader.
    const comment = await prisma.ticketComment.findFirst({
      where: { id: input.commentId, ticketId: input.ticketId, authorId: input.uploadedById, deletedAt: null },
      select: { id: true },
    });
    if (!comment) throw Errors.validation("commentId must be one of your own comments on this ticket");
  }
  // Keep only the base name; control characters and path separators never reach storage metadata.
  const fileName = input.fileName.replace(/[\u0000-\u001f\u007f/\\]/g, "_").slice(-255) || "file";
  const row = await prisma.ticketAttachment.create({
    data: {
      ticketId: input.ticketId, commentId: input.commentId, uploadedById: input.uploadedById,
      fileName, mimeType: input.mimeType, sizeBytes: input.sizeBytes, storageKey: input.storageKey,
    },
    include,
  });
  return toAttachment(row);
}

export async function remove(attachmentId: string): Promise<void> {
  await prisma.ticketAttachment.deleteMany({ where: { id: attachmentId } });
}
