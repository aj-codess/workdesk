import { protectedRoute } from "@/middleware/route-handler";
import * as LookupController from "@/controller/lookup.controller";

export const GET = protectedRoute({ permissions: { any: ["tickets.create", "tickets.transfer_department", "departments.view"] } }, LookupController.departments);
