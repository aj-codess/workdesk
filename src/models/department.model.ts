import { Prisma } from "@prisma/client";
import { prisma } from "@/config/prisma";
import type { Paginated } from "@/types/pagination";
import type { AuthContext } from "@/types/auth";
import type { Department, DepartmentDetail, DepartmentMemberRow, UserRef } from "@/types/dto";
import type {
  CreateDepartmentBody, ListDepartmentsQuery, ListMembersQuery, UpdateDepartmentBody,
} from "@/validators/department.validator";
import { Errors } from "@/utilities/api-error";
import { DomainErrors, conflictOnUnique } from "@/utilities/domain-errors";
import { iso, toUserRef, userRefSelect, type Db } from "@/utilities/mappers";
import { OPEN_WORK_STATUSES } from "@/models/scope";
import * as AuditLogModel from "@/models/audit-log.model";
import * as SettingModel from "@/models/setting.model";

const countInclude = {
  _count: { select: { managers: { where: { user: { deletedAt: null } } }, members: { where: { user: { deletedAt: null } } } } },
} satisfies Prisma.DepartmentInclude;
type Row = Prisma.DepartmentGetPayload<{ include: typeof countInclude }>;

const toDepartment = (d: Row): Department => ({
  id: d.id, name: d.name, code: d.code, description: d.description, isActive: d.isActive,
  managerCount: d._count.managers, memberCount: d._count.members, createdAt: iso(d.createdAt),
});

async function managersOf(db: Db, departmentId: string): Promise<UserRef[]> {
  const rows = await db.departmentManager.findMany({
    where: { departmentId, user: { deletedAt: null } },
    select: { user: { select: userRefSelect } },
    orderBy: { assignedAt: "asc" },
  });
  return rows.map((r) => toUserRef(r.user));
}

async function loadDetail(db: Db, id: string): Promise<DepartmentDetail | null> {
  const row = await db.department.findUnique({ where: { id }, include: countInclude });
  return row ? { ...toDepartment(row), managers: await managersOf(db, id) } : null;
}

