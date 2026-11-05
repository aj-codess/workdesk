import { TICKET_STAFF_VIEW_PERMISSIONS } from "@/config/permissions";
import { Errors } from "@/utilities/api-error";
import { assertPermission, hasAnyPermission, hasPermission } from "@/utilities/authorization";
import { noContent, success } from "@/utilities/api-response";
import { parseBody, parseParams, parseQuery } from "@/utilities/request";
import { buildMeta } from "@/types/pagination";
import * as TicketModel from "@/models/ticket.model";
import * as CommentModel from "@/models/comment.model";
import { idParams } from "@/validators/common";
import {
  createCommentBody, listCommentsQuery, ticketCommentParams, updateCommentBody,
} from "@/validators/ticket.validator";
import type { ProtectedContext } from "@/types/auth";

type IdParams = { id: string };
type CommentParams = { id: string; commentId: string };

async function visibleTicket(id: string, auth: ProtectedContext["auth"]) {
  const ref = await TicketModel.findAccessRef(id, auth);
  if (!ref) throw Errors.notFound("Ticket");
  return ref;
}

/** GET /tickets/:id/comments : WORK_NOTE rows only for staff scope + tickets.view_work_notes. */
export async function list({ req, params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  const query = parseQuery(req, listCommentsQuery);
  const ref = await visibleTicket(id, auth);
  const includeWorkNotes = ref.staffScope && hasPermission(auth, "tickets.view_work_notes");
  const { rows, total } = await CommentModel.list(ref.id, query, { includeWorkNotes });
  return success(rows, { meta: buildMeta(query, total) });
}

/** POST /tickets/:id/comments */
export async function create({ req, params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  const body = await parseBody(req, createCommentBody);
  const ref = await visibleTicket(id, auth);
  if (body.kind === "WORK_NOTE") {
    assertPermission(auth, "tickets.view_work_notes");
    if (!ref.staffScope || !hasAnyPermission(auth, TICKET_STAFF_VIEW_PERMISSIONS)) throw Errors.forbidden();
  }
  return success(await CommentModel.create(ref.id, body, auth), { status: 201 });
}

/** PATCH /tickets/:id/comments/:commentId : author only (enforced in the model). */
export async function update({ req, params, auth }: ProtectedContext<CommentParams>) {
  const { id, commentId } = parseParams(params, ticketCommentParams);
  const { body } = await parseBody(req, updateCommentBody);
  const ref = await visibleTicket(id, auth);
  const comment = await CommentModel.update(ref.id, commentId, body, auth);
  if (!comment) throw Errors.notFound("Comment");
  return success(comment);
}

/** DELETE /tickets/:id/comments/:commentId : author, or a holder of tickets.delete. */
export async function remove({ params, auth }: ProtectedContext<CommentParams>) {
  const { id, commentId } = parseParams(params, ticketCommentParams);
  const ref = await visibleTicket(id, auth);
  const deleted = await CommentModel.softDelete(ref.id, commentId, auth, {
    canDeleteAny: hasPermission(auth, "tickets.delete"),
  });
  if (!deleted) throw Errors.notFound("Comment");
  return noContent();
}
