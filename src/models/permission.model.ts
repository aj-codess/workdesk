import type { Permission } from "@/types/dto";
import { notImplemented } from "@/utilities/not-implemented";

/**
 * Effective permission keys: union over the user's ACTIVE roles (query in docs/architecture.md section 8).
 * Called on every authenticated request, so permission changes apply immediately.
 */
export async function getEffectiveKeys(_userId: string): Promise<string[]> {
  return notImplemented("PermissionModel.getEffectiveKeys");
}

export async function list(_filter: { module?: string }): Promise<Permission[]> {
  return notImplemented("PermissionModel.list");
}

/** Keys for the given ids. Fewer rows than ids = some id is unknown (caller answers 400). */
export async function findKeysByIds(_ids: string[]): Promise<{ id: string; key: string }[]> {
  return notImplemented("PermissionModel.findKeysByIds");
}
