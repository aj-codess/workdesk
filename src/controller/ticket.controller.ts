import { TICKET_STAFF_VIEW_PERMISSIONS } from "@/config/permissions";
import { Errors } from "@/utilities/api-error";
import { hasAnyPermission } from "@/utilities/authorization";
import { noContent, success } from "@/utilities/api-response";
import { parseBody, parseOptionalBody, parseParams, parseQuery } from "@/utilities/request";
import { buildMeta } from "@/types/pagination";
import * as TicketModel from "@/models/ticket.model";
import * as ActivityModel from "@/models/activity.model";
import * as AssignmentModel from "@/models/assignment.model";
import { idParams } from "@/validators/common";
import {
  acceptBody, assignBody, cancelBody, changePriorityBody, changeStatusBody, closeBody, createTicketBody,
  listActivityQuery, listTicketsQuery, provideClarificationBody, rejectBody, reopenBody,
  requestClarificationBody, resolveBody, transferBody, updateTicketBody,
} from "@/validators/ticket.validator";
import type { ProtectedContext } from "@/types/auth";

type IdParams = { id: string };

/** Models return null for "missing or outside the caller's scope": always a 404, never a 403. */
function found<T>(value: T | null): T {
  if (value === null) throw Errors.notFound("Ticket");
  return value;
}

/** GET /tickets */
export async function list({ req, auth }: ProtectedContext) {
  const query = parseQuery(req, listTicketsQuery);
  const { rows, total } = await TicketModel.list(query, auth);
  return success(rows, { meta: buildMeta(query, total) });
}

/** POST /tickets */
export async function create({ req, auth }: ProtectedContext) {
  const body = await parseBody(req, createTicketBody);
  return success(await TicketModel.create(body, auth), { status: 201 });
}

/** GET /tickets/:id */
export async function get({ params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  return success(found(await TicketModel.findById(id, auth)));
}

/** PATCH /tickets/:id : requester (update_own) or assignee (update_assigned), decided in the model. */
export async function update({ req, params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  const body = await parseBody(req, updateTicketBody);
  return success(found(await TicketModel.update(id, body, auth)));
}

/** PATCH /tickets/:id/priority */
export async function changePriority({ req, params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  const body = await parseBody(req, changePriorityBody);
  return success(found(await TicketModel.changePriority(id, body, auth)));
}

/** DELETE /tickets/:id */
export async function remove({ params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  if (!(await TicketModel.softDelete(id, auth))) throw Errors.notFound("Ticket");
  return noContent();
}

/** POST /tickets/:id/accept */
export async function accept({ req, params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  const body = await parseOptionalBody(req, acceptBody);
  return success(found(await TicketModel.accept(id, body, auth)));
}

/** POST /tickets/:id/reject */
export async function reject({ req, params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  const body = await parseBody(req, rejectBody);
  return success(found(await TicketModel.reject(id, body, auth)));
}

/** POST /tickets/:id/request-clarification */
export async function requestClarification({ req, params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  const body = await parseBody(req, requestClarificationBody);
  return success(found(await TicketModel.requestClarification(id, body, auth)));
}

/** POST /tickets/:id/provide-clarification : requester only (enforced in the model). */
export async function provideClarification({ req, params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  const body = await parseBody(req, provideClarificationBody);
  return success(found(await TicketModel.provideClarification(id, body, auth)));
}

/** POST /tickets/:id/assign */
export async function assign({ req, params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  const body = await parseBody(req, assignBody);
  return success(found(await TicketModel.assign(id, body, auth)));
}

/** POST /tickets/:id/status */
export async function changeStatus({ req, params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  const body = await parseBody(req, changeStatusBody);
  return success(found(await TicketModel.changeStatus(id, body, auth)));
}

/** POST /tickets/:id/resolve */
export async function resolve({ req, params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  const body = await parseBody(req, resolveBody);
  return success(found(await TicketModel.resolve(id, body, auth)));
}

/** POST /tickets/:id/close */
export async function close({ req, params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  const body = await parseOptionalBody(req, closeBody);
  return success(found(await TicketModel.close(id, body, auth)));
}

/** POST /tickets/:id/reopen */
export async function reopen({ req, params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  const body = await parseBody(req, reopenBody);
  return success(found(await TicketModel.reopen(id, body, auth)));
}

/** POST /tickets/:id/cancel : requester only (enforced in the model). */
export async function cancel({ req, params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  const body = await parseOptionalBody(req, cancelBody);
  return success(found(await TicketModel.cancel(id, body, auth)));
}

/** POST /tickets/:id/transfer : answers with a small payload, not TicketDetail (caller may lose access). */
export async function transfer({ req, params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  const body = await parseBody(req, transferBody);
  return success(found(await TicketModel.transfer(id, body, auth)));
}

/** GET /tickets/:id/activity */
export async function listActivity({ req, params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  const query = parseQuery(req, listActivityQuery);
  const ref = found(await TicketModel.findAccessRef(id, auth));
  const { rows, total } = await ActivityModel.listForTicket(ref.id, query, { staffScope: ref.staffScope });
  return success(rows, { meta: buildMeta(query, total) });
}

/** GET /tickets/:id/assignments : staff scope only; a requester-only caller gets 403. */
export async function listAssignments({ params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  const ref = found(await TicketModel.findAccessRef(id, auth));
  if (!ref.staffScope || !hasAnyPermission(auth, TICKET_STAFF_VIEW_PERMISSIONS)) throw Errors.forbidden();
  return success(await AssignmentModel.listForTicket(ref.id));
}

