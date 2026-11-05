import { protectedRoute } from "@/middleware/route-handler";
import * as UserController from "@/controller/user.controller";

export const GET = protectedRoute({}, UserController.get);
export const PATCH = protectedRoute({ permissions: { all: ["users.update"] } }, UserController.update);
export const DELETE = protectedRoute({ permissions: { all: ["users.delete"] } }, UserController.remove);
