import { protectedRoute } from "@/middleware/route-handler";
import * as LookupController from "@/controller/lookup.controller";

export const GET = protectedRoute({ permissions: { any: ["users.assign_roles", "users.create"] } }, LookupController.roles);
