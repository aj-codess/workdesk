// Dashboard aggregates. "Open" = any status except RESOLVED, CLOSED, REJECTED, CANCELLED.
// recentlyUpdated = the 5 latest tickets by updatedAt.
import type { AuthContext } from "@/types/auth";
import type { TicketSummary, UserRef } from "@/types/dto";
import type { Prisma, TicketStatus } from "@prisma/client";
import { prisma } from "@/config/prisma";
import { deptRefSelect, iso, ticketReference, toDeptRef, toUserRef, userRefSelect } from "@/utilities/mappers";
import { ticketScopeWhere } from "@/models/scope";

export interface MyRequestsDashboard {
  total: number; open: number; pending: number; inProgress: number; resolved: number;
  byStatus: Record<string, number>; recentlyUpdated: TicketSummary[];
}
export interface MyWorkDashboard {
  assigned: number; open: number; inProgress: number; resolvedLast30Days: number; recentlyUpdated: TicketSummary[];
}
export interface DepartmentDashboard {
  departments: {
    department: { id: string; name: string };
    totalRequests: number; pendingReview: number; clarificationRequested: number;
    unassignedAccepted: number; awaitingResolution: number;
    byAgent: { agent: UserRef; open: number; resolved: number }[];
    /** null when fewer than 5 resolved tickets */
    avgResolutionHours: number | null; resolvedSampleSize: number;
  }[];
}
export interface SystemDashboard {
  tickets: { total: number; open: number; resolved: number; byStatus: Record<string, number>; byPriority: Record<string, number> };
  /** Only present when `includeUsers` (caller also holds users.view). */
  users?: { total: number; active: number; supportAgents: number };
}


const ALL_STATUSES: TicketStatus[] = [
  "PENDING_REVIEW", "CLARIFICATION_REQUESTED", "ACCEPTED", "REJECTED", "ASSIGNED",
  "IN_PROGRESS", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED",
];
const ALL_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const DONE: TicketStatus[] = ["RESOLVED", "CLOSED", "REJECTED", "CANCELLED"];
const MIN_RESOLVED_SAMPLE = 5;

const summaryInclude = {
  category: { select: { id: true, name: true } },
  department: { select: deptRefSelect },
  requester: { select: { id: true, firstName: true, lastName: true } },
  assignedAgent: { select: userRefSelect },
} satisfies Prisma.TicketInclude;

async function recent(where: Prisma.TicketWhereInput): Promise<TicketSummary[]> {
  const rows = await prisma.ticket.findMany({ where, include: summaryInclude, orderBy: [{ updatedAt: "desc" }, { number: "desc" }], take: 5 });
  return rows.map((t) => ({
    id: t.id, number: t.number, reference: ticketReference(t.number, t.createdAt), title: t.title,
    status: t.status, priority: t.priority,
    category: { id: t.category.id, name: t.category.name }, department: toDeptRef(t.department),
    requester: { id: t.requester.id, firstName: t.requester.firstName, lastName: t.requester.lastName },
    assignedAgent: t.assignedAgent ? toUserRef(t.assignedAgent) : null,
    createdAt: iso(t.createdAt), updatedAt: iso(t.updatedAt),
  }));
}

async function statusCounts(where: Prisma.TicketWhereInput): Promise<Record<string, number>> {
  const rows = await prisma.ticket.groupBy({ by: ["status"], where, _count: { _all: true } });
  const out: Record<string, number> = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0]));
  for (const r of rows) out[r.status] = r._count._all;
  return out;
}

const sum = (counts: Record<string, number>, keys: string[]) => keys.reduce((n, k) => n + (counts[k] ?? 0), 0);
const openCount = (counts: Record<string, number>) => sum(counts, ALL_STATUSES.filter((s) => !DONE.includes(s)));

function avgHours(rows: { createdAt: Date; resolvedAt: Date | null }[]): number | null {
  const done = rows.filter((r): r is { createdAt: Date; resolvedAt: Date } => r.resolvedAt !== null);
  if (done.length === 0) return null;
  const ms = done.reduce((n, r) => n + (r.resolvedAt.getTime() - r.createdAt.getTime()), 0) / done.length;
  return Math.round((ms / 3_600_000) * 10) / 10;
}

export async function myRequests(auth: AuthContext): Promise<MyRequestsDashboard> {
  const where: Prisma.TicketWhereInput = { requesterId: auth.userId, deletedAt: null };
  const [byStatus, recentlyUpdated] = await Promise.all([statusCounts(where), recent(where)]);
  return {
    total: sum(byStatus, ALL_STATUSES), open: openCount(byStatus),
    pending: sum(byStatus, ["PENDING_REVIEW", "CLARIFICATION_REQUESTED"]),
    inProgress: sum(byStatus, ["IN_PROGRESS"]), resolved: sum(byStatus, ["RESOLVED", "CLOSED"]),
    byStatus, recentlyUpdated,
  };
}

