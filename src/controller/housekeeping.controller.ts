import { timingSafeEqual } from "node:crypto";
import { env } from "@/config/env";
import { Errors } from "@/utilities/api-error";
import { success } from "@/utilities/api-response";
import { getBearerToken } from "@/utilities/request";
import { logger } from "@/utilities/logger";
import * as AuditLogModel from "@/models/audit-log.model";
import * as HousekeepingModel from "@/models/housekeeping.model";
import type { PublicContext } from "@/types/auth";

function secretMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** POST /api/internal/housekeeping : called by a scheduler with `Authorization: Bearer <CRON_SECRET>`. */
export async function run({ req, meta }: PublicContext) {
  // Without a configured secret the endpoint does not exist.
  if (!env.CRON_SECRET) throw Errors.notFound("Route");
  const presented = getBearerToken(req);
  if (!presented || !secretMatches(presented, env.CRON_SECRET)) throw Errors.unauthenticated();

  const result = await HousekeepingModel.purgeExpired();
  logger.info(`[HOUSEKEEPING] ${JSON.stringify(result)}`);
  await AuditLogModel.record({ action: "system.housekeeping", entityType: "system", after: result, ip: meta.ip, userAgent: meta.userAgent });
  return success(result);
}
