import { protectedRoute } from "@/middleware/route-handler";
import * as RoleController from "@/controller/role.controller";

export const GET = protectedRoute({ permissions: { all: ["roles.view"] } }, RoleController.list);
export const POST = protectedRoute({ permissions: { all: ["roles.create"] } }, RoleController.create);
