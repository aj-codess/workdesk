// Internal helper shared by the user and role models: the "never lock everyone out" invariant.
//
// An *administrator* is an ACTIVE, non-deleted user whose active roles together grant BOTH
// `users.assign_roles` and `roles.assign_permissions` (the two permissions needed to repair any
// other access problem). The rule is permission-based, never name-based.
//
// Usage: inside the transaction that makes the change, take the lock first, apply the change,
// then call assertAdminRemains(). If it throws, the whole transaction rolls back.
import { Prisma } from "@prisma/client";
import { DomainErrors } from "@/utilities/domain-errors";
import type { Db } from "@/utilities/mappers";

export const ADMIN_KEYS = ["users.assign_roles", "roles.assign_permissions"] as const;

/** Serialises every change that can affect who the administrators are (released at commit/rollback). */
export async function lockAdminChanges(tx: Db): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('workdesk:admin-guard'))`;
}

const grants = (key: string): Prisma.UserRoleWhereInput => ({
  role: { isActive: true, rolePermissions: { some: { permission: { key } } } },
});

export async function countAdministrators(tx: Db): Promise<number> {
  return tx.user.count({
    where: {
      status: "ACTIVE",
      deletedAt: null,
      AND: ADMIN_KEYS.map((k) => ({ userRoles: { some: grants(k) } })),
    },
  });
}

export async function assertAdminRemains(tx: Db): Promise<void> {
  if ((await countAdministrators(tx)) === 0) throw DomainErrors.lastAdminProtected();
}
