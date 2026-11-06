// Reports are computed OVER THE CALLER'S VISIBLE TICKETS (same scope union as TicketModel). Dates default to the last 30 days.
import type { AuthContext } from "@/types/auth";
import type { UserRef } from "@/types/dto";
import type { ExportQuery, SummaryQuery, TeamPerformanceQuery, TicketsReportQuery } from "@/validators/report.validator";
import type { Prisma, TicketStatus } from "@prisma/client";
import { prisma } from "@/config/prisma";
import { ticketReference, toUserRef, userRefSelect } from "@/utilities/mappers";
import { ticketScopeWhere } from "@/models/scope";

export interface ReportSummary {
  period: { from: string; to: string };
  totals: { created: number; resolved: number; closed: number; rejected: number; open: number };
  byStatus: Record<string, number>; byPriority: Record<string, number>;
  avgResolutionHours: number | null; reopenRate: number;
}
export interface TicketsReport { groupBy: string; rows: { key: string; label: string; count: number }[] }
export interface TeamPerformanceRow {
  agent: UserRef; assigned: number; resolved: number; open: number; reopened: number; avgResolutionHours: number | null;
}
export interface TeamPerformanceReport { rows: TeamPerformanceRow[] }


const DAY_MS = 86_400_000;
const ROW_CAP = 50_000;
const EXPORT_CAP = 10_000;
const OPEN: TicketStatus[] = ["PENDING_REVIEW", "CLARIFICATION_REQUESTED", "ACCEPTED", "ASSIGNED", "IN_PROGRESS", "REOPENED"];

interface Period { from: Date; to: Date; departmentId?: string }

/** Defaults to the last 30 days. A bare date for `to` (midnight UTC) means "through the end of that day". */
function period(q: { from?: Date; to?: Date; departmentId?: string }): Period {
  let to = q.to ?? new Date();
  if (q.to && to.getUTCHours() === 0 && to.getUTCMinutes() === 0 && to.getUTCSeconds() === 0 && to.getUTCMilliseconds() === 0) {
    to = new Date(to.getTime() + DAY_MS - 1);
  }
  const from = q.from ?? new Date(to.getTime() - 30 * DAY_MS);
  return { from, to, departmentId: q.departmentId };
}

/** Visible tickets, narrowed by the optional department filter. Reports never widen scope. */
function base(auth: AuthContext, p: Period): Prisma.TicketWhereInput[] {
  return [ticketScopeWhere(auth), ...(p.departmentId ? [{ departmentId: p.departmentId }] : [])];
}

const createdIn = (p: Period): Prisma.TicketWhereInput => ({ createdAt: { gte: p.from, lte: p.to } });

function avgHours(rows: { createdAt: Date; resolvedAt: Date | null }[]): number | null {
  const done = rows.filter((r): r is { createdAt: Date; resolvedAt: Date } => r.resolvedAt !== null);
  if (!done.length) return null;
  const ms = done.reduce((n, r) => n + (r.resolvedAt.getTime() - r.createdAt.getTime()), 0) / done.length;
  return Math.round((ms / 3_600_000) * 10) / 10;
}

/**
 * Totals: created = created in the period; resolved / closed = reached that state in the period; rejected = rejected
 * in the period; open = created in the period and still open now. reopenRate = reopened / (resolved, closed or reopened).
 */
export async function summary(query: SummaryQuery, auth: AuthContext): Promise<ReportSummary> {
  const p = period(query);
  const scope = base(auth, p);
  const [created, resolved, closed, rejected, open, statusRows, prioRows, resolvedRows, everResolved, reopened] = await Promise.all([
    prisma.ticket.count({ where: { AND: [...scope, createdIn(p)] } }),
    prisma.ticket.count({ where: { AND: [...scope, { resolvedAt: { gte: p.from, lte: p.to } }] } }),
    prisma.ticket.count({ where: { AND: [...scope, { closedAt: { gte: p.from, lte: p.to } }] } }),
    prisma.ticket.count({ where: { AND: [...scope, { status: "REJECTED", reviewedAt: { gte: p.from, lte: p.to } }] } }),
    prisma.ticket.count({ where: { AND: [...scope, createdIn(p), { status: { in: OPEN } }] } }),
    prisma.ticket.groupBy({ by: ["status"], where: { AND: [...scope, createdIn(p)] }, _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ["priority"], where: { AND: [...scope, createdIn(p)] }, _count: { _all: true } }),
    prisma.ticket.findMany({
      where: { AND: [...scope, { resolvedAt: { gte: p.from, lte: p.to } }] }, select: { createdAt: true, resolvedAt: true }, take: ROW_CAP,
    }),
    prisma.ticket.count({ where: { AND: [...scope, createdIn(p), { OR: [{ status: { in: ["RESOLVED", "CLOSED", "REOPENED"] } }, { reopenCount: { gt: 0 } }] }] } }),
    prisma.ticket.count({ where: { AND: [...scope, createdIn(p), { reopenCount: { gt: 0 } }] } }),
  ]);
  return {
    period: { from: p.from.toISOString(), to: p.to.toISOString() },
    totals: { created, resolved, closed, rejected, open },
    byStatus: Object.fromEntries(statusRows.map((r) => [r.status, r._count._all])),
    byPriority: Object.fromEntries(prioRows.map((r) => [r.priority, r._count._all])),
    avgResolutionHours: avgHours(resolvedRows),
    reopenRate: everResolved ? Math.round((reopened / everResolved) * 1000) / 1000 : 0,
  };
}

