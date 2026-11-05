import { protectedRoute } from "@/middleware/route-handler";
import * as PermissionController from "@/controller/permission.controller";

export const GET = protectedRoute({ permissions: { all: ["permissions.view"] } }, PermissionController.list);
