import { z } from "zod";
import { isoDate, uuid } from "@/validators/common";

export const listAuditLogsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  order: z.enum(["asc", "desc"]).default("desc"),
  actorId: uuid.optional(),
  /** Exact action, or a prefix ending in "." such as "auth." */
  action: z.string().max(100).optional(),
  entityType: z.string().max(50).optional(),
  entityId: z.string().max(64).optional(),
  outcome: z.enum(["SUCCESS", "DENIED", "FAILURE"]).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

/** audit_logs.id is a BigInt serialised as a numeric string. */
export const auditLogParams = z.object({ id: z.string().regex(/^\d+$/, "must be a numeric id") });

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuery>;
