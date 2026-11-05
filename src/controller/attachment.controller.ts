// Optional routes ("attachments, if supported"). Limits come from settings
// attachments.max_size_mb and attachments.allowed_mime_types.
import { NextResponse } from "next/server";
import { Errors, ApiError } from "@/utilities/api-error";
import { hasPermission } from "@/utilities/authorization";
import { noContent, success } from "@/utilities/api-response";
import { parseParams } from "@/utilities/request";
import * as StorageService from "@/service/storage.service";
import * as TicketModel from "@/models/ticket.model";
import * as AttachmentModel from "@/models/attachment.model";
import * as SettingModel from "@/models/setting.model";
import { idParams } from "@/validators/common";
import { ticketAttachmentParams, uploadAttachmentFields } from "@/validators/ticket.validator";
import type { ProtectedContext } from "@/types/auth";

type IdParams = { id: string };
type AttachmentParams = { id: string; attachmentId: string };

async function visibleTicket(id: string, auth: ProtectedContext["auth"]) {
  const ref = await TicketModel.findAccessRef(id, auth);
  if (!ref) throw Errors.notFound("Ticket");
  return ref;
}

/** GET /tickets/:id/attachments */
export async function list({ params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  const ref = await visibleTicket(id, auth);
  return success(await AttachmentModel.listForTicket(ref.id));
}

/** POST /tickets/:id/attachments : multipart/form-data { file, commentId? }. Needs tickets.comment, or being the requester. */
export async function upload({ req, params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  const ref = await visibleTicket(id, auth);
  if (ref.requesterId !== auth.userId && !hasPermission(auth, "tickets.comment")) throw Errors.forbidden();

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw Errors.validation("`file` is required (one file)");
  const { commentId } = parseParams({ commentId: form.get("commentId") ?? undefined }, uploadAttachmentFields);

  const [maxMb, allowedTypes] = await Promise.all([
    SettingModel.getValue<number>("attachments.max_size_mb"),
    SettingModel.getValue<string[]>("attachments.allowed_mime_types"),
  ]);
  if (file.size > maxMb * 1024 * 1024) throw new ApiError(413, `File exceeds ${maxMb} MB`, undefined, "PAYLOAD_TOO_LARGE");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = await StorageService.detectMimeType(bytes); // by content, not extension
  if (!allowedTypes.includes(mimeType)) throw new ApiError(415, "File type not allowed", undefined, "UNSUPPORTED_MEDIA_TYPE");

  const stored = await StorageService.save(bytes);
  const attachment = await AttachmentModel.create({
    ticketId: ref.id, commentId: commentId ?? null, uploadedById: auth.userId,
    fileName: file.name, mimeType, sizeBytes: bytes.byteLength, storageKey: stored.storageKey,
  });
  return success(attachment, { status: 201 });
}

/** GET /tickets/:id/attachments/:attachmentId/download : same scope check as the ticket. */
export async function download({ params, auth }: ProtectedContext<AttachmentParams>) {
  const { id, attachmentId } = parseParams(params, ticketAttachmentParams);
  const ref = await visibleTicket(id, auth);
  const attachment = await AttachmentModel.findById(ref.id, attachmentId);
  if (!attachment) throw Errors.notFound("Attachment");

  const stream = await StorageService.openStream(attachment.storageKey);
  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(attachment.sizeBytes),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** DELETE /tickets/:id/attachments/:attachmentId : uploader, or a holder of tickets.delete. */
export async function remove({ params, auth }: ProtectedContext<AttachmentParams>) {
  const { id, attachmentId } = parseParams(params, ticketAttachmentParams);
  const ref = await visibleTicket(id, auth);
  const attachment = await AttachmentModel.findById(ref.id, attachmentId);
  if (!attachment) throw Errors.notFound("Attachment");
  if (attachment.uploadedById !== auth.userId && !hasPermission(auth, "tickets.delete")) throw Errors.forbidden();

  await AttachmentModel.remove(attachment.id);
  await StorageService.remove(attachment.storageKey);
  return noContent();
}
