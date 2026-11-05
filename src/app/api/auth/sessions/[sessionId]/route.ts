import { protectedRoute } from "@/middleware/route-handler";
import * as AuthController from "@/controller/auth.controller";

export const DELETE = protectedRoute({}, AuthController.revokeSession);
