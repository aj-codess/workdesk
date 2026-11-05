import { protectedRoute } from "@/middleware/route-handler";
import * as ProfileController from "@/controller/profile.controller";

export const PATCH = protectedRoute({}, ProfileController.update);
