import { protectedRoute } from "@/middleware/route-handler";
import * as UserController from "@/controller/user.controller";

export const GET = protectedRoute({ permissions: { all: ["users.revoke_sessions"] } }, UserController.listSessions);
export const DELETE = protectedRoute({ permissions: { all: ["users.revoke_sessions"] } }, UserController.revokeSessions);
