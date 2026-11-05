import { protectedRoute } from "@/middleware/route-handler";
import * as RoleController from "@/controller/role.controller";

export const PUT = protectedRoute({ permissions: { all: ["roles.assign_permissions"] } }, RoleController.replacePermissions);
