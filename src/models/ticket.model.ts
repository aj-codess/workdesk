// Tickets. EVERY function here applies the caller's visibility scope (union of what their permissions grant):
//   tickets.view_all        -> every non-deleted ticket
//   tickets.view_department -> tickets of departments in department_managers for the caller
//   tickets.view_assigned   -> assignedAgentId = caller
//   tickets.view_own        -> requesterId = caller
// A ticket outside scope is "not found": return null (the controller answers 404), never 403.
// Every transition checks the state machine (docs Appendix A) and runs in ONE transaction together with its
// ticket_activity row (and the audit_logs row where the doc says so). An illegal transition throws
// ApiError(409, ..., "INVALID_STATE_TRANSITION") and writes nothing.
import { Prisma } from "@prisma/client";
import type { ActivityAction, TicketStatus } from "@prisma/client";
import { prisma } from "@/config/prisma";
import type { Paginated } from "@/types/pagination";
import type { AuthContext } from "@/types/auth";
import type { TicketAccessRef, TicketAction, TicketDetail, TicketSummary, TicketTransferResult } from "@/types/dto";
import type {
  AcceptBody, AssignBody, CancelBody, ChangePriorityBody, ChangeStatusBody, CloseBody, CreateTicketBody,
  ListTicketsQuery, ProvideClarificationBody, RejectBody, ReopenBody, RequestClarificationBody, ResolveBody,
  TransferBody, UpdateTicketBody,
} from "@/validators/ticket.validator";
import { Errors } from "@/utilities/api-error";
import { DomainErrors } from "@/utilities/domain-errors";
import {
  deptRefSelect, iso, isoOrNull, ticketReference, toDeptRef, toUserRef, userRefSelect, type Db,
} from "@/utilities/mappers";
import { eligibleAgentWhere, isStaffFor, ticketScopeWhere } from "@/models/scope";
import * as AuditLogModel from "@/models/audit-log.model";

// ---- state machine (docs Appendix A) --------------------------------------------------------------

const S = {
  EDIT_REQUESTER: ["PENDING_REVIEW", "CLARIFICATION_REQUESTED"],
  EDIT_ASSIGNEE: ["ASSIGNED", "IN_PROGRESS", "REOPENED"],
  PRIORITY_BLOCKED: ["REJECTED", "CANCELLED", "CLOSED"],
  REVIEWABLE: ["PENDING_REVIEW"],
  PROVIDE: ["CLARIFICATION_REQUESTED"],
  CANCELLABLE: ["PENDING_REVIEW", "CLARIFICATION_REQUESTED", "ACCEPTED"],
  FIRST_ASSIGN: ["ACCEPTED", "REOPENED"],
  REASSIGN: ["ASSIGNED", "IN_PROGRESS"],
  START: ["ASSIGNED", "REOPENED"],
  RESOLVE: ["IN_PROGRESS"],
  CLOSE: ["RESOLVED"],
  REOPEN: ["RESOLVED", "CLOSED"],
  TRANSFER: ["PENDING_REVIEW", "CLARIFICATION_REQUESTED", "ACCEPTED", "ASSIGNED", "IN_PROGRESS", "REOPENED"],
  NO_COMMENT: ["CANCELLED", "REJECTED", "CLOSED"],
} as const satisfies Record<string, readonly TicketStatus[]>;

function assertStatus(current: TicketStatus, allowed: readonly TicketStatus[], action: string): void {
  if (!allowed.includes(current)) {
    throw DomainErrors.invalidStateTransition(`Cannot ${action} a ticket in status ${current}`, {
      status: current, allowedFrom: allowed,
    });
  }
}

// ---- shapes ---------------------------------------------------------------------------------

const summaryInclude = {
  category: { select: { id: true, name: true } },
  department: { select: deptRefSelect },
  requester: { select: { id: true, firstName: true, lastName: true } },
  assignedAgent: { select: userRefSelect },
} satisfies Prisma.TicketInclude;
type SummaryRow = Prisma.TicketGetPayload<{ include: typeof summaryInclude }>;

