import { prisma } from "@/config/prisma";
import type { Permission } from "@/types/dto";

/**
 * Effective permission keys: union over the user's ACTIVE roles (query in docs/architecture.md section 8).
 * Called on every authenticated request, so permission changes apply immediately.
 */
export async function getEffectiveKeys(userId: string): Promise<string[]> {
  const rows = await prisma.permission.findMany({
    where: {
      rolePermissions: {
        some: { role: { isActive: true, userRoles: { some: { userId } } } },
      },
    },
    select: { key: true },
  });
  return rows.map((r) => r.key).sort();
}

export async function list(filter: { module?: string }): Promise<Permission[]> {
  const rows = await prisma.permission.findMany({
    where: filter.module ? { module: filter.module } : {},
    orderBy: [{ module: "asc" }, { key: "asc" }],
  });
  return rows.map((r) => ({ id: r.id, key: r.key, module: r.module, description: r.description }));
}

/** Keys for the given ids. Fewer rows than ids = some id is unknown (caller answers 400). */
export async function findKeysByIds(ids: string[]): Promise<{ id: string; key: string }[]> {
  if (ids.length === 0) return [];
  return prisma.permission.findMany({ where: { id: { in: ids } }, select: { id: true, key: true } });
}
