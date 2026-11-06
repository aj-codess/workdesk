import { Prisma } from "@prisma/client";
import { prisma } from "@/config/prisma";
import type { Paginated } from "@/types/pagination";
import type { AuthContext } from "@/types/auth";
import type { Role, RoleDetail } from "@/types/dto";
import type { CreateRoleBody, ListRolesQuery, UpdateRoleBody } from "@/validators/role.validator";
import { Errors } from "@/utilities/api-error";
import { DomainErrors, conflictOnUnique } from "@/utilities/domain-errors";
import { iso, type Db } from "@/utilities/mappers";
import { ADMIN_KEYS, assertAdminRemains, lockAdminChanges } from "@/models/admin-guard";
import * as AuditLogModel from "@/models/audit-log.model";

const summaryInclude = {
  _count: { select: { rolePermissions: true, userRoles: { where: { user: { deletedAt: null } } } } },
} satisfies Prisma.RoleInclude;
type SummaryRow = Prisma.RoleGetPayload<{ include: typeof summaryInclude }>;

const detailInclude = {
  ...summaryInclude,
  rolePermissions: { include: { permission: true } },
} satisfies Prisma.RoleInclude;
type DetailRow = Prisma.RoleGetPayload<{ include: typeof detailInclude }>;

function toRole(r: SummaryRow): Role {
  return {
    id: r.id, name: r.name, description: r.description, isActive: r.isActive, isSystem: r.isSystem,
    permissionCount: r._count.rolePermissions, userCount: r._count.userRoles,
    createdAt: iso(r.createdAt), updatedAt: iso(r.updatedAt),
  };
}

function toDetail(r: DetailRow): RoleDetail {
  return {
    ...toRole(r),
    permissions: r.rolePermissions
      .map((rp) => ({ id: rp.permission.id, key: rp.permission.key, module: rp.permission.module, description: rp.permission.description }))
      .sort((a, b) => a.module.localeCompare(b.module) || a.key.localeCompare(b.key)),
  };
}

const loadDetail = async (db: Db, id: string): Promise<RoleDetail | null> => {
  const row = await db.role.findUnique({ where: { id }, include: detailInclude });
  return row ? toDetail(row) : null;
};

export async function list(query: ListRolesQuery): Promise<Paginated<Role>> {
  const where: Prisma.RoleWhereInput = {
    ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
    ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
  };
  const orderBy: Prisma.RoleOrderByWithRelationInput[] =
    query.sort === "userCount"
      ? [{ userRoles: { _count: query.order } }, { name: "asc" }]
      : [{ [query.sort]: query.order } as Prisma.RoleOrderByWithRelationInput, { id: "asc" }];
  const [rows, total] = await prisma.$transaction([
    prisma.role.findMany({ where, include: summaryInclude, orderBy, skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.role.count({ where }),
  ]);
  return { rows: rows.map(toRole), total };
}

export async function findById(id: string): Promise<RoleDetail | null> {
  return loadDetail(prisma, id);
}

/** Union of permission keys of these roles (privilege-escalation check when assigning roles). Unknown or inactive ids are ignored. */
export async function getPermissionKeysForRoles(roleIds: string[]): Promise<string[]> {
  if (roleIds.length === 0) return [];
  const rows = await prisma.permission.findMany({
    where: { rolePermissions: { some: { roleId: { in: roleIds }, role: { isActive: true } } } },
    select: { key: true },
  });
  return rows.map((r) => r.key);
}

/** Keys currently on one role (to work out which are newly added). */
export async function getPermissionKeys(roleId: string): Promise<string[]> {
  const rows = await prisma.rolePermission.findMany({ where: { roleId }, select: { permission: { select: { key: true } } } });
  return rows.map((r) => r.permission.key);
}

async function nameTaken(db: Db, name: string, exceptId?: string): Promise<boolean> {
  const hit = await db.role.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  return !!hit;
}

/** Audit: roles.created. Throw 409 CONFLICT (case-insensitive name). Links `permissionIds` when given. */
export async function create(input: CreateRoleBody, auth: AuthContext): Promise<RoleDetail> {
  return conflictOnUnique("A role with this name already exists", () =>
    prisma.$transaction(async (tx) => {
      if (await nameTaken(tx, input.name)) throw Errors.conflict("A role with this name already exists");
      const role = await tx.role.create({
        data: {
          name: input.name,
          description: input.description ?? null,
          isActive: input.isActive,
          isSystem: false,
          rolePermissions: input.permissionIds?.length
            ? { create: input.permissionIds.map((permissionId) => ({ permissionId, grantedById: auth.userId })) }
            : undefined,
        },
      });
      const detail = (await loadDetail(tx, role.id))!;
      await AuditLogModel.record(
        {
          actorId: auth.userId, action: "roles.created", entityType: "role", entityId: role.id,
          after: { name: detail.name, isActive: detail.isActive, permissions: detail.permissions.map((p) => p.key) },
          ip: auth.ip, userAgent: auth.userAgent,
        },
        tx
      );
      return detail;
    })
  );
}

const holdsAdminKeys = (keys: string[]) => ADMIN_KEYS.every((k) => keys.includes(k));

/**
 * Audit: roles.updated. System roles: name immutable. System Administrator cannot be deactivated
 * (409 LAST_ADMIN_PROTECTED). Throw 409 CONFLICT on duplicate name.
 */
export async function update(id: string, input: UpdateRoleBody, auth: AuthContext): Promise<Role | null> {
  return conflictOnUnique("A role with this name already exists", () =>
    prisma.$transaction(async (tx) => {
      await lockAdminChanges(tx);
      const before = await tx.role.findUnique({ where: { id }, include: { rolePermissions: { select: { permission: { select: { key: true } } } } } });
      if (!before) return null;

      if (input.name !== undefined && input.name !== before.name) {
        if (before.isSystem) throw Errors.conflict("The name of a system role cannot be changed");
        if (await nameTaken(tx, input.name, id)) throw Errors.conflict("A role with this name already exists");
      }
      const keys = before.rolePermissions.map((rp) => rp.permission.key);
      if (input.isActive === false && before.isSystem && holdsAdminKeys(keys)) {
        throw DomainErrors.lastAdminProtected("The System Administrator role cannot be deactivated");
      }

      await tx.role.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      await assertAdminRemains(tx);

      const after = await tx.role.findUniqueOrThrow({ where: { id }, include: summaryInclude });
      await AuditLogModel.record(
        {
          actorId: auth.userId, action: "roles.updated", entityType: "role", entityId: id,
          before: { name: before.name, description: before.description, isActive: before.isActive },
          after: { name: after.name, description: after.description, isActive: after.isActive },
          ip: auth.ip, userAgent: auth.userAgent,
        },
        tx
      );
      return toRole(after);
    })
  );
}

/** Audit: roles.deleted. Throw 409 ROLE_IN_USE when isSystem or still assigned. false when not found. */
export async function remove(id: string, auth: AuthContext): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await lockAdminChanges(tx);
    const role = await tx.role.findUnique({ where: { id }, include: { _count: { select: { userRoles: true } } } });
    if (!role) return false;
    if (role.isSystem) throw DomainErrors.roleInUse("System roles cannot be deleted");
    if (role._count.userRoles > 0) throw DomainErrors.roleInUse(`Role is still assigned to ${role._count.userRoles} user(s)`);
    await tx.role.delete({ where: { id } });
    await AuditLogModel.record(
      {
        actorId: auth.userId, action: "roles.deleted", entityType: "role", entityId: id,
        before: { name: role.name, isActive: role.isActive }, ip: auth.ip, userAgent: auth.userAgent,
      },
      tx
    );
    return true;
  });
}