function isoWeekStart(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (t.getUTCDay() + 6) % 7; // Monday = 0
  t.setUTCDate(t.getUTCDate() - dow);
  return t.toISOString().slice(0, 10);
}

export async function tickets(query: TicketsReportQuery, auth: AuthContext): Promise<TicketsReport> {
  const p = period(query);
  const where: Prisma.TicketWhereInput = {
    AND: [
      ...base(auth, p), createdIn(p),
      ...(query.status?.length ? [{ status: { in: query.status } }] : []),
      ...(query.priority?.length ? [{ priority: { in: query.priority } }] : []),
    ],
  };
  const rows: TicketsReport["rows"] = [];

  switch (query.groupBy) {
    case "status": {
      for (const r of await prisma.ticket.groupBy({ by: ["status"], where, _count: { _all: true } })) rows.push({ key: r.status, label: r.status, count: r._count._all });
      break;
    }
    case "priority": {
      for (const r of await prisma.ticket.groupBy({ by: ["priority"], where, _count: { _all: true } })) rows.push({ key: r.priority, label: r.priority, count: r._count._all });
      break;
    }
    case "department": {
      const g = await prisma.ticket.groupBy({ by: ["departmentId"], where, _count: { _all: true } });
      const names = await prisma.department.findMany({ where: { id: { in: g.map((x) => x.departmentId) } }, select: { id: true, name: true } });
      const m = new Map(names.map((n) => [n.id, n.name]));
      for (const r of g) rows.push({ key: r.departmentId, label: m.get(r.departmentId) ?? r.departmentId, count: r._count._all });
      break;
    }
    case "category": {
      const g = await prisma.ticket.groupBy({ by: ["categoryId"], where, _count: { _all: true } });
      const names = await prisma.ticketCategory.findMany({ where: { id: { in: g.map((x) => x.categoryId) } }, select: { id: true, name: true } });
      const m = new Map(names.map((n) => [n.id, n.name]));
      for (const r of g) rows.push({ key: r.categoryId, label: m.get(r.categoryId) ?? r.categoryId, count: r._count._all });
      break;
    }
    case "agent": {
      const g = await prisma.ticket.groupBy({ by: ["assignedAgentId"], where, _count: { _all: true } });
      const users = await prisma.user.findMany({ where: { id: { in: g.map((x) => x.assignedAgentId).filter((x): x is string => !!x) } }, select: userRefSelect });
      const m = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
      for (const r of g) {
        rows.push(r.assignedAgentId
          ? { key: r.assignedAgentId, label: m.get(r.assignedAgentId) ?? r.assignedAgentId, count: r._count._all }
          : { key: "unassigned", label: "Unassigned", count: r._count._all });
      }
      break;
    }
    default: {
      const stamps = await prisma.ticket.findMany({ where, select: { createdAt: true }, take: ROW_CAP });
      const bucket = (d: Date) =>
        query.groupBy === "day" ? d.toISOString().slice(0, 10) : query.groupBy === "week" ? isoWeekStart(d) : d.toISOString().slice(0, 7);
      const counts = new Map<string, number>();
      for (const s of stamps) counts.set(bucket(s.createdAt), (counts.get(bucket(s.createdAt)) ?? 0) + 1);
      for (const [key, count] of [...counts].sort(([a], [b]) => a.localeCompare(b))) rows.push({ key, label: key, count });
    }
  }
  if (!["day", "week", "month"].includes(query.groupBy)) rows.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return { groupBy: query.groupBy, rows };
}

/**
 * view_all -> all agents; view_department -> agents of managed departments; otherwise only the caller's own row.
 * assigned = assignments made in the period; resolved = resolved by the agent in the period; open = currently open;
 * reopened = the agent's tickets that were reopened and updated in the period.
 */
