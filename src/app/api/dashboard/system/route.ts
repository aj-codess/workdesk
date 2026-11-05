import { protectedRoute } from "@/middleware/route-handler";
import * as DashboardController from "@/controller/dashboard.controller";

export const GET = protectedRoute({ permissions: { all: ["tickets.view_all"] } }, DashboardController.system);