/**
 * Audit: roles.permissions_updated with the diff. Replace the full permission set.
 * On the System Administrator role `roles.assign_permissions` and `users.assign_roles` cannot be removed
 * (409 LAST_ADMIN_PROTECTED).
 */
export async function replacePermissions(
  roleId: string,
  permissionIds: string[],
  auth: AuthContext
): Promise<{ role: RoleDetail; added: string[]; removed: string[] } | null> {
  return prisma.$transaction(async (tx) => {
    await lockAdminChanges(tx);
    const role = await tx.role.findUnique({ where: { id: roleId } });
    if (!role) return null;

    const current = await tx.rolePermission.findMany({
      where: { roleId },
      select: { permissionId: true, permission: { select: { key: true } } },
    });
    const wanted = await tx.permission.findMany({ where: { id: { in: permissionIds } }, select: { id: true, key: true } });
    if (wanted.length !== permissionIds.length) throw Errors.validation("One or more permissionIds do not exist");

    const currentIds = new Set(current.map((c) => c.permissionId));
    const wantedIds = new Set(permissionIds);
    const addedRows = wanted.filter((w) => !currentIds.has(w.id));
    const removedRows = current.filter((c) => !wantedIds.has(c.permissionId));
    const wantedKeys = wanted.map((w) => w.key);

    if (role.isSystem && holdsAdminKeys(current.map((c) => c.permission.key)) && !holdsAdminKeys(wantedKeys)) {
      throw DomainErrors.lastAdminProtected(
        "roles.assign_permissions and users.assign_roles cannot be removed from the System Administrator role"
      );
    }

    if (removedRows.length) {
      await tx.rolePermission.deleteMany({ where: { roleId, permissionId: { in: removedRows.map((r) => r.permissionId) } } });
    }
    if (addedRows.length) {
      await tx.rolePermission.createMany({
        data: addedRows.map((a) => ({ roleId, permissionId: a.id, grantedById: auth.userId })),
      });
    }
    await tx.role.update({ where: { id: roleId }, data: { updatedAt: new Date() } });
    await assertAdminRemains(tx);

    const added = addedRows.map((a) => a.key).sort();
    const removed = removedRows.map((r) => r.permission.key).sort();
    await AuditLogModel.record(
      {
        actorId: auth.userId, action: "roles.permissions_updated", entityType: "role", entityId: roleId,
        before: { permissions: current.map((c) => c.permission.key).sort() },
        after: { permissions: [...wantedKeys].sort(), added, removed },
        ip: auth.ip, userAgent: auth.userAgent,
      },
      tx
    );
    return { role: (await loadDetail(tx, roleId))!, added, removed };
  });
}