export async function myWork(auth: AuthContext): Promise<MyWorkDashboard> {
  const where: Prisma.TicketWhereInput = { assignedAgentId: auth.userId, deletedAt: null };
  const since = new Date(Date.now() - 30 * 24 * 3_600_000);
  const [byStatus, recentlyUpdated, resolvedLast30Days] = await Promise.all([
    statusCounts(where), recent(where),
    prisma.ticket.count({ where: { resolvedById: auth.userId, deletedAt: null, resolvedAt: { gte: since } } }),
  ]);
  return {
    assigned: sum(byStatus, ["ASSIGNED"]), open: openCount(byStatus), inProgress: sum(byStatus, ["IN_PROGRESS"]),
    resolvedLast30Days, recentlyUpdated,
  };
}

/** departmentId must be one the caller manages (else return null -> 404). Omitted = all managed departments. */
export async function department(departmentId: string | undefined, auth: AuthContext): Promise<DepartmentDashboard | null> {
  const managed = await prisma.department.findMany({
    where: { managers: { some: { userId: auth.userId } }, ...(departmentId ? { id: departmentId } : {}) },
    select: { id: true, name: true }, orderBy: { name: "asc" },
  });
  if (departmentId && managed.length === 0) return null;

  const departments = await Promise.all(
    managed.map(async (d) => {
      const where: Prisma.TicketWhereInput = { departmentId: d.id, deletedAt: null };
      const [byStatus, perAgent, resolved] = await Promise.all([
        statusCounts(where),
        prisma.ticket.groupBy({
          by: ["assignedAgentId", "status"], _count: { _all: true },
          where: { ...where, assignedAgentId: { not: null } },
        }),
        prisma.ticket.findMany({
          where: { ...where, resolvedAt: { not: null } }, select: { createdAt: true, resolvedAt: true }, take: 20_000,
        }),
      ]);
      const unassignedAccepted = await prisma.ticket.count({ where: { ...where, status: "ACCEPTED", assignedAgentId: null } });

      const agentIds = [...new Set(perAgent.map((r) => r.assignedAgentId!))];
      const agents = await prisma.user.findMany({ where: { id: { in: agentIds } }, select: userRefSelect });
      const byAgent = agents
        .map((agent) => {
          const mine = perAgent.filter((r) => r.assignedAgentId === agent.id);
          return {
            agent: toUserRef(agent),
            open: mine.filter((r) => !DONE.includes(r.status)).reduce((n, r) => n + r._count._all, 0),
            resolved: mine.filter((r) => r.status === "RESOLVED" || r.status === "CLOSED").reduce((n, r) => n + r._count._all, 0),
          };
        })
        .sort((a, b) => b.open - a.open || a.agent.lastName.localeCompare(b.agent.lastName));

      return {
        department: { id: d.id, name: d.name },
        totalRequests: sum(byStatus, ALL_STATUSES), pendingReview: byStatus.PENDING_REVIEW ?? 0,
        clarificationRequested: byStatus.CLARIFICATION_REQUESTED ?? 0, unassignedAccepted,
        awaitingResolution: sum(byStatus, ["ASSIGNED", "IN_PROGRESS"]), byAgent,
        avgResolutionHours: resolved.length >= MIN_RESOLVED_SAMPLE ? avgHours(resolved) : null,
        resolvedSampleSize: resolved.length,
      };
    })
  );
  return { departments };
}

export async function system(opts: { includeUsers: boolean }, auth?: AuthContext): Promise<SystemDashboard> {
  // Route is gated by tickets.view_all, so the scope is "everything"; still derive it so the rule has one source.
  const where: Prisma.TicketWhereInput = auth ? ticketScopeWhere(auth) : { deletedAt: null };
  const [byStatus, priorityRows] = await Promise.all([
    statusCounts(where),
    prisma.ticket.groupBy({ by: ["priority"], where, _count: { _all: true } }),
  ]);
  const byPriority: Record<string, number> = Object.fromEntries(ALL_PRIORITIES.map((p) => [p, 0]));
  for (const r of priorityRows) byPriority[r.priority] = r._count._all;

  const result: SystemDashboard = {
    tickets: {
      total: sum(byStatus, ALL_STATUSES), open: openCount(byStatus),
      resolved: sum(byStatus, ["RESOLVED", "CLOSED"]), byStatus, byPriority,
    },
  };
  if (opts.includeUsers) {
    const [total, active, supportAgents] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.user.count({ where: { deletedAt: null, status: "ACTIVE" } }),
      prisma.user.count({ where: { deletedAt: null, status: "ACTIVE", memberships: { some: {} } } }),
    ]);
    result.users = { total, active, supportAgents };
  }
  return result;
}