const detailInclude = {
  ...summaryInclude,
  requesterDepartment: { select: { id: true, name: true } },
  reviewedBy: { select: userRefSelect },
  resolvedBy: { select: userRefSelect },
} satisfies Prisma.TicketInclude;
type DetailRow = Prisma.TicketGetPayload<{ include: typeof detailInclude }>;

function toSummary(t: SummaryRow): TicketSummary {
  return {
    id: t.id, number: t.number, reference: ticketReference(t.number, t.createdAt), title: t.title,
    status: t.status, priority: t.priority,
    category: { id: t.category.id, name: t.category.name },
    department: toDeptRef(t.department),
    requester: { id: t.requester.id, firstName: t.requester.firstName, lastName: t.requester.lastName },
    assignedAgent: t.assignedAgent ? toUserRef(t.assignedAgent) : null,
    createdAt: iso(t.createdAt), updatedAt: iso(t.updatedAt),
  };
}

interface Snapshot { name?: string; email?: string; department?: string | null; roles?: string[] }

function allowedActions(t: DetailRow, auth: AuthContext, staff: boolean): TicketAction[] {
  const has = (k: string) => auth.permissions.includes(k);
  const isRequester = t.requesterId === auth.userId;
  const isAssignee = t.assignedAgentId === auth.userId;
  const st = t.status;
  const out: TicketAction[] = [];
  const canComment = has("tickets.comment") && !(S.NO_COMMENT as readonly string[]).includes(st);

  if (
    (isRequester && has("tickets.update_own") && (S.EDIT_REQUESTER as readonly string[]).includes(st)) ||
    (isAssignee && has("tickets.update_assigned") && (S.EDIT_ASSIGNEE as readonly string[]).includes(st))
  ) out.push("edit");
  if (has("tickets.change_priority") && !(S.PRIORITY_BLOCKED as readonly string[]).includes(st)) out.push("change_priority");
  if (st === "PENDING_REVIEW") {
    if (has("tickets.accept")) out.push("accept");
    if (has("tickets.reject")) out.push("reject");
    if (has("tickets.request_clarification")) out.push("request_clarification");
  }
  if (st === "CLARIFICATION_REQUESTED" && isRequester && has("tickets.update_own")) out.push("provide_clarification");
  if (has("tickets.assign")) {
    if ((S.FIRST_ASSIGN as readonly string[]).includes(st)) out.push("assign");
    if ((S.REASSIGN as readonly string[]).includes(st)) out.push("reassign");
  }
  if (has("tickets.change_status") && (S.START as readonly string[]).includes(st)) out.push("start");
  if (has("tickets.resolve") && st === "IN_PROGRESS") out.push("resolve");
  if (has("tickets.close") && st === "RESOLVED") out.push("close");
  if (has("tickets.reopen") && (S.REOPEN as readonly string[]).includes(st)) out.push("reopen");
  if (isRequester && has("tickets.update_own") && (S.CANCELLABLE as readonly string[]).includes(st)) out.push("cancel");
  if (has("tickets.transfer_department") && (S.TRANSFER as readonly string[]).includes(st)) out.push("transfer");
  if (canComment) out.push("comment");
  if (canComment && staff && has("tickets.view_work_notes")) out.push("add_work_note");
  if (has("tickets.delete")) out.push("delete");
  return out;
}

async function toDetail(db: Db, t: DetailRow, auth: AuthContext): Promise<TicketDetail> {
  const staff = await isStaffFor(db, auth, t);
  const snap = (t.requesterSnapshot ?? {}) as Snapshot;
  return {
    ...toSummary(t),
    description: t.description,
    requester: {
      id: t.requester.id, firstName: t.requester.firstName, lastName: t.requester.lastName,
      ...(staff
        ? {
            email: snap.email,
            department: t.requesterDepartment ? { id: t.requesterDepartment.id, name: t.requesterDepartment.name } : null,
            roles: snap.roles ?? [],
          }
        : {}),
    },
    reviewedBy: t.reviewedBy ? toUserRef(t.reviewedBy) : null,
    reviewedAt: isoOrNull(t.reviewedAt),
    rejectionReason: t.rejectionReason,
    resolution: t.resolution,
    resolvedBy: t.resolvedBy ? toUserRef(t.resolvedBy) : null,
    resolvedAt: isoOrNull(t.resolvedAt),
    closedAt: isoOrNull(t.closedAt),
    reopenCount: t.reopenCount,
    allowedActions: allowedActions(t, auth, staff),
  };
}

