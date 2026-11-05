// audit_logs is append-only (DB trigger). Never store passwords or tokens in before/after: redact them.
import type { Paginated } from "@/types/pagination";
import type { AuditEntry, AuditLog } from "@/types/dto";
import type { ListAuditLogsQuery } from "@/validators/audit-log.validator";
import { notImplemented } from "@/utilities/not-implemented";

/** Append one row. Must never throw into the request path for a failed audit of a DENIED event; log and continue. */
export async function record(_entry: AuditEntry): Promise<void> {
  return notImplemented("AuditLogModel.record");
}

export async function list(_query: ListAuditLogsQuery): Promise<Paginated<AuditLog>> {
  return notImplemented("AuditLogModel.list");
}

/** `id` is a numeric string (BigInt). */
export async function findById(_id: string): Promise<AuditLog | null> {
  return notImplemented("AuditLogModel.findById");
}
