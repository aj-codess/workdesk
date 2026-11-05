import { env } from "@/config/env";
import { RATE_LIMITS } from "@/config/rate-limits";
import { Errors } from "@/utilities/api-error";
import { failure, noContent, success } from "@/utilities/api-response";
import { clearRefreshCookie, REFRESH_COOKIE, setRefreshCookie } from "@/utilities/cookies";
import { assertAllowedOrigin, parseBody, parseParams } from "@/utilities/request";
import * as TokenService from "@/service/token.service";
import * as PasswordService from "@/service/password.service";
import * as MailService from "@/service/mail.service";
import * as RateLimitService from "@/service/rate-limit.service";
import * as UserModel from "@/models/user.model";
import * as SessionModel from "@/models/session.model";
import * as PermissionModel from "@/models/permission.model";
import * as PasswordResetModel from "@/models/password-reset.model";
import * as LoginAttemptModel from "@/models/login-attempt.model";
import * as AuditLogModel from "@/models/audit-log.model";
import * as SettingModel from "@/models/setting.model";
import {
  changePasswordBody, forgotPasswordBody, loginBody, resetPasswordBody, sessionParams,
} from "@/validators/auth.validator";
import type { ProtectedContext, PublicContext } from "@/types/auth";

const DAY_MS = 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const REFRESH_REUSE_GRACE_SECONDS = 10;

/** POST /auth/login */
export async function login({ req, meta }: PublicContext) {
  const body = await parseBody(req, loginBody);

  const user = await UserModel.findCredentialsByEmail(body.email);
  // Runs a dummy verification when the user is unknown, so timing is uniform.
  const passwordOk = await PasswordService.verify(user?.passwordHash ?? null, body.password);

  const locked = !!user?.lockedUntil && user.lockedUntil.getTime() > Date.now();
  const usable = !!user && passwordOk && user.status === "ACTIVE" && !user.deletedAt && !locked;

  if (!usable) {
    const failureReason = !user ? "unknown_email" : !passwordOk ? "bad_password" : locked ? "locked" : "inactive";
    await LoginAttemptModel.record({ email: body.email, ip: meta.ip, success: false, failureReason });
    if (user && user.status === "ACTIVE" && !locked) {
      const [maxFailed, lockoutMinutes] = await Promise.all([
        SettingModel.getValue<number>("auth.max_failed_logins"),
        SettingModel.getValue<number>("auth.lockout_minutes"),
      ]);
      await UserModel.registerFailedLogin(user.id, { maxFailed, lockoutMinutes });
    }
    await AuditLogModel.record({
      actorId: user?.id ?? null, action: "auth.login_failed", entityType: "user", entityId: user?.id ?? null,
      outcome: "FAILURE", after: { email: body.email, reason: failureReason }, ip: meta.ip, userAgent: meta.userAgent,
    });
    throw Errors.invalidCredentials(); // one generic message for every failure case
  }

  const refresh = TokenService.generateOpaqueToken();
  const refreshExpiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS);
  const session = await SessionModel.createWithRefreshToken({
    userId: user.id, meta, refreshTokenHash: refresh.hash, refreshExpiresAt,
  });
  await UserModel.registerSuccessfulLogin(user.id);

  const [authUser, permissions, accessToken] = await Promise.all([
    UserModel.findAuthUser(user.id),
    PermissionModel.getEffectiveKeys(user.id),
    TokenService.signAccessToken({ sub: user.id, sid: session.id }),
  ]);

  await LoginAttemptModel.record({ email: body.email, ip: meta.ip, success: true });
  await AuditLogModel.record({
    actorId: user.id, action: "auth.login", entityType: "session", entityId: session.id,
    ip: meta.ip, userAgent: meta.userAgent,
  });

  const res = success({
    accessToken, tokenType: "Bearer", expiresIn: env.JWT_ACCESS_TTL_SECONDS, user: authUser, permissions,
  });
  setRefreshCookie(res, refresh.raw, refreshExpiresAt);
  return res;
}

/** POST /auth/refresh : rotate the refresh cookie and issue a new access token. */
export async function refresh({ req, meta }: PublicContext) {
  assertAllowedOrigin(req);

  const rawToken = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!rawToken) throw Errors.unauthenticated();

  const next = TokenService.generateOpaqueToken();
  const newExpiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS);
  const result = await SessionModel.rotateRefreshToken({
    tokenHash: TokenService.hashToken(rawToken),
    newTokenHash: next.hash,
    newExpiresAt,
    graceSeconds: REFRESH_REUSE_GRACE_SECONDS,
    meta,
  });

  // These two answer with the cookie cleared, so they are returned instead of thrown.
  if (result.status === "invalid") {
    const res = failure("Authentication required", 401, undefined, "UNAUTHENTICATED");
    clearRefreshCookie(res);
    return res;
  }
  if (result.status === "reuse_detected") {
    const res = failure("Session is no longer valid", 401, undefined, "SESSION_REVOKED");
    clearRefreshCookie(res);
    return res;
  }

  const accessToken = await TokenService.signAccessToken({ sub: result.userId, sid: result.sessionId });
  const res = success({ accessToken, tokenType: "Bearer", expiresIn: env.JWT_ACCESS_TTL_SECONDS });
  setRefreshCookie(res, next.raw, newExpiresAt);
  return res;
}

