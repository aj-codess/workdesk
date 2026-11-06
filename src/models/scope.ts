// Internal helpers shared by models: department scope and agent eligibility. Pure queries, no HTTP.
import type { Prisma } from "@prisma/client";
import type { AuthContext } from "@/types/auth";
import type { Db } from "@/utilities/mappers";

/** Ticket statuses in which an agent is actively holding the work. */
export const OPEN_WORK_STATUSES = ["ASSIGNED", "IN_PROGRESS", "REOPENED"] as const;

export async function managesDepartment(db: Db, userId: string, departmentId: string): Promise<boolean> {
  return (await db.departmentManager.count({ where: { userId, departmentId } })) > 0;
}

/** Users who may be given tickets of `departmentId`: ACTIVE, not deleted, member of it, and holding tickets.view_assigned. */
export function eligibleAgentWhere(departmentId: string): Prisma.UserWhereInput {
  return {
    status: "ACTIVE",
    deletedAt: null,
    memberships: { some: { departmentId } },
    userRoles: {
      some: { role: { isActive: true, rolePermissions: { some: { permission: { key: "tickets.view_assigned" } } } } },
    },
  };
}

/** Wide view of a department: tickets.view_all, or managing it. */
export async function canSeeDepartment(db: Db, auth: Pick<AuthContext, "userId" | "permissions">, departmentId: string): Promise<boolean> {
  if (auth.permissions.includes("tickets.view_all")) return true;
  return managesDepartment(db, auth.userId, departmentId);
}

const NO_ROWS: Prisma.TicketWhereInput = { id: { in: [] } };

/**
 * The caller's ticket visibility, as a Prisma filter (union of what their permissions grant):
 * view_all -> everything; view_department -> departments they manage; view_assigned -> assigned to them;
 * view_own -> requested by them. No view permission at all -> nothing. Soft-deleted tickets are never visible.
 */
export function ticketScopeWhere(auth: Pick<AuthContext, "userId" | "permissions">): Prisma.TicketWhereInput {
  const has = (k: string) => auth.permissions.includes(k);
  if (has("tickets.view_all")) return { deletedAt: null };
  const or: Prisma.TicketWhereInput[] = [];
  if (has("tickets.view_department")) or.push({ department: { managers: { some: { userId: auth.userId } } } });
  if (has("tickets.view_assigned")) or.push({ assignedAgentId: auth.userId });
  if (has("tickets.view_own")) or.push({ requesterId: auth.userId });
  return or.length ? { deletedAt: null, OR: or } : NO_ROWS;
}

/**
 * True when the caller sees THIS ticket as staff (not merely as its requester). Decides whether work notes,
 * activity metadata and the requester's contact details are visible.
 */
export async function isStaffFor(
  db: Db,
  auth: Pick<AuthContext, "userId" | "permissions">,
  ticket: { departmentId: string; assignedAgentId: string | null }
): Promise<boolean> {
  const has = (k: string) => auth.permissions.includes(k);
  if (has("tickets.view_all")) return true;
  if (has("tickets.view_assigned") && ticket.assignedAgentId === auth.userId) return true;
  if (has("tickets.view_department") && (await managesDepartment(db, auth.userId, ticket.departmentId))) return true;
  return false;
}
