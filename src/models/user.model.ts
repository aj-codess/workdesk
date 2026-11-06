// All database access for users (+ their role / department links). No HTTP, no external calls.
import { Prisma } from "@prisma/client";
import { prisma } from "@/config/prisma";
import type { Paginated } from "@/types/pagination";
import type { AuthContext } from "@/types/auth";
import type { AuthUser, UserCredentials, UserDetail, UserSummary, NameRef } from "@/types/dto";
import type { CreateUserBody, ListUsersQuery, RoleUsersQuery, UpdateUserBody } from "@/validators/user.validator";
import type { UpdateProfileBody } from "@/validators/auth.validator";
import { Errors } from "@/utilities/api-error";
import { DomainErrors, conflictOnUnique } from "@/utilities/domain-errors";
import { deptRefSelect, iso, isoOrNull, toDeptRef, toNameRef, type Db } from "@/utilities/mappers";
import { assertAdminRemains, lockAdminChanges } from "@/models/admin-guard";
import { OPEN_WORK_STATUSES } from "@/models/scope";
import * as AuditLogModel from "@/models/audit-log.model";

// ---- shapes ---------------------------------------------------------------------------

const summaryInclude = {
  homeDepartment: { select: deptRefSelect },
  userRoles: { select: { role: { select: { id: true, name: true } } } },
} satisfies Prisma.UserInclude;
type SummaryRow = Prisma.UserGetPayload<{ include: typeof summaryInclude }>;

const detailInclude = {
  ...summaryInclude,
  managedDepartments: { select: { department: { select: { id: true, name: true } } } },
  memberships: { select: { department: { select: { id: true, name: true } } } },
} satisfies Prisma.UserInclude;
type DetailRow = Prisma.UserGetPayload<{ include: typeof detailInclude }>;

function toSummary(u: SummaryRow): UserSummary {
  return {
    id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, status: u.status,
    department: u.homeDepartment ? toDeptRef(u.homeDepartment) : null,
    roles: u.userRoles.map((ur) => toNameRef(ur.role)).sort((a, b) => a.name.localeCompare(b.name)),
    lastLoginAt: isoOrNull(u.lastLoginAt), createdAt: iso(u.createdAt),
  };
}

function toDetail(u: DetailRow): UserDetail {
  return {
    ...toSummary(u),
    phone: u.phone, jobTitle: u.jobTitle, avatarUrl: u.avatarUrl, mustChangePassword: u.mustChangePassword,
    deactivatedAt: isoOrNull(u.deactivatedAt), updatedAt: iso(u.updatedAt),
    managedDepartments: u.managedDepartments.map((m) => toNameRef(m.department)),
    memberDepartments: u.memberships.map((m) => toNameRef(m.department)),
  };
}

async function loadDetail(db: Db, id: string): Promise<UserDetail | null> {
  const row = await db.user.findFirst({ where: { id, deletedAt: null }, include: detailInclude });
  return row ? toDetail(row) : null;
}

/** What goes into audit before/after for a user: never credentials. */
const auditView = (u: UserDetail) => ({
  email: u.email, firstName: u.firstName, lastName: u.lastName, phone: u.phone, jobTitle: u.jobTitle,
  status: u.status, departmentId: u.department?.id ?? null, mustChangePassword: u.mustChangePassword,
  roles: u.roles.map((r) => r.name),
});

// ---- credentials / login -------------------------------------------------------------

/** Lowercased email -> credentials row (includes passwordHash). Soft-deleted users are still returned so the caller can reject them. */
export async function findCredentialsByEmail(email: string): Promise<UserCredentials | null> {
  const u = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  return u && toCredentials(u);
}

export async function findCredentialsById(id: string): Promise<UserCredentials | null> {
  const u = await prisma.user.findFirst({ where: { id, deletedAt: null } });
  return u && toCredentials(u);
}

function toCredentials(u: Prisma.UserGetPayload<object>): UserCredentials {
  return {
    id: u.id, email: u.email, firstName: u.firstName, passwordHash: u.passwordHash, status: u.status,
    lockedUntil: u.lockedUntil, failedLoginCount: u.failedLoginCount, deletedAt: u.deletedAt,
  };
}

/**
 * Increment failedLoginCount; when it reaches `maxFailed` set lockedUntil = now + lockoutMinutes.
 * The counter restarts from zero when the lock is applied, so the user gets a fresh allowance after it expires.
 */
