import { protectedRoute } from "@/middleware/route-handler";
import * as UserController from "@/controller/user.controller";

export const POST = protectedRoute({ permissions: { all: ["users.activate"] } }, UserController.activate);
