import { Errors } from "@/utilities/api-error";
import { noContent, success } from "@/utilities/api-response";
import { parseBody, parseParams, parseQuery } from "@/utilities/request";
import { buildMeta } from "@/types/pagination";
import * as DepartmentModel from "@/models/department.model";
import { idParams } from "@/validators/common";
import {
  addManagerBody, addMembersBody, createDepartmentBody, departmentUserParams, listDepartmentsQuery,
  listMembersQuery, updateDepartmentBody,
} from "@/validators/department.validator";
import type { ProtectedContext } from "@/types/auth";

type IdParams = { id: string };
type IdUserParams = { id: string; userId: string };

/** GET /departments */
export async function list({ req }: ProtectedContext) {
  const query = parseQuery(req, listDepartmentsQuery);
  const { rows, total } = await DepartmentModel.list(query);
  return success(rows, { meta: buildMeta(query, total) });
}

/** POST /departments */
export async function create({ req, auth }: ProtectedContext) {
  const body = await parseBody(req, createDepartmentBody);
  return success(await DepartmentModel.create(body, auth), { status: 201 });
}

/** GET /departments/:id */
export async function get({ params }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  const department = await DepartmentModel.findById(id);
  if (!department) throw Errors.notFound("Department");
  return success(department);
}

/** PATCH /departments/:id */
export async function update({ req, params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  const body = await parseBody(req, updateDepartmentBody);
  const department = await DepartmentModel.update(id, body, auth);
  if (!department) throw Errors.notFound("Department");
  return success(department);
}

/** GET /departments/:id/managers */
export async function listManagers({ params }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  const managers = await DepartmentModel.listManagers(id);
  if (!managers) throw Errors.notFound("Department");
  return success(managers);
}

/** POST /departments/:id/managers */
export async function addManager({ req, params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  const { userId } = await parseBody(req, addManagerBody);
  const { managers, warnings } = await DepartmentModel.addManager(id, userId, auth);
  return success({ managers, ...(warnings.length ? { warnings } : {}) }, { status: 201 });
}

/** DELETE /departments/:id/managers/:userId */
export async function removeManager({ params, auth }: ProtectedContext<IdUserParams>) {
  const { id, userId } = parseParams(params, departmentUserParams);
  if (!(await DepartmentModel.removeManager(id, userId, auth))) throw Errors.notFound("Manager");
  return noContent();
}

/** GET /departments/:id/members */
export async function listMembers({ req, params }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  const query = parseQuery(req, listMembersQuery);
  const page = await DepartmentModel.listMembers(id, query);
  if (!page) throw Errors.notFound("Department");
  return success(page.rows, { meta: buildMeta(query, page.total) });
}

/** POST /departments/:id/members */
export async function addMembers({ req, params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  const { userIds } = await parseBody(req, addMembersBody);
  return success(await DepartmentModel.addMembers(id, userIds, auth), { status: 201 });
}

/** DELETE /departments/:id/members/:userId */
export async function removeMember({ params, auth }: ProtectedContext<IdUserParams>) {
  const { id, userId } = parseParams(params, departmentUserParams);
  if (!(await DepartmentModel.removeMember(id, userId, auth))) throw Errors.notFound("Member");
  return noContent();
}