export async function registerFailedLogin(
  userId: string,
  policy: { maxFailed: number; lockoutMinutes: number }
): Promise<void> {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: { increment: 1 } }, // atomic in SQL, safe under concurrent attempts
    select: { failedLoginCount: true },
  });
  if (updated.failedLoginCount >= policy.maxFailed) {
    const lockedUntil = new Date(Date.now() + policy.lockoutMinutes * 60_000);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { failedLoginCount: 0, lockedUntil } });
      await AuditLogModel.record(
        { actorId: userId, action: "auth.account_locked", entityType: "user", entityId: userId, outcome: "DENIED", after: { lockedUntil } },
        tx
      );
    });
  }
}

/** Reset failedLoginCount/lockedUntil and set lastLoginAt = now. */
export async function registerSuccessfulLogin(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
}

/** Set passwordHash + passwordChangedAt = now, clear mustChangePassword. */
export async function changePassword(userId: string, passwordHash: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: false },
  });
}

// ---- profile / reads -----------------------------------------------------------------

function toAuthUser(d: UserDetail, ids: { managed: string[]; member: string[] }): AuthUser {
  const { lastLoginAt: _l, deactivatedAt: _d, ...rest } = d;
  return { ...rest, managedDepartmentIds: ids.managed, memberDepartmentIds: ids.member };
}

/** AuthUser shape for login, /auth/me and PATCH /profile. */
export async function findAuthUser(id: string): Promise<AuthUser | null> {
  const row = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    include: {
      ...detailInclude,
      managedDepartments: { select: { departmentId: true, department: { select: { id: true, name: true } } } },
      memberships: { select: { departmentId: true, department: { select: { id: true, name: true } } } },
    },
  });
  if (!row) return null;
  return toAuthUser(toDetail(row), {
    managed: row.managedDepartments.map((m) => m.departmentId),
    member: row.memberships.map((m) => m.departmentId),
  });
}

export async function updateProfile(id: string, input: UpdateProfileBody): Promise<AuthUser> {
  await prisma.user.update({
    where: { id },
    data: {
      ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
      ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle } : {}),
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
    },
  });
  const user = await findAuthUser(id);
  if (!user) throw Errors.sessionRevoked();
  return user;
}

const USER_SORT_FIELDS = ["createdAt", "firstName", "lastName", "email", "lastLoginAt"] as const;

/** Excludes soft-deleted users. */
export async function list(query: ListUsersQuery): Promise<Paginated<UserSummary>> {
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(query.status ? { status: query.status } : {}),
    ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    ...(query.roleId ? { userRoles: { some: { roleId: query.roleId } } } : {}),
    ...(query.search ? { OR: searchClauses(query.search) } : {}),
  };
  const field = USER_SORT_FIELDS.includes(query.sort) ? query.sort : "createdAt";
  const primary: Prisma.UserOrderByWithRelationInput =
    field === "lastLoginAt" ? { lastLoginAt: { sort: query.order, nulls: "last" } } : { [field]: query.order };
  const [rows, total] = await prisma.$transaction([
    prisma.user.findMany({
      where, include: summaryInclude, orderBy: [primary, { id: "asc" }],
      skip: (query.page - 1) * query.limit, take: query.limit,
    }),
    prisma.user.count({ where }),
  ]);
  return { rows: rows.map(toSummary), total };
}

function searchClauses(search: string): Prisma.UserWhereInput[] {
  const terms = search.split(/\s+/).filter(Boolean);
  return [
    { email: { contains: search, mode: "insensitive" } },
    { firstName: { contains: search, mode: "insensitive" } },
    { lastName: { contains: search, mode: "insensitive" } },
    // "jane doe": every word must hit the first or last name
    ...(terms.length > 1
      ? [{ AND: terms.map((t) => ({ OR: [{ firstName: { contains: t, mode: "insensitive" as const } }, { lastName: { contains: t, mode: "insensitive" as const } }] })) }]
      : []),
  ];
}

/** Users holding a role (GET /roles/:id/users). */
export async function listByRole(roleId: string, query: RoleUsersQuery): Promise<Paginated<UserSummary>> {
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    userRoles: { some: { roleId } },
    ...(query.search ? { OR: searchClauses(query.search) } : {}),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.user.findMany({
      where, include: summaryInclude, orderBy: [{ createdAt: query.order }, { id: "asc" }],
      skip: (query.page - 1) * query.limit, take: query.limit,
    }),
    prisma.user.count({ where }),
  ]);
  return { rows: rows.map(toSummary), total };
}

/** null when missing or soft-deleted. */
export async function findById(id: string): Promise<UserDetail | null> {
  return loadDetail(prisma, id);
}

