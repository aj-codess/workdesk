import { protectedRoute } from "@/middleware/route-handler";
import * as AuditLogController from "@/controller/audit-log.controller";

export const GET = protectedRoute({ permissions: { all: ["audit_logs.view"] } }, AuditLogController.get);
