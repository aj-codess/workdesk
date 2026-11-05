import { protectedRoute } from "@/middleware/route-handler";
import * as LookupController from "@/controller/lookup.controller";

export const GET = protectedRoute({ permissions: { all: ["tickets.assign"] } }, LookupController.agents);