/** Row lock so concurrent manager/member changes on one department are serialised. */
async function lockDepartment(tx: Db, id: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM departments WHERE id = ${id}::uuid FOR UPDATE`;
  return rows.length === 1;
}

export async function list(query: ListDepartmentsQuery): Promise<Paginated<Department>> {
  const where: Prisma.DepartmentWhereInput = {
    ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
    ...(query.search
      ? { OR: [{ name: { contains: query.search, mode: "insensitive" } }, { code: { contains: query.search, mode: "insensitive" } }] }
      : {}),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.department.findMany({
      where, include: countInclude, orderBy: [{ [query.sort]: query.order }, { id: "asc" }],
      skip: (query.page - 1) * query.limit, take: query.limit,
    }),
    prisma.department.count({ where }),
  ]);
  return { rows: rows.map(toDepartment), total };
}

export async function findById(id: string): Promise<DepartmentDetail | null> {
  return loadDetail(prisma, id);
}

/** Audit: departments.created. Throw 409 CONFLICT (name or code). */
export async function create(input: CreateDepartmentBody, auth: AuthContext): Promise<DepartmentDetail> {
  return conflictOnUnique("A department with this name or code already exists", () =>
    prisma.$transaction(async (tx) => {
      const clash = await tx.department.findFirst({
        where: { OR: [{ name: { equals: input.name, mode: "insensitive" } }, { code: input.code }] },
        select: { id: true },
      });
      if (clash) throw Errors.conflict("A department with this name or code already exists");
      const dept = await tx.department.create({
        data: { name: input.name, code: input.code, description: input.description ?? null },
      });
      await AuditLogModel.record(
        { actorId: auth.userId, action: "departments.created", entityType: "department", entityId: dept.id, after: { name: dept.name, code: dept.code }, ip: auth.ip, userAgent: auth.userAgent },
        tx
      );
      return (await loadDetail(tx, dept.id))!;
    })
  );
}

/** Audit: departments.updated with before/after. */
export async function update(id: string, input: UpdateDepartmentBody, auth: AuthContext): Promise<DepartmentDetail | null> {
  return conflictOnUnique("A department with this name or code already exists", () =>
    prisma.$transaction(async (tx) => {
      const before = await tx.department.findUnique({ where: { id } });
      if (!before) return null;
      if (input.name !== undefined || input.code !== undefined) {
        const clash = await tx.department.findFirst({
          where: {
            id: { not: id },
            OR: [
              ...(input.name !== undefined ? [{ name: { equals: input.name, mode: "insensitive" as const } }] : []),
              ...(input.code !== undefined ? [{ code: input.code }] : []),
            ],
          },
          select: { id: true },
        });
        if (clash) throw Errors.conflict("A department with this name or code already exists");
      }
      const after = await tx.department.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.code !== undefined ? { code: input.code } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      const view = (d: typeof before) => ({ name: d.name, code: d.code, description: d.description, isActive: d.isActive });
      await AuditLogModel.record(
        { actorId: auth.userId, action: "departments.updated", entityType: "department", entityId: id, before: view(before), after: view(after), ip: auth.ip, userAgent: auth.userAgent },
        tx
      );
      return (await loadDetail(tx, id))!;
    })
  );
}

/** null when the department does not exist. */
export async function listManagers(departmentId: string): Promise<UserRef[] | null> {
  const exists = await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true } });
  return exists ? managersOf(prisma, departmentId) : null;
}

/**
 * Audit: departments.manager_added. 404 (user/department), 409 CONFLICT (already a manager),
 * 422 LIMIT_EXCEEDED (setting department.max_managers), 422 when the user is not ACTIVE.
 * `warnings` lists e.g. "User holds no role granting tickets.view_department".
 */
export async function addManager(
  departmentId: string,
  userId: string,
  auth: AuthContext
): Promise<{ managers: UserRef[]; warnings: string[] }> {
  const max = await SettingModel.getValue<number>("department.max_managers");
  return prisma.$transaction(async (tx) => {
    if (!(await lockDepartment(tx, departmentId))) throw Errors.notFound("Department");
    const user = await tx.user.findFirst({ where: { id: userId, deletedAt: null }, select: { id: true, status: true } });
    if (!user) throw Errors.notFound("User");
    if (user.status !== "ACTIVE") throw DomainErrors.unprocessable("Only an ACTIVE user can be made a manager", "USER_NOT_ACTIVE");

    const existing = await tx.departmentManager.findUnique({ where: { departmentId_userId: { departmentId, userId } } });
    if (existing) throw Errors.conflict("User is already a manager of this department");
    const count = await tx.departmentManager.count({ where: { departmentId, user: { deletedAt: null } } });
    if (count >= max) throw DomainErrors.limitExceeded(`A department can have at most ${max} manager(s)`);

    await tx.departmentManager.create({ data: { departmentId, userId, assignedById: auth.userId } });

    const warnings: string[] = [];
    const holds = await tx.permission.count({
      where: {
        key: "tickets.view_department",
        rolePermissions: { some: { role: { isActive: true, userRoles: { some: { userId } } } } },
      },
    });
    if (holds === 0) warnings.push("User holds no role granting tickets.view_department");

    await AuditLogModel.record(
      { actorId: auth.userId, action: "departments.manager_added", entityType: "department", entityId: departmentId, after: { userId }, ip: auth.ip, userAgent: auth.userAgent },
      tx
    );
    return { managers: await managersOf(tx, departmentId), warnings };
  });
}

/** Audit: departments.manager_removed. 409 DEPARTMENT_NEEDS_MANAGER if last manager and PENDING_REVIEW / CLARIFICATION_REQUESTED tickets exist. false when not a manager. */
export async function removeManager(departmentId: string, userId: string, auth: AuthContext): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    if (!(await lockDepartment(tx, departmentId))) return false;
    const row = await tx.departmentManager.findUnique({ where: { departmentId_userId: { departmentId, userId } } });
    if (!row) return false;

    const remaining = await tx.departmentManager.count({ where: { departmentId, userId: { not: userId }, user: { deletedAt: null } } });
    if (remaining === 0) {
      const waiting = await tx.ticket.count({
        where: { departmentId, deletedAt: null, status: { in: ["PENDING_REVIEW", "CLARIFICATION_REQUESTED"] } },
      });
      if (waiting > 0) {
        throw DomainErrors.departmentNeedsManager(`Cannot remove the last manager while ${waiting} ticket(s) await review`);
      }
    }
    await tx.departmentManager.delete({ where: { departmentId_userId: { departmentId, userId } } });
    await AuditLogModel.record(
      { actorId: auth.userId, action: "departments.manager_removed", entityType: "department", entityId: departmentId, before: { userId }, ip: auth.ip, userAgent: auth.userAgent },
      tx
    );
    return true;
  });
}

export async function listMembers(
  departmentId: string,
  query: ListMembersQuery
): Promise<Paginated<DepartmentMemberRow> | null> {
  const exists = await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true } });
  if (!exists) return null;
  const where: Prisma.DepartmentMemberWhereInput = {
    departmentId,
    user: {
      deletedAt: null,
      ...(query.search
        ? { OR: [
            { email: { contains: query.search, mode: "insensitive" } },
            { firstName: { contains: query.search, mode: "insensitive" } },
            { lastName: { contains: query.search, mode: "insensitive" } },
          ] }
        : {}),
    },
  };
  const [rows, total] = await prisma.$transaction([
    prisma.departmentMember.findMany({
      where, select: { addedAt: true, user: { select: userRefSelect } },
      orderBy: [{ addedAt: query.order }, { userId: "asc" }],
      skip: (query.page - 1) * query.limit, take: query.limit,
    }),
    prisma.departmentMember.count({ where }),
  ]);
  const open = await prisma.ticket.groupBy({
    by: ["assignedAgentId"],
    where: { departmentId, deletedAt: null, status: { in: [...OPEN_WORK_STATUSES] }, assignedAgentId: { in: rows.map((r) => r.user.id) } },
    _count: { _all: true },
  });
  const openBy = new Map(open.map((o) => [o.assignedAgentId, o._count._all]));
  return {
    rows: rows.map((r) => ({ user: toUserRef(r.user), addedAt: iso(r.addedAt), openTickets: openBy.get(r.user.id) ?? 0 })),
    total,
  };
}

/** Audit: departments.members_added. All users must be ACTIVE; existing members are skipped. */
export async function addMembers(
  departmentId: string,
  userIds: string[],
  auth: AuthContext
): Promise<{ added: number; skipped: number }> {
  return prisma.$transaction(async (tx) => {
    if (!(await lockDepartment(tx, departmentId))) throw Errors.notFound("Department");
    const users = await tx.user.findMany({ where: { id: { in: userIds }, deletedAt: null }, select: { id: true, status: true } });
    if (users.length !== userIds.length) throw Errors.validation("One or more userIds do not exist");
    if (users.some((u) => u.status !== "ACTIVE")) {
      throw DomainErrors.unprocessable("All users must be ACTIVE", "USER_NOT_ACTIVE");
    }
    const res = await tx.departmentMember.createMany({
      data: userIds.map((userId) => ({ departmentId, userId, addedById: auth.userId })),
      skipDuplicates: true,
    });
    await AuditLogModel.record(
      { actorId: auth.userId, action: "departments.members_added", entityType: "department", entityId: departmentId, after: { userIds, added: res.count }, ip: auth.ip, userAgent: auth.userAgent },
      tx
    );
    return { added: res.count, skipped: userIds.length - res.count };
  });
}

/** Audit: departments.member_removed. 409 HAS_OPEN_ASSIGNMENTS while the user holds ASSIGNED / IN_PROGRESS / REOPENED tickets of this department. false when not a member. */
export async function removeMember(departmentId: string, userId: string, auth: AuthContext): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    if (!(await lockDepartment(tx, departmentId))) return false;
    const row = await tx.departmentMember.findUnique({ where: { departmentId_userId: { departmentId, userId } } });
    if (!row) return false;
    const open = await tx.ticket.count({
      where: { departmentId, assignedAgentId: userId, deletedAt: null, status: { in: [...OPEN_WORK_STATUSES] } },
    });
    if (open > 0) throw DomainErrors.hasOpenAssignments(`User still holds ${open} open ticket(s) of this department`);
    await tx.departmentMember.delete({ where: { departmentId_userId: { departmentId, userId } } });
    await AuditLogModel.record(
      { actorId: auth.userId, action: "departments.member_removed", entityType: "department", entityId: departmentId, before: { userId }, ip: auth.ip, userAgent: auth.userAgent },
      tx
    );
    return true;
  });
}