/** Role ids currently held (to work out which roles are newly added). */
export async function getRoleIds(userId: string): Promise<string[]> {
  const rows = await prisma.userRole.findMany({ where: { userId }, select: { roleId: true } });
  return rows.map((r) => r.roleId);
}

// ---- admin mutations -------------------------------------------------------------------

async function assertDepartmentExists(db: Db, id: string | null | undefined): Promise<void> {
  if (!id) return;
  if (!(await db.department.findUnique({ where: { id }, select: { id: true } }))) {
    throw Errors.validation("departmentId does not exist");
  }
}

async function assertRolesAssignable(db: Db, roleIds: string[]): Promise<void> {
  if (roleIds.length === 0) return;
  const found = await db.role.findMany({ where: { id: { in: roleIds }, isActive: true }, select: { id: true } });
  if (found.length !== new Set(roleIds).size) throw Errors.validation("One or more roleIds are unknown or inactive");
}

/** Audit: users.created. `roleIds` and `activate` have already been authorised by the controller. */
export async function create(
  input: Omit<CreateUserBody, "password"> & { passwordHash: string },
  auth: AuthContext
): Promise<UserDetail> {
  return conflictOnUnique("A user with this email already exists", () =>
    prisma.$transaction(async (tx) => {
      await lockAdminChanges(tx);
      await assertDepartmentExists(tx, input.departmentId);
      const roleIds = [...new Set(input.roleIds ?? [])];
      await assertRolesAssignable(tx, roleIds);

      const user = await tx.user.create({
        data: {
          email: input.email, passwordHash: input.passwordHash,
          firstName: input.firstName, lastName: input.lastName,
          phone: input.phone ?? null, jobTitle: input.jobTitle ?? null,
          departmentId: input.departmentId ?? null,
          status: input.activate ? "ACTIVE" : "INACTIVE",
          mustChangePassword: input.mustChangePassword,
          userRoles: roleIds.length ? { create: roleIds.map((roleId) => ({ roleId, assignedById: auth.userId })) } : undefined,
        },
        select: { id: true },
      });
      const detail = (await loadDetail(tx, user.id))!;
      await AuditLogModel.record(
        { actorId: auth.userId, action: "users.created", entityType: "user", entityId: user.id, after: auditView(detail), ip: auth.ip, userAgent: auth.userAgent },
        tx
      );
      return detail;
    })
  );
}

/** Audit: users.updated with before/after. Throw 409 CONFLICT on duplicate email. */
export async function update(id: string, input: UpdateUserBody, auth: AuthContext): Promise<UserDetail | null> {
  return conflictOnUnique("A user with this email already exists", () =>
    prisma.$transaction(async (tx) => {
      const before = await loadDetail(tx, id);
      if (!before) return null;
      if (input.departmentId !== undefined) await assertDepartmentExists(tx, input.departmentId);

      await tx.user.update({
        where: { id },
        data: {
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
          ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle } : {}),
          ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
          ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
          ...(input.mustChangePassword !== undefined ? { mustChangePassword: input.mustChangePassword } : {}),
        },
      });
      const after = (await loadDetail(tx, id))!;
      await AuditLogModel.record(
        { actorId: auth.userId, action: "users.updated", entityType: "user", entityId: id, before: auditView(before), after: auditView(after), ip: auth.ip, userAgent: auth.userAgent },
        tx
      );
      return after;
    })
  );
}


/**
 * Audit: users.deleted. Soft delete, revoke all sessions, remove manager/member rows.
 * Throw 409 LAST_ADMIN_PROTECTED / HAS_OPEN_ASSIGNMENTS. Return false when not found.
 */
export async function softDelete(id: string, auth: AuthContext): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await lockAdminChanges(tx);
    const before = await loadDetail(tx, id);
    if (!before) return false;

    const open = await tx.ticket.count({
      where: { assignedAgentId: id, deletedAt: null, status: { in: [...OPEN_WORK_STATUSES] } },
    });
    if (open > 0) throw DomainErrors.hasOpenAssignments(`User still has ${open} open assigned ticket(s)`);

    const now = new Date();
    await tx.user.update({
      where: { id },
      data: { deletedAt: now, status: "INACTIVE", deactivatedAt: before.deactivatedAt ? undefined : now },
    });
    await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: now, revokedReason: "USER_DEACTIVATED" } });
    await tx.departmentManager.deleteMany({ where: { userId: id } });
    await tx.departmentMember.deleteMany({ where: { userId: id } });
    await assertAdminRemains(tx);

    await AuditLogModel.record(
      { actorId: auth.userId, action: "users.deleted", entityType: "user", entityId: id, before: auditView(before), ip: auth.ip, userAgent: auth.userAgent },
      tx
    );
    return true;
  });
}

