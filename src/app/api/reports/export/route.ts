import { protectedRoute } from "@/middleware/route-handler";
import { RATE_LIMITS } from "@/config/rate-limits";
import * as ReportController from "@/controller/report.controller";

export const GET = protectedRoute({ permissions: { all: ["reports.export", "reports.view"] }, rateLimit: RATE_LIMITS.reportExport }, ReportController.exportCsv);