/** POST /auth/logout : idempotent, works with an expired access token. */
export async function logout({ req, meta }: PublicContext) {
  assertAllowedOrigin(req);

  const rawToken = req.cookies.get(REFRESH_COOKIE)?.value;
  if (rawToken) {
    const owner = await SessionModel.revokeByRefreshTokenHash(TokenService.hashToken(rawToken), "LOGOUT");
    if (owner) {
      await AuditLogModel.record({
        actorId: owner.userId, action: "auth.logout", entityType: "session", entityId: owner.sessionId,
        ip: meta.ip, userAgent: meta.userAgent,
      });
    }
  }
  const res = noContent();
  clearRefreshCookie(res);
  return res;
}

/** POST /auth/logout-all */
export async function logoutAll({ auth }: ProtectedContext) {
  await SessionModel.revokeAllForUser(auth.userId, "LOGOUT_ALL");
  await AuditLogModel.record({
    actorId: auth.userId, action: "auth.logout_all", entityType: "user", entityId: auth.userId,
    ip: auth.ip, userAgent: auth.userAgent,
  });
  const res = noContent();
  clearRefreshCookie(res);
  return res;
}

/** GET /auth/me */
export async function me({ auth }: ProtectedContext) {
  const user = await UserModel.findAuthUser(auth.userId);
  if (!user) throw Errors.sessionRevoked();
  return success({ user, permissions: auth.permissions });
}

/** POST /auth/change-password */
export async function changePassword({ req, auth }: ProtectedContext) {
  const body = await parseBody(req, changePasswordBody);

  const user = await UserModel.findCredentialsById(auth.userId);
  if (!user) throw Errors.sessionRevoked();
  if (!(await PasswordService.verify(user.passwordHash, body.currentPassword))) {
    throw Errors.invalidCurrentPassword();
  }

  await UserModel.changePassword(auth.userId, await PasswordService.hash(body.newPassword));
  await SessionModel.revokeAllForUser(auth.userId, "PASSWORD_CHANGED");
  await AuditLogModel.record({
    actorId: auth.userId, action: "auth.password_changed", entityType: "user", entityId: auth.userId,
    ip: auth.ip, userAgent: auth.userAgent,
  });

  const res = noContent();
  clearRefreshCookie(res);
  return res;
}

/** POST /auth/forgot-password : always 202, whether or not the email exists. */
export async function forgotPassword({ req, meta }: PublicContext) {
  const body = await parseBody(req, forgotPasswordBody);
  // 3 / 15 min per IP (route wrapper) AND per email (here).
  await RateLimitService.consume(RATE_LIMITS.forgotPassword, `email:${body.email}`);

  const user = await UserModel.findCredentialsByEmail(body.email);
  if (user && user.status === "ACTIVE" && !user.deletedAt) {
    const token = TokenService.generateOpaqueToken();
    await PasswordResetModel.create({
      userId: user.id, tokenHash: token.hash,
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS), requestedIp: meta.ip,
    });
    await MailService.sendPasswordReset({
      to: user.email, firstName: user.firstName,
      resetUrl: `${env.FRONTEND_URL}/reset-password?token=${token.raw}`,
    });
    await AuditLogModel.record({
      actorId: user.id, action: "auth.password_reset_requested", entityType: "user", entityId: user.id,
      ip: meta.ip, userAgent: meta.userAgent,
    });
  }

  return success({ message: "If the account exists, a reset link has been sent." }, { status: 202 });
}

/** POST /auth/reset-password */
export async function resetPassword({ req, meta }: PublicContext) {
  const body = await parseBody(req, resetPasswordBody);

  const token = await PasswordResetModel.findValidByHash(TokenService.hashToken(body.token));
  // One generic message for invalid, expired and used tokens.
  if (!token) throw Errors.validation("Invalid or expired reset token");

  await PasswordResetModel.consume({
    tokenId: token.id, userId: token.userId, passwordHash: await PasswordService.hash(body.newPassword),
  });
  await SessionModel.revokeAllForUser(token.userId, "PASSWORD_RESET");
  await AuditLogModel.record({
    actorId: token.userId, action: "auth.password_reset_completed", entityType: "user", entityId: token.userId,
    ip: meta.ip, userAgent: meta.userAgent,
  });

  return noContent();
}

/** GET /auth/sessions */
export async function listSessions({ auth }: ProtectedContext) {
  return success(await SessionModel.listLiveForUser(auth.userId, auth.sessionId));
}

/** DELETE /auth/sessions/:sessionId : only the caller's own sessions; anyone else's id is a 404. */
export async function revokeSession({ params, auth }: ProtectedContext<{ sessionId: string }>) {
  const { sessionId } = parseParams(params, sessionParams);
  if (!(await SessionModel.revokeOwned(sessionId, auth.userId, "LOGOUT"))) throw Errors.notFound("Session");
  return noContent();
}
