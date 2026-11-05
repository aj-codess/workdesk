import { Errors } from "@/utilities/api-error";
import { assertCanGrant, assertPermission } from "@/utilities/authorization";
import { noContent, success } from "@/utilities/api-response";
import { parseBody, parseParams, parseQuery } from "@/utilities/request";
import { buildMeta } from "@/types/pagination";
import * as RoleModel from "@/models/role.model";
import * as UserModel from "@/models/user.model";
import * as PermissionModel from "@/models/permission.model";
import { idParams } from "@/validators/common";
import {
  createRoleBody, listRolesQuery, replaceRolePermissionsBody, updateRoleBody,
} from "@/validators/role.validator";
import { roleUsersQuery } from "@/validators/user.validator";
import type { ProtectedContext } from "@/types/auth";

type IdParams = { id: string };

/** Resolve permission ids to keys; an unknown id is a 400. */
async function resolvePermissionKeys(permissionIds: string[]): Promise<{ id: string; key: string }[]> {
  const found = await PermissionModel.findKeysByIds(permissionIds);
  if (found.length !== permissionIds.length) throw Errors.validation("One or more permissionIds do not exist");
  return found;
}

/** GET /roles */
export async function list({ req }: ProtectedContext) {
  const query = parseQuery(req, listRolesQuery);
  const { rows, total } = await RoleModel.list(query);
  return success(rows, { meta: buildMeta(query, total) });
}

/** POST /roles */
export async function create({ req, auth }: ProtectedContext) {
  const body = await parseBody(req, createRoleBody);

  if (body.permissionIds?.length) {
    assertPermission(auth, "roles.assign_permissions");
    const found = await resolvePermissionKeys(body.permissionIds);
    assertCanGrant(auth, found.map((p) => p.key));
  }

  return success(await RoleModel.create(body, auth), { status: 201 });
}

/** GET /roles/:id */
export async function get({ params }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  const role = await RoleModel.findById(id);
  if (!role) throw Errors.notFound("Role");
  return success(role);
}

/** PATCH /roles/:id */
export async function update({ req, params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  const body = await parseBody(req, updateRoleBody);
  const role = await RoleModel.update(id, body, auth);
  if (!role) throw Errors.notFound("Role");
  return success(role);
}

/** DELETE /roles/:id */
export async function remove({ params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  if (!(await RoleModel.remove(id, auth))) throw Errors.notFound("Role");
  return noContent();
}

/** PUT /roles/:id/permissions : replaces the full set (adds and removes in one call). */
export async function replacePermissions({ req, params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  const { permissionIds } = await parseBody(req, replaceRolePermissionsBody);

  const requested = await resolvePermissionKeys(permissionIds);
  // Escalation rule applies to NEWLY added permissions only.
  const current = new Set(await RoleModel.getPermissionKeys(id));
  assertCanGrant(auth, requested.map((p) => p.key).filter((k) => !current.has(k)));

  const result = await RoleModel.replacePermissions(id, permissionIds, auth);
  if (!result) throw Errors.notFound("Role");
  return success(result);
}

/** GET /roles/:id/users */
export async function listUsers({ req, params }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  const query = parseQuery(req, roleUsersQuery);
  if (!(await RoleModel.findById(id))) throw Errors.notFound("Role");
  const { rows, total } = await UserModel.listByRole(id, query);
  return success(rows, { meta: buildMeta(query, total) });
}
