import { Errors } from "@/utilities/api-error";
import { hasPermission } from "@/utilities/authorization";
import { success } from "@/utilities/api-response";
import { parseQuery } from "@/utilities/request";
import * as DashboardModel from "@/models/dashboard.model";
import { departmentDashboardQuery } from "@/validators/dashboard.validator";
import type { ProtectedContext } from "@/types/auth";

/** GET /dashboard/my-requests */
export async function myRequests({ auth }: ProtectedContext) {
  return success(await DashboardModel.myRequests(auth));
}

/** GET /dashboard/my-work */
export async function myWork({ auth }: ProtectedContext) {
  return success(await DashboardModel.myWork(auth));
}

/** GET /dashboard/department : departmentId must be one the caller manages, else 404. */
export async function department({ req, auth }: ProtectedContext) {
  const { departmentId } = parseQuery(req, departmentDashboardQuery);
  const data = await DashboardModel.department(departmentId, auth);
  if (!data) throw Errors.notFound("Department");
  return success(data);
}

/** GET /dashboard/system : the `users` block is included only when the caller also holds users.view. */
export async function system({ auth }: ProtectedContext) {
  return success(await DashboardModel.system({ includeUsers: hasPermission(auth, "users.view") }, auth));
}
