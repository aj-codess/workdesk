import { Errors } from "@/utilities/api-error";
import { assertCanGrant, assertPermission } from "@/utilities/authorization";
import { noContent, success } from "@/utilities/api-response";
import { parseBody, parseOptionalBody, parseParams, parseQuery } from "@/utilities/request";
import { buildMeta } from "@/types/pagination";
import * as PasswordService from "@/service/password.service";
import * as UserModel from "@/models/user.model";
import * as RoleModel from "@/models/role.model";
import * as SessionModel from "@/models/session.model";
import * as AuditLogModel from "@/models/audit-log.model";
import { idParams } from "@/validators/common";
import {
  adminResetPasswordBody, assignRolesBody, createUserBody, deactivateUserBody, listUsersQuery, updateUserBody,
} from "@/validators/user.validator";
import type { ProtectedContext } from "@/types/auth";

type IdParams = { id: string };

/** GET /users */
export async function list({ req }: ProtectedContext) {
  const query = parseQuery(req, listUsersQuery);
  const { rows, total } = await UserModel.list(query);
  return success(rows, { meta: buildMeta(query, total) });
}

/** POST /users */
export async function create({ req, auth }: ProtectedContext) {
  const { password, ...input } = await parseBody(req, createUserBody);

  if (input.roleIds?.length) {
    assertPermission(auth, "users.assign_roles");
    assertCanGrant(auth, await RoleModel.getPermissionKeysForRoles(input.roleIds));
  }
  if (input.activate) assertPermission(auth, "users.activate");

  const temporaryPassword = password ? undefined : PasswordService.generatePassword();
  const passwordHash = await PasswordService.hash(password ?? temporaryPassword!);

  const user = await UserModel.create({ ...input, passwordHash }, auth);
  return success({ user, ...(temporaryPassword ? { temporaryPassword } : {}) }, { status: 201 });
}

/** GET /users/:id : users.view, or the caller reading themselves. */
export async function get({ params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  if (id !== auth.userId) assertPermission(auth, "users.view");
  const user = await UserModel.findById(id);
  if (!user) throw Errors.notFound("User");
  return success(user);
}

/** PATCH /users/:id */
export async function update({ req, params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  const body = await parseBody(req, updateUserBody);
  const user = await UserModel.update(id, body, auth);
  if (!user) throw Errors.notFound("User");
  return success(user);
}

/** DELETE /users/:id */
export async function remove({ params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  if (id === auth.userId) throw Errors.cannotModifySelf();
  if (!(await UserModel.softDelete(id, auth))) throw Errors.notFound("User");
  return noContent();
}

/** POST /users/:id/activate */
export async function activate({ params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  const user = await UserModel.activate(id, auth);
  if (!user) throw Errors.notFound("User");
  return success(user);
}

/** POST /users/:id/deactivate */
export async function deactivate({ req, params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  if (id === auth.userId) throw Errors.cannotModifySelf();
  const { reason } = await parseOptionalBody(req, deactivateUserBody);
  const user = await UserModel.deactivate(id, reason, auth);
  if (!user) throw Errors.notFound("User");
  return success(user);
}

/** PUT /users/:id/roles : replaces the full role set. */
export async function replaceRoles({ req, params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  if (id === auth.userId) throw Errors.cannotModifySelf("You cannot change your own roles");
  const { roleIds } = await parseBody(req, assignRolesBody);

  // Escalation rule applies to NEWLY added roles only.
  const current = new Set(await UserModel.getRoleIds(id));
  const added = roleIds.filter((r) => !current.has(r));
  if (added.length) assertCanGrant(auth, await RoleModel.getPermissionKeysForRoles(added));

  const result = await UserModel.replaceRoles(id, roleIds, auth);
  if (!result) throw Errors.notFound("User");
  return success(result);
}

/** POST /users/:id/reset-password : admin sets a password for another user. */
export async function resetPassword({ req, params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  if (id === auth.userId) throw Errors.cannotModifySelf("Use change-password for your own account");
  const { newPassword } = await parseOptionalBody(req, adminResetPasswordBody);

  const temporaryPassword = newPassword ? undefined : PasswordService.generatePassword();
  const passwordHash = await PasswordService.hash(newPassword ?? temporaryPassword!);

  if (!(await UserModel.adminResetPassword(id, passwordHash, auth))) throw Errors.notFound("User");
  return success(temporaryPassword ? { temporaryPassword } : {});
}

/** GET /users/:id/sessions : `current` is always false for another user's sessions. */
export async function listSessions({ params }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  if (!(await UserModel.findById(id))) throw Errors.notFound("User");
  return success(await SessionModel.listLiveForUser(id, null));
}

/** DELETE /users/:id/sessions */
export async function revokeSessions({ params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  if (!(await UserModel.findById(id))) throw Errors.notFound("User");
  await SessionModel.revokeAllForUser(id, "ADMIN_REVOKED");
  await AuditLogModel.record({
    actorId: auth.userId, action: "users.sessions_revoked", entityType: "user", entityId: id,
    ip: auth.ip, userAgent: auth.userAgent,
  });
  return noContent();
}

