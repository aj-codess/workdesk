import { Errors } from "@/utilities/api-error";
import { success } from "@/utilities/api-response";
import { parseParams, parseQuery } from "@/utilities/request";
import { buildMeta } from "@/types/pagination";
import * as AuditLogModel from "@/models/audit-log.model";
import { auditLogParams, listAuditLogsQuery } from "@/validators/audit-log.validator";
import type { ProtectedContext } from "@/types/auth";

/** GET /audit-logs */
export async function list({ req }: ProtectedContext) {
  const query = parseQuery(req, listAuditLogsQuery);
  const { rows, total } = await AuditLogModel.list(query);
  return success(rows, { meta: buildMeta(query, total) });
}

/** GET /audit-logs/:id */
export async function get({ params }: ProtectedContext<{ id: string }>) {
  const { id } = parseParams(params, auditLogParams);
  const entry = await AuditLogModel.findById(id);
  if (!entry) throw Errors.notFound("Audit log entry");
  return success(entry);
}
