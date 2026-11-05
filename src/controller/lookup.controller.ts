import { Errors } from "@/utilities/api-error";
import { success } from "@/utilities/api-response";
import { parseQuery } from "@/utilities/request";
import * as LookupModel from "@/models/lookup.model";
import { lookupAgentsQuery, lookupCategoriesQuery, lookupUsersQuery } from "@/validators/lookup.validator";
import type { ProtectedContext } from "@/types/auth";

/** GET /lookups/departments */
export async function departments(_ctx: ProtectedContext) {
  return success(await LookupModel.departments());
}

/** GET /lookups/categories?departmentId= */
export async function categories({ req }: ProtectedContext) {
  const { departmentId } = parseQuery(req, lookupCategoriesQuery);
  return success(await LookupModel.categories(departmentId));
}

/** GET /lookups/agents?departmentId= : department must be in the caller's scope, else 404. */
export async function agents({ req, auth }: ProtectedContext) {
  const { departmentId } = parseQuery(req, lookupAgentsQuery);
  const rows = await LookupModel.agents(departmentId, auth);
  if (!rows) throw Errors.notFound("Department");
  return success(rows);
}

/** GET /lookups/roles */
export async function roles({ auth }: ProtectedContext) {
  return success(await LookupModel.roles(auth));
}

/** GET /lookups/users?search=&limit= */
export async function users({ req }: ProtectedContext) {
  const { search, limit } = parseQuery(req, lookupUsersQuery);
  return success(await LookupModel.users(search, limit));
}
