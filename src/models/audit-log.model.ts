// audit_logs is append-only (DB trigger). Never store passwords or tokens in before/after: redact them.
import { Prisma } from "@prisma/client";
import { prisma } from "@/config/prisma";
import type { Paginated } from "@/types/pagination";
import type { AuditEntry, AuditLog } from "@/types/dto";
import type { ListAuditLogsQuery } from "@/validators/audit-log.validator";
import { iso, toUserRef, userRefSelect, type Db } from "@/utilities/mappers";
import { logger } from "@/utilities/logger";

const SECRET_KEY = /pass(word)?|hash|token|secret|authorization|cookie/i;

/** Deep copy with secret-looking keys replaced. Depth-limited so a hostile payload cannot blow the stack. */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (depth > 6) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 200).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEY.test(k) ? "[redacted]" : redact(v, depth + 1);
  }
  return out;
}

function json(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (value === undefined || value === null) return Prisma.DbNull;
  return redact(value) as Prisma.InputJsonValue;
}

/**
 * Append one row. Pass a transaction client as `db` to make the audit row atomic with the change it describes.
 * Without `db`, a failed write is logged and swallowed for DENIED/FAILURE events (they must not change the response),
 * but still throws for SUCCESS so a state change is never left un-audited.
 */
export async function record(entry: AuditEntry, db?: Db): Promise<void> {
  const write = () =>
    (db ?? prisma).auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        action: entry.action.slice(0, 100),
        entityType: entry.entityType?.slice(0, 50) ?? null,
        entityId: entry.entityId?.slice(0, 64) ?? null,
        outcome: entry.outcome ?? "SUCCESS",
        before: json(entry.before),
        after: json(entry.after),
        ipAddress: entry.ip?.slice(0, 45) ?? null,
        userAgent: entry.userAgent?.slice(0, 500) ?? null,
      },
    });
  if (db || (entry.outcome ?? "SUCCESS") === "SUCCESS") {
    await write();
    return;
  }
  try {
    await write();
  } catch (e) {
    logger.error(`[AUDIT] write failed for ${entry.action}: ${e}`);
  }
}

type Row = Prisma.AuditLogGetPayload<{ include: { actor: { select: typeof userRefSelect } } }>;

function toAuditLog(r: Row): AuditLog {
  return {
    id: r.id.toString(),
    actor: r.actor ? toUserRef(r.actor) : null,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    outcome: r.outcome,
    before: r.before ?? null,
    after: r.after ?? null,
    ipAddress: r.ipAddress,
    userAgent: r.userAgent,
    requestId: r.requestId,
    createdAt: iso(r.createdAt),
  };
}

const include = { actor: { select: userRefSelect } } as const;

export async function list(query: ListAuditLogsQuery): Promise<Paginated<AuditLog>> {
  const where: Prisma.AuditLogWhereInput = {
    ...(query.actorId ? { actorId: query.actorId } : {}),
    ...(query.action
      ? query.action.endsWith(".")
        ? { action: { startsWith: query.action } }
        : { action: query.action }
      : {}),
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.entityId ? { entityId: query.entityId } : {}),
    ...(query.outcome ? { outcome: query.outcome } : {}),
    ...(query.from || query.to
      ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } }
      : {}),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      include,
      orderBy: [{ createdAt: query.order }, { id: query.order }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { rows: rows.map(toAuditLog), total };
}

/** `id` is a numeric string (BigInt). */
export async function findById(id: string): Promise<AuditLog | null> {
  if (!/^\d{1,18}$/.test(id)) return null;
  const row = await prisma.auditLog.findUnique({ where: { id: BigInt(id) }, include });
  return row ? toAuditLog(row) : null;
}

