// Tickets. EVERY function here applies the caller's visibility scope (union of what their permissions grant):
//   tickets.view_all        -> every non-deleted ticket
//   tickets.view_department -> tickets of departments in department_managers for the caller
//   tickets.view_assigned   -> assignedAgentId = caller
//   tickets.view_own        -> requesterId = caller
// A ticket outside scope is "not found": return null (the controller answers 404), never 403.
// Every transition checks the state machine (docs Appendix A) and runs in ONE transaction together with its
// ticket_activity row (and the audit_logs row where the doc says so). An illegal transition throws
// ApiError(409, ..., "INVALID_STATE_TRANSITION") and writes nothing.
import type { Paginated } from "@/types/pagination";
import type { AuthContext } from "@/types/auth";
import type { TicketAccessRef, TicketDetail, TicketSummary, TicketTransferResult } from "@/types/dto";
import type {
  AcceptBody, AssignBody, CancelBody, ChangePriorityBody, ChangeStatusBody, CloseBody, CreateTicketBody,
  ListTicketsQuery, ProvideClarificationBody, RejectBody, ReopenBody, RequestClarificationBody, ResolveBody,
  TransferBody, UpdateTicketBody,
} from "@/validators/ticket.validator";
import { notImplemented } from "@/utilities/not-implemented";

/** Scope check only. Used by comment / attachment controllers. null when out of scope. */
export async function findAccessRef(_id: string, _auth: AuthContext): Promise<TicketAccessRef | null> {
  return notImplemented("TicketModel.findAccessRef");
}

export async function list(_query: ListTicketsQuery, _auth: AuthContext): Promise<Paginated<TicketSummary>> {
  return notImplemented("TicketModel.list");
}

/** TicketDetail including allowedActions (permission + scope + status) and the staff-only requester fields. */
export async function findById(_id: string, _auth: AuthContext): Promise<TicketDetail | null> {
  return notImplemented("TicketModel.findById");
}

/**
 * status = PENDING_REVIEW, requesterId = caller, requesterDepartmentId + requesterSnapshot { name, email, department, roles[] },
 * SUBMITTED activity row. 404 for unknown department/category; 422 if the department is inactive or the category
 * does not belong to it / is inactive.
 */
export async function create(_input: CreateTicketBody, _auth: AuthContext): Promise<TicketDetail> {
  return notImplemented("TicketModel.create");
}

/**
 * Requester with tickets.update_own while PENDING_REVIEW / CLARIFICATION_REQUESTED, or assignee with
 * tickets.update_assigned while ASSIGNED / IN_PROGRESS / REOPENED. Category must belong to the ticket's department.
 * Activity UPDATED with before/after.
 */
export async function update(_id: string, _input: UpdateTicketBody, _auth: AuthContext): Promise<TicketDetail | null> {
  return notImplemented("TicketModel.update");
}

/** Not allowed on REJECTED / CANCELLED / CLOSED. Activity PRIORITY_CHANGED. */
export async function changePriority(_id: string, _input: ChangePriorityBody, _auth: AuthContext): Promise<TicketDetail | null> {
  return notImplemented("TicketModel.changePriority");
}

/** Soft delete (deletedAt). Audit tickets.deleted. false when out of scope / missing. */
export async function softDelete(_id: string, _auth: AuthContext): Promise<boolean> {
  return notImplemented("TicketModel.softDelete");
}

/** PENDING_REVIEW -> ACCEPTED. Sets reviewedById/reviewedAt. Activity ACCEPTED, audit tickets.accepted. */
export async function accept(_id: string, _input: AcceptBody, _auth: AuthContext): Promise<TicketDetail | null> {
  return notImplemented("TicketModel.accept");
}

/** PENDING_REVIEW -> REJECTED (terminal). Stores rejectionReason, reviewedById/At. Activity REJECTED, audit tickets.rejected. */
export async function reject(_id: string, _input: RejectBody, _auth: AuthContext): Promise<TicketDetail | null> {
  return notImplemented("TicketModel.reject");
}

/** PENDING_REVIEW -> CLARIFICATION_REQUESTED. Creates a CLARIFICATION comment. Activity CLARIFICATION_REQUESTED. */
export async function requestClarification(_id: string, _input: RequestClarificationBody, _auth: AuthContext): Promise<TicketDetail | null> {
  return notImplemented("TicketModel.requestClarification");
}

/** Requester only (requesterId = caller). CLARIFICATION_REQUESTED -> PENDING_REVIEW. Creates a CLARIFICATION comment; optional description update. */
export async function provideClarification(_id: string, _input: ProvideClarificationBody, _auth: AuthContext): Promise<TicketDetail | null> {
  return notImplemented("TicketModel.provideClarification");
}

/**
 * ACCEPTED/REOPENED -> ASSIGNED, or reassign from ASSIGNED/IN_PROGRESS (status unchanged, reason REQUIRED when the ticket
 * already has an agent). Agent must be ACTIVE, in department_members and hold tickets.view_assigned, else
 * ApiError(422, ..., "AGENT_NOT_ELIGIBLE"). Closes the current ticket_assignments row, inserts a new one. Activity ASSIGNED / REASSIGNED, audit tickets.assigned / tickets.reassigned.
 */
export async function assign(_id: string, _input: AssignBody, _auth: AuthContext): Promise<TicketDetail | null> {
  return notImplemented("TicketModel.assign");
}

/** ASSIGNED/REOPENED -> IN_PROGRESS. Activity STATUS_CHANGED. */
export async function changeStatus(_id: string, _input: ChangeStatusBody, _auth: AuthContext): Promise<TicketDetail | null> {
  return notImplemented("TicketModel.changeStatus");
}

/** IN_PROGRESS -> RESOLVED. Sets resolution, resolvedById/At. Activity RESOLVED. */
export async function resolve(_id: string, _input: ResolveBody, _auth: AuthContext): Promise<TicketDetail | null> {
  return notImplemented("TicketModel.resolve");
}

/** RESOLVED -> CLOSED. Sets closedAt. Activity CLOSED. */
export async function close(_id: string, _input: CloseBody, _auth: AuthContext): Promise<TicketDetail | null> {
  return notImplemented("TicketModel.close");
}

/** RESOLVED/CLOSED -> REOPENED. reopenCount + 1, clears closedAt. Activity REOPENED. */
export async function reopen(_id: string, _input: ReopenBody, _auth: AuthContext): Promise<TicketDetail | null> {
  return notImplemented("TicketModel.reopen");
}

/** Requester only. PENDING_REVIEW/CLARIFICATION_REQUESTED/ACCEPTED -> CANCELLED (terminal). Activity CANCELLED. */
export async function cancel(_id: string, _input: CancelBody, _auth: AuthContext): Promise<TicketDetail | null> {
  return notImplemented("TicketModel.cancel");
}

/**
 * Any non-terminal status before RESOLVED. Change department + category, reset to PENDING_REVIEW, close the current
 * assignment, clear assignedAgentId. 422 if the destination is inactive / is the same department / category mismatch.
 * Activity DEPARTMENT_TRANSFERRED, audit tickets.transferred.
 */
export async function transfer(_id: string, _input: TransferBody, _auth: AuthContext): Promise<TicketTransferResult | null> {
  return notImplemented("TicketModel.transfer");
}
