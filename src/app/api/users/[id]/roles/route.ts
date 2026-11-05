import { protectedRoute } from "@/middleware/route-handler";
import * as UserController from "@/controller/user.controller";

export const PUT = protectedRoute({ permissions: { all: ["users.assign_roles"] } }, UserController.replaceRoles);
