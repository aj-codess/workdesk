import { protectedRoute } from "@/middleware/route-handler";
import * as RoleController from "@/controller/role.controller";

export const GET = protectedRoute({ permissions: { all: ["roles.view"] } }, RoleController.get);
export const PATCH = protectedRoute({ permissions: { all: ["roles.update"] } }, RoleController.update);
export const DELETE = protectedRoute({ permissions: { all: ["roles.delete"] } }, RoleController.remove);