export async function teamPerformance(query: TeamPerformanceQuery, auth: AuthContext): Promise<TeamPerformanceReport> {
  const p = period(query);
  const has = (k: string) => auth.permissions.includes(k);

  let agentWhere: Prisma.UserWhereInput;
  const deptFilter = p.departmentId ? { departmentId: p.departmentId } : {};
  if (has("tickets.view_all")) {
    agentWhere = { deletedAt: null, memberships: { some: deptFilter } };
  } else if (has("tickets.view_department")) {
    agentWhere = { deletedAt: null, memberships: { some: { ...deptFilter, department: { managers: { some: { userId: auth.userId } } } } } };
  } else {
    agentWhere = { id: auth.userId };
  }
  const agents = await prisma.user.findMany({
    where: agentWhere, select: userRefSelect, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], take: 500,
  });
  const ids = agents.map((a) => a.id);
  const scope = { AND: base(auth, p) } satisfies Prisma.TicketWhereInput;

  const [assigned, resolvedRows, openRows, reopenedRows] = await Promise.all([
    prisma.ticketAssignment.groupBy({
      by: ["agentId"], _count: { _all: true },
      where: { agentId: { in: ids }, assignedAt: { gte: p.from, lte: p.to }, ticket: scope },
    }),
    prisma.ticket.findMany({
      where: { AND: [...base(auth, p), { resolvedById: { in: ids }, resolvedAt: { gte: p.from, lte: p.to } }] },
      select: { resolvedById: true, createdAt: true, resolvedAt: true }, take: ROW_CAP,
    }),
    prisma.ticket.groupBy({ by: ["assignedAgentId"], _count: { _all: true }, where: { AND: [...base(auth, p), { assignedAgentId: { in: ids }, status: { in: OPEN } }] } }),
    prisma.ticket.groupBy({ by: ["assignedAgentId"], _count: { _all: true }, where: { AND: [...base(auth, p), { assignedAgentId: { in: ids }, reopenCount: { gt: 0 }, updatedAt: { gte: p.from, lte: p.to } }] } }),
  ]);

  return {
    rows: agents.map((a) => {
      const mine = resolvedRows.filter((r) => r.resolvedById === a.id);
      return {
        agent: toUserRef(a),
        assigned: assigned.find((r) => r.agentId === a.id)?._count._all ?? 0,
        resolved: mine.length,
        open: openRows.find((r) => r.assignedAgentId === a.id)?._count._all ?? 0,
        reopened: reopenedRows.find((r) => r.assignedAgentId === a.id)?._count._all ?? 0,
        avgResolutionHours: avgHours(mine),
      };
    }),
  };
}

/** Flat rows for the CSV export, same filters as the matching report. */
export async function exportRows(query: ExportQuery, auth: AuthContext): Promise<Record<string, unknown>[]> {
  if (query.type === "team-performance") {
    const { rows } = await teamPerformance(query, auth);
    return rows.map((r) => ({
      agent: `${r.agent.firstName} ${r.agent.lastName}`, email: r.agent.email, assigned: r.assigned,
      resolved: r.resolved, open: r.open, reopened: r.reopened, avgResolutionHours: r.avgResolutionHours,
    }));
  }
  if (query.groupBy) {
    const { rows } = await tickets({ ...query, groupBy: query.groupBy }, auth);
    return rows.map((r) => ({ [query.groupBy!]: r.label, count: r.count }));
  }
  const p = period(query);
  const rows = await prisma.ticket.findMany({
    where: {
      AND: [
        ...base(auth, p), createdIn(p),
        ...(query.status?.length ? [{ status: { in: query.status } }] : []),
        ...(query.priority?.length ? [{ priority: { in: query.priority } }] : []),
      ],
    },
    include: {
      category: { select: { name: true } }, department: { select: { name: true } },
      requester: { select: { firstName: true, lastName: true } }, assignedAgent: { select: { firstName: true, lastName: true } },
    },
    orderBy: { number: "asc" }, take: EXPORT_CAP,
  });
  return rows.map((t) => ({
    reference: ticketReference(t.number, t.createdAt), title: t.title, status: t.status, priority: t.priority,
    department: t.department.name, category: t.category.name,
    requester: `${t.requester.firstName} ${t.requester.lastName}`,
    assignedAgent: t.assignedAgent ? `${t.assignedAgent.firstName} ${t.assignedAgent.lastName}` : "",
    createdAt: t.createdAt, resolvedAt: t.resolvedAt, closedAt: t.closedAt,
  }));
}