/** Detail of a ticket the caller has already been cleared for (scope checked, or just created by them). */
async function buildDetail(db: Db, id: string, auth: AuthContext): Promise<TicketDetail> {
  const row = await db.ticket.findUniqueOrThrow({ where: { id }, include: detailInclude });
  return toDetail(db, row, auth);
}

// ---- reads ----------------------------------------------------------------------------------

/** Scope check only. Used by comment / attachment controllers. null when out of scope. */
export async function findAccessRef(id: string, auth: AuthContext): Promise<TicketAccessRef | null> {
  const t = await prisma.ticket.findFirst({
    where: { id, ...ticketScopeWhere(auth) },
    select: { id: true, requesterId: true, status: true, departmentId: true, assignedAgentId: true },
  });
  if (!t) return null;
  return {
    id: t.id, requesterId: t.requesterId, status: t.status, departmentId: t.departmentId,
    staffScope: await isStaffFor(prisma, auth, t),
  };
}

function referenceNumber(search: string): number | null {
  const m = /^(?:WD-\d{4}-)?(\d{1,9})$/i.exec(search.trim());
  return m ? Number(m[1]) : null;
}

export async function list(query: ListTicketsQuery, auth: AuthContext): Promise<Paginated<TicketSummary>> {
  const and: Prisma.TicketWhereInput[] = [ticketScopeWhere(auth)];

  // `view` only narrows within what the caller may already see.
  if (query.view === "mine") and.push({ requesterId: auth.userId });
  if (query.view === "assigned") and.push({ assignedAgentId: auth.userId });
  if (query.view === "department") and.push({ department: { managers: { some: { userId: auth.userId } } } });

  if (query.status?.length) and.push({ status: { in: query.status } });
  if (query.priority?.length) and.push({ priority: { in: query.priority } });
  if (query.categoryId) and.push({ categoryId: query.categoryId });
  if (query.departmentId) and.push({ departmentId: query.departmentId });
  if (query.requesterId) and.push({ requesterId: query.requesterId });
  if (query.assignedAgentId === "me") and.push({ assignedAgentId: auth.userId });
  else if (query.assignedAgentId === "none") and.push({ assignedAgentId: null });
  else if (query.assignedAgentId) and.push({ assignedAgentId: query.assignedAgentId });
  if (query.createdFrom) and.push({ createdAt: { gte: query.createdFrom } });
  if (query.createdTo) and.push({ createdAt: { lte: query.createdTo } });
  if (query.search) {
    const n = referenceNumber(query.search);
    and.push({
      OR: [
        { title: { contains: query.search, mode: "insensitive" } },
        { description: { contains: query.search, mode: "insensitive" } },
        ...(n !== null ? [{ number: n }] : []),
      ],
    });
  }

  const where: Prisma.TicketWhereInput = { AND: and };
  const [rows, total] = await prisma.$transaction([
    prisma.ticket.findMany({
      where, include: summaryInclude,
      orderBy: [{ [query.sort]: query.order } as Prisma.TicketOrderByWithRelationInput, { number: "desc" }],
      skip: (query.page - 1) * query.limit, take: query.limit,
    }),
    prisma.ticket.count({ where }),
  ]);
  return { rows: rows.map(toSummary), total };
}

/** TicketDetail including allowedActions (permission + scope + status) and the staff-only requester fields. */
export async function findById(id: string, auth: AuthContext): Promise<TicketDetail | null> {
  const row = await prisma.ticket.findFirst({ where: { id, ...ticketScopeWhere(auth) }, include: detailInclude });
  return row ? toDetail(prisma, row, auth) : null;
}

// ---- writes: helpers ------------------------------------------------------------------------------

type TicketRow = Prisma.TicketGetPayload<object>;

