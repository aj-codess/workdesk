// Ticket comments. Callers have already been scope-checked via TicketModel.findAccessRef.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/config/prisma";
import type { Paginated } from "@/types/pagination";
import type { AuthContext } from "@/types/auth";
import type { Comment } from "@/types/dto";
import type { CreateCommentBody, ListCommentsQuery } from "@/validators/ticket.validator";
import { Errors } from "@/utilities/api-error";
import { DomainErrors } from "@/utilities/domain-errors";
import { iso, isoOrNull } from "@/utilities/mappers";

const include = { author: { select: { id: true, firstName: true, lastName: true } } } satisfies Prisma.TicketCommentInclude;
type Row = Prisma.TicketCommentGetPayload<{ include: typeof include }>;

const toComment = (c: Row): Comment => ({
  id: c.id, kind: c.kind, body: c.body,
  author: { id: c.author.id, firstName: c.author.firstName, lastName: c.author.lastName },
  createdAt: iso(c.createdAt), editedAt: isoOrNull(c.editedAt),
});

const CLOSED_FOR_COMMENTS = ["CANCELLED", "REJECTED", "CLOSED"] as const;

/** Oldest first. WORK_NOTE rows only when `includeWorkNotes` (tickets.view_work_notes AND staff scope). Excludes soft-deleted. */
export async function list(
  ticketId: string,
  query: ListCommentsQuery,
  opts: { includeWorkNotes: boolean }
): Promise<Paginated<Comment>> {
  const where: Prisma.TicketCommentWhereInput = {
    ticketId,
    deletedAt: null,
    ...(opts.includeWorkNotes ? {} : { kind: { not: "WORK_NOTE" } }),
    ...(query.kind ? { kind: query.kind } : {}),
  };
  // Asking for WORK_NOTE without the right to see them must yield nothing, not everything.
  if (!opts.includeWorkNotes && query.kind === "WORK_NOTE") return { rows: [], total: 0 };
  const [rows, total] = await prisma.$transaction([
    prisma.ticketComment.findMany({
      where, include, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: (query.page - 1) * query.limit, take: query.limit,
    }),
    prisma.ticketComment.count({ where }),
  ]);
  return { rows: rows.map(toComment), total };
}

/** Blocked on CANCELLED / REJECTED / CLOSED tickets (409 INVALID_STATE_TRANSITION). Activity COMMENTED. */
export async function create(ticketId: string, input: CreateCommentBody, auth: AuthContext): Promise<Comment> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM tickets WHERE id = ${ticketId}::uuid FOR UPDATE`;
    const ticket = await tx.ticket.findFirst({ where: { id: ticketId, deletedAt: null }, select: { status: true } });
    if (!ticket) throw Errors.notFound("Ticket");
    if ((CLOSED_FOR_COMMENTS as readonly string[]).includes(ticket.status)) {
      throw DomainErrors.invalidStateTransition(`Comments are closed on a ${ticket.status} ticket`, { status: ticket.status });
    }
    const row = await tx.ticketComment.create({
      data: { ticketId, authorId: auth.userId, kind: input.kind, body: input.body },
      include,
    });
    await tx.ticketActivity.create({
      data: { ticketId, actorId: auth.userId, action: "COMMENTED", metadata: { commentId: row.id, kind: row.kind } },
    });
    await tx.ticket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } });
    return toComment(row);
  });
}

/** Author only; not allowed on CLARIFICATION comments. Sets editedAt. null when not found / not the author. */
export async function update(ticketId: string, commentId: string, body: string, auth: AuthContext): Promise<Comment | null> {
  const existing = await prisma.ticketComment.findFirst({
    where: { id: commentId, ticketId, deletedAt: null, authorId: auth.userId },
    select: { id: true, kind: true },
  });
  if (!existing) return null;
  if (existing.kind === "CLARIFICATION") throw Errors.conflict("Clarification comments cannot be edited");
  const row = await prisma.ticketComment.update({ where: { id: commentId }, data: { body, editedAt: new Date() }, include });
  return toComment(row);
}

/** Soft delete. Allowed for the author, or anyone when `canDeleteAny` (holds tickets.delete). false when not found / not allowed. */
export async function softDelete(
  ticketId: string,
  commentId: string,
  auth: AuthContext,
  opts: { canDeleteAny: boolean }
): Promise<boolean> {
  const res = await prisma.ticketComment.updateMany({
    where: { id: commentId, ticketId, deletedAt: null, ...(opts.canDeleteAny ? {} : { authorId: auth.userId }) },
    data: { deletedAt: new Date() },
  });
  return res.count === 1;
}