/** Audit: users.activated. Set ACTIVE, deactivatedAt = null, clear lock + failedLoginCount. */
export async function activate(id: string, auth: AuthContext): Promise<UserDetail | null> {
  return prisma.$transaction(async (tx) => {
    const before = await loadDetail(tx, id);
    if (!before) return null;
    await tx.user.update({
      where: { id },
      data: { status: "ACTIVE", deactivatedAt: null, lockedUntil: null, failedLoginCount: 0 },
    });
    const after = (await loadDetail(tx, id))!;
    await AuditLogModel.record(
      { actorId: auth.userId, action: "users.activated", entityType: "user", entityId: id, before: { status: before.status }, after: { status: "ACTIVE" }, ip: auth.ip, userAgent: auth.userAgent },
      tx
    );
    return after;
  });
}

/**
 * Audit: users.deactivated. Set INACTIVE, deactivatedAt = now, revoke every session (USER_DEACTIVATED).
 * Throw 409 LAST_ADMIN_PROTECTED.
 */
export async function deactivate(id: string, reason: string | undefined, auth: AuthContext): Promise<UserDetail | null> {
  return prisma.$transaction(async (tx) => {
    await lockAdminChanges(tx);
    const before = await loadDetail(tx, id);
    if (!before) return null;
    const now = new Date();
    await tx.user.update({ where: { id }, data: { status: "INACTIVE", deactivatedAt: now } });
    await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: now, revokedReason: "USER_DEACTIVATED" } });
    await assertAdminRemains(tx);
    const after = (await loadDetail(tx, id))!;
    await AuditLogModel.record(
      {
        actorId: auth.userId, action: "users.deactivated", entityType: "user", entityId: id,
        before: { status: before.status }, after: { status: "INACTIVE", reason: reason ?? null },
        ip: auth.ip, userAgent: auth.userAgent,
      },
      tx
    );
    return after;
  });
}

/**
 * Audit: users.roles_updated with before/after. Replace the full role set.
 * Throw 409 LAST_ADMIN_PROTECTED; 400 for unknown or inactive newly added roles.
 */
export async function replaceRoles(
  userId: string,
  roleIds: string[],
  auth: AuthContext
): Promise<{ userId: string; roles: NameRef[] } | null> {
  return prisma.$transaction(async (tx) => {
    await lockAdminChanges(tx);
    const user = await loadDetail(tx, userId);
    if (!user) return null;

    const wanted = new Set(roleIds);
    const current = await tx.userRole.findMany({ where: { userId }, select: { roleId: true } });
    const currentIds = new Set(current.map((c) => c.roleId));
    const toAdd = [...wanted].filter((r) => !currentIds.has(r));
    const toRemove = [...currentIds].filter((r) => !wanted.has(r));

    await assertRolesAssignable(tx, toAdd);
    if (toRemove.length) await tx.userRole.deleteMany({ where: { userId, roleId: { in: toRemove } } });
    if (toAdd.length) {
      await tx.userRole.createMany({ data: toAdd.map((roleId) => ({ userId, roleId, assignedById: auth.userId })) });
    }
    await assertAdminRemains(tx);

    const roles = (await tx.userRole.findMany({ where: { userId }, select: { role: { select: { id: true, name: true } } } }))
      .map((r) => toNameRef(r.role))
      .sort((a, b) => a.name.localeCompare(b.name));
    await AuditLogModel.record(
      {
        actorId: auth.userId, action: "users.roles_updated", entityType: "user", entityId: userId,
        before: { roles: user.roles.map((r) => r.name) }, after: { roles: roles.map((r) => r.name) },
        ip: auth.ip, userAgent: auth.userAgent,
      },
      tx
    );
    return { userId, roles };
  });
}

/** Audit: users.password_reset. Set hash, mustChangePassword = true, revoke sessions (PASSWORD_RESET). */
export async function adminResetPassword(id: string, passwordHash: string, auth: AuthContext): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const exists = await tx.user.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!exists) return false;
    const now = new Date();
    await tx.user.update({
      where: { id },
      data: { passwordHash, passwordChangedAt: now, mustChangePassword: true, failedLoginCount: 0, lockedUntil: null },
    });
    await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: now, revokedReason: "PASSWORD_RESET" } });
    await AuditLogModel.record(
      { actorId: auth.userId, action: "users.password_reset", entityType: "user", entityId: id, ip: auth.ip, userAgent: auth.userAgent },
      tx
    );
    return true;
  });
}