async function addActivity(
  tx: Db,
  input: {
    ticketId: string; actorId: string; action: ActivityAction;
    from?: TicketStatus | null; to?: TicketStatus | null; metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await tx.ticketActivity.create({
    data: {
      ticketId: input.ticketId, actorId: input.actorId, action: input.action,
      fromStatus: input.from ?? null, toStatus: input.to ?? null,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

/**
 * Open a transaction, lock the ticket row, and load it only if it is inside the caller's scope.
 * The lock serialises concurrent transitions on one ticket, so the status we check is the status we change.
 */
async function withTicket<T>(
  id: string,
  auth: AuthContext,
  fn: (tx: Db, ticket: TicketRow) => Promise<T>
): Promise<T | null> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM tickets WHERE id = ${id}::uuid FOR UPDATE`;
    const ticket = await tx.ticket.findFirst({ where: { id, ...ticketScopeWhere(auth) } });
    if (!ticket) return null;
    return fn(tx, ticket);
  });
}

const auditCtx = (auth: AuthContext) => ({ actorId: auth.userId, ip: auth.ip, userAgent: auth.userAgent });

async function assertCategoryFits(db: Db, categoryId: string, departmentId: string): Promise<void> {
  const cat = await db.ticketCategory.findUnique({ where: { id: categoryId }, select: { departmentId: true, isActive: true } });
  if (!cat) throw Errors.notFound("Category");
  if (cat.departmentId !== departmentId) throw DomainErrors.unprocessable("Category does not belong to the department", "CATEGORY_MISMATCH");
  if (!cat.isActive) throw DomainErrors.unprocessable("Category is not active", "CATEGORY_INACTIVE");
}

// ---- writes ---------------------------------------------------------------------------------

/**
 * status = PENDING_REVIEW, requesterId = caller, requesterDepartmentId + requesterSnapshot { name, email, department, roles[] },
 * SUBMITTED activity row. 404 for unknown department/category; 422 if the department is inactive or the category
 * does not belong to it / is inactive.
 */
export async function create(input: CreateTicketBody, auth: AuthContext): Promise<TicketDetail> {
  return prisma.$transaction(async (tx) => {
    const dept = await tx.department.findUnique({ where: { id: input.departmentId }, select: { id: true, isActive: true } });
    if (!dept) throw Errors.notFound("Department");
    if (!dept.isActive) throw DomainErrors.unprocessable("Department is not active", "DEPARTMENT_INACTIVE");
    await assertCategoryFits(tx, input.categoryId, input.departmentId);

    const me = await tx.user.findUniqueOrThrow({
      where: { id: auth.userId },
      select: {
        firstName: true, lastName: true, email: true, departmentId: true,
        homeDepartment: { select: { name: true } },
        userRoles: { select: { role: { select: { name: true } } } },
      },
    });
    const snapshot: Snapshot = {
      name: `${me.firstName} ${me.lastName}`, email: me.email,
      department: me.homeDepartment?.name ?? null, roles: me.userRoles.map((r) => r.role.name).sort(),
    };
    const ticket = await tx.ticket.create({
      data: {
        title: input.title, description: input.description, categoryId: input.categoryId, priority: input.priority,
        status: "PENDING_REVIEW", requesterId: auth.userId, requesterDepartmentId: me.departmentId,
        requesterSnapshot: snapshot as Prisma.InputJsonValue, departmentId: input.departmentId,
      },
    });
    await addActivity(tx, { ticketId: ticket.id, actorId: auth.userId, action: "SUBMITTED", to: "PENDING_REVIEW" });
    return buildDetail(tx, ticket.id, auth);
  });
}

/**
 * Requester with tickets.update_own while PENDING_REVIEW / CLARIFICATION_REQUESTED, or assignee with
 * tickets.update_assigned while ASSIGNED / IN_PROGRESS / REOPENED. Category must belong to the ticket's department.
 * Activity UPDATED with before/after.
 */
export async function update(id: string, input: UpdateTicketBody, auth: AuthContext): Promise<TicketDetail | null> {
  return withTicket(id, auth, async (tx, t) => {
    const has = (k: string) => auth.permissions.includes(k);
    const asRequester = t.requesterId === auth.userId && has("tickets.update_own");
    const asAssignee = t.assignedAgentId === auth.userId && has("tickets.update_assigned");
    if (!asRequester && !asAssignee) throw Errors.forbidden("You cannot edit this ticket");
    const open =
      (asRequester && (S.EDIT_REQUESTER as readonly string[]).includes(t.status)) ||
      (asAssignee && (S.EDIT_ASSIGNEE as readonly string[]).includes(t.status));
    if (!open) throw DomainErrors.invalidStateTransition(`A ticket in status ${t.status} cannot be edited by you`, { status: t.status });
    if (input.categoryId !== undefined) await assertCategoryFits(tx, input.categoryId, t.departmentId);

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const data: Prisma.TicketUpdateInput = {};
    if (input.title !== undefined && input.title !== t.title) { changes.title = { from: t.title, to: input.title }; data.title = input.title; }
    if (input.description !== undefined && input.description !== t.description) {
      changes.description = { from: t.description, to: input.description }; data.description = input.description;
    }
    if (input.categoryId !== undefined && input.categoryId !== t.categoryId) {
      changes.categoryId = { from: t.categoryId, to: input.categoryId }; data.category = { connect: { id: input.categoryId } };
    }
    if (Object.keys(changes).length) {
      await tx.ticket.update({ where: { id }, data });
      await addActivity(tx, { ticketId: id, actorId: auth.userId, action: "UPDATED", metadata: { changes } });
    }
    return buildDetail(tx, id, auth);
  });
}

/** Not allowed on REJECTED / CANCELLED / CLOSED. Activity PRIORITY_CHANGED. */
export async function changePriority(id: string, input: ChangePriorityBody, auth: AuthContext): Promise<TicketDetail | null> {
  return withTicket(id, auth, async (tx, t) => {
    if ((S.PRIORITY_BLOCKED as readonly string[]).includes(t.status)) {
      throw DomainErrors.invalidStateTransition(`Priority cannot be changed on a ${t.status} ticket`, { status: t.status });
    }
    if (input.priority !== t.priority) {
      await tx.ticket.update({ where: { id }, data: { priority: input.priority } });
      await addActivity(tx, {
        ticketId: id, actorId: auth.userId, action: "PRIORITY_CHANGED",
        metadata: { from: t.priority, to: input.priority, reason: input.reason ?? null },
      });
    }
    return buildDetail(tx, id, auth);
  });
}

/** Soft delete (deletedAt). Audit tickets.deleted. false when out of scope / missing. */
export async function softDelete(id: string, auth: AuthContext): Promise<boolean> {
  const done = await withTicket(id, auth, async (tx, t) => {
    await tx.ticket.update({ where: { id }, data: { deletedAt: new Date() } });
    await addActivity(tx, { ticketId: id, actorId: auth.userId, action: "DELETED", from: t.status });
    await AuditLogModel.record(
      { ...auditCtx(auth), action: "tickets.deleted", entityType: "ticket", entityId: id, before: { number: t.number, status: t.status, title: t.title } },
      tx
    );
    return true;
  });
  return done === true;
}

/** PENDING_REVIEW -> ACCEPTED. Sets reviewedById/reviewedAt. Activity ACCEPTED, audit tickets.accepted. */
export async function accept(id: string, input: AcceptBody, auth: AuthContext): Promise<TicketDetail | null> {
  return withTicket(id, auth, async (tx, t) => {
    assertStatus(t.status, S.REVIEWABLE, "accept");
    await tx.ticket.update({ where: { id }, data: { status: "ACCEPTED", reviewedById: auth.userId, reviewedAt: new Date() } });
    await addActivity(tx, { ticketId: id, actorId: auth.userId, action: "ACCEPTED", from: t.status, to: "ACCEPTED", metadata: { note: input.note ?? null } });
    await AuditLogModel.record({ ...auditCtx(auth), action: "tickets.accepted", entityType: "ticket", entityId: id, before: { status: t.status }, after: { status: "ACCEPTED" } }, tx);
    return buildDetail(tx, id, auth);
  });
}

/** PENDING_REVIEW -> REJECTED (terminal). Stores rejectionReason, reviewedById/At. Activity REJECTED, audit tickets.rejected. */
export async function reject(id: string, input: RejectBody, auth: AuthContext): Promise<TicketDetail | null> {
  return withTicket(id, auth, async (tx, t) => {
    assertStatus(t.status, S.REVIEWABLE, "reject");
    await tx.ticket.update({
      where: { id },
      data: { status: "REJECTED", rejectionReason: input.reason, reviewedById: auth.userId, reviewedAt: new Date() },
    });
    await addActivity(tx, { ticketId: id, actorId: auth.userId, action: "REJECTED", from: t.status, to: "REJECTED", metadata: { reason: input.reason } });
    await AuditLogModel.record({ ...auditCtx(auth), action: "tickets.rejected", entityType: "ticket", entityId: id, before: { status: t.status }, after: { status: "REJECTED", reason: input.reason } }, tx);
    return buildDetail(tx, id, auth);
  });
}

/** PENDING_REVIEW -> CLARIFICATION_REQUESTED. Creates a CLARIFICATION comment. Activity CLARIFICATION_REQUESTED. */
export async function requestClarification(id: string, input: RequestClarificationBody, auth: AuthContext): Promise<TicketDetail | null> {
  return withTicket(id, auth, async (tx, t) => {
    assertStatus(t.status, S.REVIEWABLE, "request clarification on");
    const comment = await tx.ticketComment.create({ data: { ticketId: id, authorId: auth.userId, kind: "CLARIFICATION", body: input.question } });
    await tx.ticket.update({ where: { id }, data: { status: "CLARIFICATION_REQUESTED" } });
    await addActivity(tx, { ticketId: id, actorId: auth.userId, action: "CLARIFICATION_REQUESTED", from: t.status, to: "CLARIFICATION_REQUESTED", metadata: { commentId: comment.id } });
    return buildDetail(tx, id, auth);
  });
}

/** Requester only (requesterId = caller). CLARIFICATION_REQUESTED -> PENDING_REVIEW. Creates a CLARIFICATION comment; optional description update. */
export async function provideClarification(id: string, input: ProvideClarificationBody, auth: AuthContext): Promise<TicketDetail | null> {
  return withTicket(id, auth, async (tx, t) => {
    if (t.requesterId !== auth.userId) throw Errors.forbidden("Only the requester can answer a clarification request");
    assertStatus(t.status, S.PROVIDE, "provide clarification on");
    const comment = await tx.ticketComment.create({ data: { ticketId: id, authorId: auth.userId, kind: "CLARIFICATION", body: input.response } });
    await tx.ticket.update({
      where: { id },
      data: { status: "PENDING_REVIEW", ...(input.description !== undefined ? { description: input.description } : {}) },
    });
    await addActivity(tx, {
      ticketId: id, actorId: auth.userId, action: "CLARIFICATION_PROVIDED", from: t.status, to: "PENDING_REVIEW",
      metadata: { commentId: comment.id, descriptionUpdated: input.description !== undefined },
    });
    return buildDetail(tx, id, auth);
  });
}

/**
 * ACCEPTED/REOPENED -> ASSIGNED, or reassign from ASSIGNED/IN_PROGRESS (status unchanged, reason REQUIRED when the ticket
 * already has an agent). Agent must be ACTIVE, in department_members and hold tickets.view_assigned, else
 * ApiError(422, ..., "AGENT_NOT_ELIGIBLE"). Closes the current ticket_assignments row, inserts a new one. Activity ASSIGNED / REASSIGNED, audit tickets.assigned / tickets.reassigned.
 */
export async function assign(id: string, input: AssignBody, auth: AuthContext): Promise<TicketDetail | null> {
  return withTicket(id, auth, async (tx, t) => {
    assertStatus(t.status, [...S.FIRST_ASSIGN, ...S.REASSIGN], "assign");
    const isReassign = (S.REASSIGN as readonly string[]).includes(t.status);
    const previousAgentId = t.assignedAgentId;

    const agent = await tx.user.findFirst({ where: { id: input.agentId, ...eligibleAgentWhere(t.departmentId) }, select: { id: true } });
    if (!agent) throw DomainErrors.agentNotEligible();

    if (isReassign && previousAgentId === input.agentId) throw Errors.conflict("Ticket is already assigned to this agent");
    const changesAgent = previousAgentId !== input.agentId;
    if (previousAgentId && changesAgent && !input.reason) throw Errors.validation("A reason is required when reassigning a ticket");

    const now = new Date();
    if (changesAgent) {
      await tx.ticketAssignment.updateMany({ where: { ticketId: id, unassignedAt: null }, data: { unassignedAt: now } });
      await tx.ticketAssignment.create({
        data: { ticketId: id, agentId: input.agentId, assignedById: auth.userId, reason: input.reason ?? null },
      });
    }
    const newStatus: TicketStatus = isReassign ? t.status : "ASSIGNED";
    await tx.ticket.update({ where: { id }, data: { assignedAgentId: input.agentId, status: newStatus } });

    const reassigned = !!previousAgentId && changesAgent;
    await addActivity(tx, {
      ticketId: id, actorId: auth.userId, action: reassigned ? "REASSIGNED" : "ASSIGNED", from: t.status, to: newStatus,
      metadata: { agentId: input.agentId, previousAgentId, reason: input.reason ?? null, note: input.note ?? null },
    });
    await AuditLogModel.record(
      {
        ...auditCtx(auth), action: reassigned ? "tickets.reassigned" : "tickets.assigned", entityType: "ticket", entityId: id,
        before: { assignedAgentId: previousAgentId, status: t.status }, after: { assignedAgentId: input.agentId, status: newStatus, reason: input.reason ?? null },
      },
      tx
    );
    return buildDetail(tx, id, auth);
  });
}

/** ASSIGNED/REOPENED -> IN_PROGRESS. Activity STATUS_CHANGED. */
export async function changeStatus(id: string, input: ChangeStatusBody, auth: AuthContext): Promise<TicketDetail | null> {
  return withTicket(id, auth, async (tx, t) => {
    assertStatus(t.status, S.START, "start work on");
    await tx.ticket.update({ where: { id }, data: { status: "IN_PROGRESS" } });
    await addActivity(tx, { ticketId: id, actorId: auth.userId, action: "STATUS_CHANGED", from: t.status, to: "IN_PROGRESS", metadata: { note: input.note ?? null } });
    return buildDetail(tx, id, auth);
  });
}

/** IN_PROGRESS -> RESOLVED. Sets resolution, resolvedById/At. Activity RESOLVED. */
export async function resolve(id: string, input: ResolveBody, auth: AuthContext): Promise<TicketDetail | null> {
  return withTicket(id, auth, async (tx, t) => {
    assertStatus(t.status, S.RESOLVE, "resolve");
    await tx.ticket.update({
      where: { id },
      data: { status: "RESOLVED", resolution: input.resolution, resolvedById: auth.userId, resolvedAt: new Date(), closedAt: null },
    });
    await addActivity(tx, { ticketId: id, actorId: auth.userId, action: "RESOLVED", from: t.status, to: "RESOLVED", metadata: { resolution: input.resolution } });
    return buildDetail(tx, id, auth);
  });
}

/** RESOLVED -> CLOSED. Sets closedAt. Activity CLOSED. */
export async function close(id: string, input: CloseBody, auth: AuthContext): Promise<TicketDetail | null> {
  return withTicket(id, auth, async (tx, t) => {
    assertStatus(t.status, S.CLOSE, "close");
    await tx.ticket.update({ where: { id }, data: { status: "CLOSED", closedAt: new Date() } });
    await addActivity(tx, { ticketId: id, actorId: auth.userId, action: "CLOSED", from: t.status, to: "CLOSED", metadata: { note: input.note ?? null } });
    return buildDetail(tx, id, auth);
  });
}

/**
 * RESOLVED/CLOSED -> REOPENED. reopenCount + 1, clears closedAt. Activity REOPENED.
 * The previous resolution is kept in the RESOLVED activity row; the live resolution fields are cleared.
 */
export async function reopen(id: string, input: ReopenBody, auth: AuthContext): Promise<TicketDetail | null> {
  return withTicket(id, auth, async (tx, t) => {
    assertStatus(t.status, S.REOPEN, "reopen");
    await tx.ticket.update({
      where: { id },
      data: {
        status: "REOPENED", reopenCount: { increment: 1 }, closedAt: null,
        resolution: null, resolvedById: null, resolvedAt: null,
      },
    });
    await addActivity(tx, {
      ticketId: id, actorId: auth.userId, action: "REOPENED", from: t.status, to: "REOPENED",
      metadata: { reason: input.reason, previousResolution: t.resolution },
    });
    return buildDetail(tx, id, auth);
  });
}

/** Requester only. PENDING_REVIEW/CLARIFICATION_REQUESTED/ACCEPTED -> CANCELLED (terminal). Activity CANCELLED. */
export async function cancel(id: string, input: CancelBody, auth: AuthContext): Promise<TicketDetail | null> {
  return withTicket(id, auth, async (tx, t) => {
    if (t.requesterId !== auth.userId) throw Errors.forbidden("Only the requester can cancel a ticket");
    assertStatus(t.status, S.CANCELLABLE, "cancel");
    await tx.ticket.update({ where: { id }, data: { status: "CANCELLED" } });
    await addActivity(tx, { ticketId: id, actorId: auth.userId, action: "CANCELLED", from: t.status, to: "CANCELLED", metadata: { reason: input.reason ?? null } });
    return buildDetail(tx, id, auth);
  });
}

/**
 * Any non-terminal status before RESOLVED. Change department + category, reset to PENDING_REVIEW, close the current
 * assignment, clear assignedAgentId. 422 if the destination is inactive / is the same department / category mismatch.
 * Activity DEPARTMENT_TRANSFERRED, audit tickets.transferred.
 */
export async function transfer(id: string, input: TransferBody, auth: AuthContext): Promise<TicketTransferResult | null> {
  return withTicket(id, auth, async (tx, t) => {
    assertStatus(t.status, S.TRANSFER, "transfer");
    if (input.departmentId === t.departmentId) throw DomainErrors.unprocessable("Ticket is already in this department", "SAME_DEPARTMENT");
    const dest = await tx.department.findUnique({ where: { id: input.departmentId }, select: { id: true, isActive: true } });
    if (!dest) throw Errors.notFound("Department");
    if (!dest.isActive) throw DomainErrors.unprocessable("Destination department is not active", "DEPARTMENT_INACTIVE");
    await assertCategoryFits(tx, input.categoryId, input.departmentId);

    await tx.ticketAssignment.updateMany({ where: { ticketId: id, unassignedAt: null }, data: { unassignedAt: new Date() } });
    const updated = await tx.ticket.update({
      where: { id },
      data: {
        departmentId: input.departmentId, categoryId: input.categoryId, status: "PENDING_REVIEW",
        assignedAgentId: null, reviewedById: null, reviewedAt: null,
      },
    });
    await addActivity(tx, {
      ticketId: id, actorId: auth.userId, action: "DEPARTMENT_TRANSFERRED", from: t.status, to: "PENDING_REVIEW",
      metadata: {
        fromDepartmentId: t.departmentId, toDepartmentId: input.departmentId,
        fromCategoryId: t.categoryId, toCategoryId: input.categoryId, previousAgentId: t.assignedAgentId, reason: input.reason,
      },
    });
    await AuditLogModel.record(
      {
        ...auditCtx(auth), action: "tickets.transferred", entityType: "ticket", entityId: id,
        before: { departmentId: t.departmentId, status: t.status }, after: { departmentId: input.departmentId, status: "PENDING_REVIEW", reason: input.reason },
      },
      tx
    );
    return {
      id: updated.id, number: updated.number, reference: ticketReference(updated.number, updated.createdAt),
      status: updated.status, departmentId: updated.departmentId,
    };
  });
}
