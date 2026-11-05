import { protectedRoute } from "@/middleware/route-handler";
import * as UserController from "@/controller/user.controller";

export const GET = protectedRoute({ permissions: { all: ["users.view"] } }, UserController.list);
export const POST = protectedRoute({ permissions: { all: ["users.create"] } }, UserController.create);
