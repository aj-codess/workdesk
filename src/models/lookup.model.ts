// Lightweight dropdown data: active records only, minimal fields, capped, no pagination.
import { prisma } from "@/config/prisma";
import type { AuthContext } from "@/types/auth";
import type { DepartmentRef, UserRef } from "@/types/dto";
import { deptRefSelect, toDeptRef, toUserRef, userRefSelect } from "@/utilities/mappers";
import { OPEN_WORK_STATUSES, canSeeDepartment, eligibleAgentWhere } from "@/models/scope";

const CAP = 200;

export async function departments(): Promise<DepartmentRef[]> {
  const rows = await prisma.department.findMany({ where: { isActive: true }, select: deptRefSelect, orderBy: { name: "asc" }, take: CAP });
  return rows.map(toDeptRef);
}

export async function categories(departmentId: string): Promise<{ id: string; name: string; isSensitive: boolean }[]> {
  return prisma.ticketCategory.findMany({
    where: { departmentId, isActive: true, department: { isActive: true } },
    select: { id: true, name: true, isSensitive: true },
    orderBy: { name: "asc" },
    take: CAP,
  });
}

/** Department must be in the caller's scope (return null -> 404). Active members holding tickets.view_assigned, with open ticket counts. */
export async function agents(
  departmentId: string,
  auth: AuthContext
): Promise<(UserRef & { openTickets: number })[] | null> {
  if (!(await canSeeDepartment(prisma, auth, departmentId))) return null;
  if (!(await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true } }))) return null;
  const users = await prisma.user.findMany({
    where: eligibleAgentWhere(departmentId), select: userRefSelect, orderBy: [{ firstName: "asc" }, { lastName: "asc" }], take: CAP,
  });
  const open = await prisma.ticket.groupBy({
    by: ["assignedAgentId"],
    where: { departmentId, deletedAt: null, status: { in: [...OPEN_WORK_STATUSES] }, assignedAgentId: { in: users.map((u) => u.id) } },
    _count: { _all: true },
  });
  const openBy = new Map(open.map((o) => [o.assignedAgentId, o._count._all]));
  return users.map((u) => ({ ...toUserRef(u), openTickets: openBy.get(u.id) ?? 0 }));
}

/** Active roles. `assignable` is false when the role contains a permission the caller does not hold. */
export async function roles(auth: AuthContext): Promise<{ id: string; name: string; description: string | null; assignable: boolean }[]> {
  const rows = await prisma.role.findMany({
    where: { isActive: true },
    select: { id: true, name: true, description: true, rolePermissions: { select: { permission: { select: { key: true } } } } },
    orderBy: { name: "asc" },
    take: CAP,
  });
  const held = new Set(auth.permissions);
  return rows.map((r) => ({
    id: r.id, name: r.name, description: r.description,
    assignable: r.rolePermissions.every((rp) => held.has(rp.permission.key)),
  }));
}

/** Active users matching name or email (ILIKE). */
export async function users(search: string, limit: number): Promise<UserRef[]> {
  const rows = await prisma.user.findMany({
    where: {
      status: "ACTIVE", deletedAt: null,
      OR: [
        { email: { contains: search, mode: "insensitive" } },
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
      ],
    },
    select: userRefSelect, orderBy: [{ firstName: "asc" }, { lastName: "asc" }], take: Math.min(limit, 50),
  });
  return rows.map(toUserRef);
}
