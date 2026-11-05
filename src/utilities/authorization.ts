import type { PermissionKey } from "@/config/permissions";
import { Errors } from "@/utilities/api-error";
import type { AuthContext, PermissionRequirement } from "@/types/auth";

export function hasPermission(auth: Pick<AuthContext, "permissions">, key: PermissionKey): boolean {
  return auth.permissions.includes(key);
}

export function hasAnyPermission(auth: Pick<AuthContext, "permissions">, keys: PermissionKey[]): boolean {
  return keys.some((k) => auth.permissions.includes(k));
}

export function satisfies(auth: Pick<AuthContext, "permissions">, req: PermissionRequirement): boolean {
  const allOk = !req.all || req.all.every((k) => auth.permissions.includes(k));
  const anyOk = !req.any || req.any.length === 0 || req.any.some((k) => auth.permissions.includes(k));
  return allOk && anyOk;
}

export function assertPermission(auth: Pick<AuthContext, "permissions">, key: PermissionKey): void {
  if (!hasPermission(auth, key)) throw Errors.forbidden();
}

/**
 * Privilege-escalation rule: a caller may only grant permissions they hold themselves.
 * `permissionKeys` are the keys being newly granted (directly, or through a role).
 */
export function assertCanGrant(auth: Pick<AuthContext, "permissions">, permissionKeys: string[]): void {
  const missing = permissionKeys.filter((k) => !auth.permissions.includes(k));
  if (missing.length > 0) {
    throw Errors.privilegeEscalation(`You cannot grant permissions you do not hold: ${missing.join(", ")}`);
  }
}
