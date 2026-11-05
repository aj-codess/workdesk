import { success } from "@/utilities/api-response";
import { parseQuery } from "@/utilities/request";
import * as PermissionModel from "@/models/permission.model";
import { listPermissionsQuery } from "@/validators/role.validator";
import type { Permission } from "@/types/dto";
import type { ProtectedContext } from "@/types/auth";

/** GET /permissions : read-only catalogue, optionally grouped by module. */
export async function list({ req }: ProtectedContext) {
  const { module, grouped } = parseQuery(req, listPermissionsQuery);
  const permissions = await PermissionModel.list({ module });
  if (!grouped) return success(permissions);

  const byModule: Record<string, Permission[]> = {};
  for (const p of permissions) (byModule[p.module] ??= []).push(p);
  return success(byModule);
}
