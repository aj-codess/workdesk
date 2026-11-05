// All database access for users (+ their role / department links). No HTTP, no external calls.
import type { Paginated } from "@/types/pagination";
import type { AuthContext } from "@/types/auth";
import type { AuthUser, UserCredentials, UserDetail, UserSummary, NameRef } from "@/types/dto";
import type { CreateUserBody, ListUsersQuery, RoleUsersQuery, UpdateUserBody } from "@/validators/user.validator";
import type { UpdateProfileBody } from "@/validators/auth.validator";
import { notImplemented } from "@/utilities/not-implemented";

// ---- credentials / login -------------------------------------------------------------

/** Lowercased email -> credentials row (includes passwordHash). Soft-deleted users are still returned so the caller can reject them. */
export async function findCredentialsByEmail(_email: string): Promise<UserCredentials | null> {
  return notImplemented("UserModel.findCredentialsByEmail");
}

export async function findCredentialsById(_id: string): Promise<UserCredentials | null> {
  return notImplemented("UserModel.findCredentialsById");
}

/** Increment failedLoginCount; when it reaches `maxFailed` set lockedUntil = now + lockoutMinutes. */
export async function registerFailedLogin(
  _userId: string,
  _policy: { maxFailed: number; lockoutMinutes: number }
): Promise<void> {
  return notImplemented("UserModel.registerFailedLogin");
}

/** Reset failedLoginCount/lockedUntil and set lastLoginAt = now. */
export async function registerSuccessfulLogin(_userId: string): Promise<void> {
  return notImplemented("UserModel.registerSuccessfulLogin");
}

/** Set passwordHash + passwordChangedAt = now, clear mustChangePassword. */
export async function changePassword(_userId: string, _passwordHash: string): Promise<void> {
  return notImplemented("UserModel.changePassword");
}

// ---- profile / reads -----------------------------------------------------------------

/** AuthUser shape for login, /auth/me and PATCH /profile. */
export async function findAuthUser(_id: string): Promise<AuthUser | null> {
  return notImplemented("UserModel.findAuthUser");
}

export async function updateProfile(_id: string, _input: UpdateProfileBody): Promise<AuthUser> {
  return notImplemented("UserModel.updateProfile");
}

/** Excludes soft-deleted users. */
export async function list(_query: ListUsersQuery): Promise<Paginated<UserSummary>> {
  return notImplemented("UserModel.list");
}

/** Users holding a role (GET /roles/:id/users). */
export async function listByRole(_roleId: string, _query: RoleUsersQuery): Promise<Paginated<UserSummary>> {
  return notImplemented("UserModel.listByRole");
}

/** null when missing or soft-deleted. */
export async function findById(_id: string): Promise<UserDetail | null> {
  return notImplemented("UserModel.findById");
}

/** Role ids currently held (to work out which roles are newly added). */
export async function getRoleIds(_userId: string): Promise<string[]> {
  return notImplemented("UserModel.getRoleIds");
}

// ---- admin mutations (each writes its audit_logs row; see the action named per function) ----

/** Audit: users.created. `roleIds` and `activate` have already been authorised by the controller. */
export async function create(
  _input: Omit<CreateUserBody, "password"> & { passwordHash: string },
  _auth: AuthContext
): Promise<UserDetail> {
  return notImplemented("UserModel.create");
}

/** Audit: users.updated with before/after. Throw 409 CONFLICT on duplicate email. */
export async function update(_id: string, _input: UpdateUserBody, _auth: AuthContext): Promise<UserDetail | null> {
  return notImplemented("UserModel.update");
}

/**
 * Audit: users.deleted. Soft delete, revoke all sessions, remove manager/member rows.
 * Throw 409 LAST_ADMIN_PROTECTED / HAS_OPEN_ASSIGNMENTS. Return false when not found.
 */
export async function softDelete(_id: string, _auth: AuthContext): Promise<boolean> {
  return notImplemented("UserModel.softDelete");
}

/** Audit: users.activated. Set ACTIVE, deactivatedAt = null, clear lock + failedLoginCount. */
export async function activate(_id: string, _auth: AuthContext): Promise<UserDetail | null> {
  return notImplemented("UserModel.activate");
}

/**
 * Audit: users.deactivated. Set INACTIVE, deactivatedAt = now, revoke every session (USER_DEACTIVATED).
 * Throw 409 LAST_ADMIN_PROTECTED.
 */
export async function deactivate(_id: string, _reason: string | undefined, _auth: AuthContext): Promise<UserDetail | null> {
  return notImplemented("UserModel.deactivate");
}

/**
 * Audit: users.roles_updated with before/after. Replace the full role set.
 * Throw 409 LAST_ADMIN_PROTECTED; 400 for unknown or inactive newly added roles.
 */
export async function replaceRoles(
  _userId: string,
  _roleIds: string[],
  _auth: AuthContext
): Promise<{ userId: string; roles: NameRef[] } | null> {
  return notImplemented("UserModel.replaceRoles");
}

/** Audit: users.password_reset. Set hash, mustChangePassword = true, revoke sessions (PASSWORD_RESET). */
export async function adminResetPassword(_id: string, _passwordHash: string, _auth: AuthContext): Promise<boolean> {
  return notImplemented("UserModel.adminResetPassword");
}
