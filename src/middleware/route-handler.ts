import type { NextRequest } from "next/server";
import { RATE_LIMITS, type RateLimitRule } from "@/config/rate-limits";
import { ApiError, Errors } from "@/utilities/api-error";
import { satisfies } from "@/utilities/authorization";
import { handleError } from "@/utilities/handle-error";
import { logger } from "@/utilities/logger";
import { getRequestMeta } from "@/utilities/request";
import { authenticate } from "@/middleware/authenticate";
import * as RateLimitService from "@/service/rate-limit.service";
import * as AuditLogModel from "@/models/audit-log.model";
import type { AuthContext, PermissionRequirement, ProtectedContext, PublicContext } from "@/types/auth";

type Params = Record<string, string>;
type RouteContext<P> = { params: Promise<P> };
type RouteHandler<P> = (req: NextRequest, ctx: RouteContext<P>) => Promise<Response>;

/**
 * Wraps a controller for a PUBLIC route (login, refresh, health, ...).
 * Applies the rate limit, then runs the controller, and turns any thrown error into the error envelope.
 */
export function publicRoute<P extends Params = Params>(
  options: { rateLimit?: RateLimitRule },
  controller: (ctx: PublicContext<P>) => Promise<Response>
): RouteHandler<P> {
  return async (req, ctx) => {
    try {
      const meta = getRequestMeta(req);
      const rule = options.rateLimit ?? RATE_LIMITS.default;
      await RateLimitService.consume(rule, meta.ip ?? "unknown");
      const params = (await ctx.params) ?? ({} as P);
      return await controller({ req, params, meta });
    } catch (error) {
      return handleError(error);
    }
  };
}

/**
 * Wraps a controller for a PROTECTED route. Guard order (docs section 0):
 *   rate limit -> authenticate (JWT + live session + active user) -> permission -> controller
 * Record scope, state machine and audit are enforced further down, in the models.
 * Any 403 raised here or in the controller is written to audit_logs as outcome = DENIED.
 */
export function protectedRoute<P extends Params = Params>(
  options: { permissions?: PermissionRequirement; rateLimit?: RateLimitRule },
  controller: (ctx: ProtectedContext<P>) => Promise<Response>
): RouteHandler<P> {
  return async (req, ctx) => {
    let auth: AuthContext | null = null;
    try {
      const rule = options.rateLimit ?? RATE_LIMITS.default;
      if (rule.by === "ip") await RateLimitService.consume(rule, getRequestMeta(req).ip ?? "unknown");

      auth = await authenticate(req);

      if (rule.by === "user") await RateLimitService.consume(rule, auth.userId);

      if (options.permissions && !satisfies(auth, options.permissions)) throw Errors.forbidden();

      const params = (await ctx.params) ?? ({} as P);
      return await controller({ req, params, auth });
    } catch (error) {
      if (auth && error instanceof ApiError && (error.code === "FORBIDDEN" || error.code === "PRIVILEGE_ESCALATION")) {
        await auditDenied(req, auth);
      }
      return handleError(error);
    }
  };
}

async function auditDenied(req: NextRequest, auth: AuthContext): Promise<void> {
  try {
    await AuditLogModel.record({
      actorId: auth.userId,
      action: "access.denied",
      outcome: "DENIED",
      after: { route: `${req.method} ${req.nextUrl.pathname}` },
      ip: auth.ip,
      userAgent: auth.userAgent,
    });
  } catch (e) {
    // Never let a failed audit write change the response the caller gets.
    logger.error(`[AUDIT] could not record denied access: ${e}`);
  }
}
