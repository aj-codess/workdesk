import { protectedRoute } from "@/middleware/route-handler";
import * as LookupController from "@/controller/lookup.controller";

export const GET = protectedRoute({ permissions: { all: ["departments.manage_members"] } }, LookupController.users);
