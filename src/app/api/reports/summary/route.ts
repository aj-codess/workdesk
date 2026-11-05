import { protectedRoute } from "@/middleware/route-handler";
import * as ReportController from "@/controller/report.controller";

export const GET = protectedRoute({ permissions: { all: ["reports.view"] } }, ReportController.summary);
