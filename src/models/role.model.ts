import type { Paginated } from "@/types/pagination";
import type { AuthContext } from "@/types/auth";
import type { Role, RoleDetail } from "@/types/dto";
import type { CreateRoleBody, ListRolesQuery, UpdateRoleBody } from "@/validators/role.validator";
import { notImplemented } from "@/utilities/not-implemented";

export async function list(_query: ListRolesQuery): Promise<Paginated<Role>> {
  return notImplemented("RoleModel.list");
}

export async function findById(_id: string): Promise<RoleDetail | null> {
  return notImplemented("RoleModel.findById");
}

/** Union of permission keys of these roles (privilege-escalation check when assigning roles). Unknown or inactive ids are ignored. */
export async function getPermissionKeysForRoles(_roleIds: string[]): Promise<string[]> {
  return notImplemented("RoleModel.getPermissionKeysForRoles");
}

/** Keys currently on one role (to work out which are newly added). */
export async function getPermissionKeys(_roleId: string): Promise<string[]> {
  return notImplemented("RoleModel.getPermissionKeys");
}

/** Audit: roles.created. Throw 409 CONFLICT (case-insensitive name). Links `permissionIds` when given. */
export async function create(_input: CreateRoleBody, _auth: AuthContext): Promise<RoleDetail> {
  return notImplemented("RoleModel.create");
}

/**
 * Audit: roles.updated. System roles: name immutable. System Administrator cannot be deactivated
 * (409 LAST_ADMIN_PROTECTED). Throw 409 CONFLICT on duplicate name.
 */
export async function update(_id: string, _input: UpdateRoleBody, _auth: AuthContext): Promise<Role | null> {
  return notImplemented("RoleModel.update");
}

/** Audit: roles.deleted. Throw 409 ROLE_IN_USE when isSystem or still assigned. false when not found. */
export async function remove(_id: string, _auth: AuthContext): Promise<boolean> {
  return notImplemented("RoleModel.remove");
}

/**
 * Audit: roles.permissions_updated with the diff. Replace the full permission set.
 * On the System Administrator role `roles.assign_permissions` and `users.assign_roles` cannot be removed
 * (409 LAST_ADMIN_PROTECTED).
 */
export async function replacePermissions(
  _roleId: string,
  _permissionIds: string[],
  _auth: AuthContext
): Promise<{ role: RoleDetail; added: string[]; removed: string[] } | null> {
  return notImplemented("RoleModel.replacePermissions");
}
