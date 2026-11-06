// sessions + refresh_tokens. Only SHA-256 hashes are ever stored.
import { env } from "@/config/env";
import { prisma } from "@/config/prisma";
import type { RequestMeta } from "@/types/auth";
import type { Session, SessionRevokeReason } from "@/types/dto";
import { iso } from "@/utilities/mappers";
import * as AuditLogModel from "@/models/audit-log.model";

export interface LiveSession {
  id: string;
  userId: string;
}

export type RotateResult =
  | { status: "ok"; userId: string; sessionId: string }
  /** unknown, expired or revoked token, or the user is no longer ACTIVE */
  | { status: "invalid" }
  /** a rotated token was replayed outside the grace window: the session was revoked */
  | { status: "reuse_detected"; userId: string; sessionId: string };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Create a session and its first refresh token in one transaction. expiresAt = now + SESSION_MAX_DAYS. */
export async function createWithRefreshToken(input: {
  userId: string;
  meta: RequestMeta;
  refreshTokenHash: string;
  refreshExpiresAt: Date;
}): Promise<LiveSession> {
  const sessionExpires = new Date(Date.now() + env.SESSION_MAX_DAYS * DAY_MS);
  const session = await prisma.session.create({
    data: {
      userId: input.userId,
      userAgent: input.meta.userAgent?.slice(0, 500) ?? null,
      ipAddress: input.meta.ip?.slice(0, 45) ?? null,
      expiresAt: sessionExpires,
      refreshTokens: {
        create: {
          tokenHash: input.refreshTokenHash,
          // A refresh token can never outlive its session.
          expiresAt: input.refreshExpiresAt < sessionExpires ? input.refreshExpiresAt : sessionExpires,
        },
      },
    },
    select: { id: true, userId: true },
  });
  return session;
}

/**
 * Authentication step 2: the session exists, is not revoked or expired, and its user is ACTIVE and not
 * soft-deleted. null otherwise (the middleware turns that into 401 SESSION_REVOKED).
 */
export async function findLive(sessionId: string): Promise<LiveSession | null> {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return null;
  return prisma.session.findFirst({
    where: {
      id: sessionId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      user: { status: "ACTIVE", deletedAt: null },
    },
    select: { id: true, userId: true },
  });
}

/**
 * Refresh rotation with reuse detection, in ONE transaction:
 * look up by hash; if usedAt is set (outside a ~10 s grace window) revoke the session with
 * REFRESH_REUSE_DETECTED and write audit `auth.refresh_reuse_detected`; otherwise mark the presented
 * token used, insert the new token, set replacedById and bump sessions.lastUsedAt.
 */
export async function rotateRefreshToken(input: {
  tokenHash: string;
  newTokenHash: string;
  newExpiresAt: Date;
  graceSeconds: number;
  meta: RequestMeta;
}): Promise<RotateResult> {
  const now = new Date();
  const outcome = await prisma.$transaction(async (tx): Promise<RotateResult> => {
    const token = await tx.refreshToken.findUnique({
      where: { tokenHash: input.tokenHash },
      include: { session: { include: { user: { select: { status: true, deletedAt: true } } } } },
    });
    if (!token) return { status: "invalid" };
    const { session } = token;
    const userOk = session.user.status === "ACTIVE" && !session.user.deletedAt;

    if (token.usedAt) {
      const withinGrace = now.getTime() - token.usedAt.getTime() <= input.graceSeconds * 1000;
      // Inside the grace window a retried/racing request is not theft: refuse it without killing the session.
      if (withinGrace || session.revokedAt) return { status: "invalid" };
      await tx.session.update({
        where: { id: session.id },
        data: { revokedAt: now, revokedReason: "REFRESH_REUSE_DETECTED" },
      });
      await AuditLogModel.record(
        {
          actorId: session.userId, action: "auth.refresh_reuse_detected", entityType: "session", entityId: session.id,
          outcome: "DENIED", ip: input.meta.ip, userAgent: input.meta.userAgent,
        },
        tx
      );
      return { status: "reuse_detected", userId: session.userId, sessionId: session.id };
    }

    if (token.revokedAt || token.expiresAt <= now || session.revokedAt || session.expiresAt <= now || !userOk) {
      return { status: "invalid" };
    }

    // Claim the token atomically: of two concurrent presentations only one gets count === 1.
    const claimed = await tx.refreshToken.updateMany({
      where: { id: token.id, usedAt: null },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return { status: "invalid" };

    const expiresAt = input.newExpiresAt < session.expiresAt ? input.newExpiresAt : session.expiresAt;
    const next = await tx.refreshToken.create({
      data: { sessionId: session.id, tokenHash: input.newTokenHash, expiresAt },
    });
    await tx.refreshToken.update({ where: { id: token.id }, data: { replacedById: next.id } });
    await tx.session.update({
      where: { id: session.id },
      data: {
        lastUsedAt: now,
        ipAddress: input.meta.ip?.slice(0, 45) ?? session.ipAddress,
        userAgent: input.meta.userAgent?.slice(0, 500) ?? session.userAgent,
      },
    });
    return { status: "ok", userId: session.userId, sessionId: session.id };
  });
  return outcome;
}

/** Revoke the session owning this refresh token. Idempotent. Returns the owner, or null if unknown. */
export async function revokeByRefreshTokenHash(
  tokenHash: string,
  reason: SessionRevokeReason
): Promise<{ userId: string; sessionId: string } | null> {
  const token = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    select: { session: { select: { id: true, userId: true, revokedAt: true } } },
  });
  if (!token) return null;
  const { session } = token;
  if (!session.revokedAt) {
    await prisma.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }
  return { userId: session.userId, sessionId: session.id };
}

export async function revokeAllForUser(userId: string, reason: SessionRevokeReason): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

/** Live (not revoked, not expired) sessions. `current` is true for `currentSessionId`. */
export async function listLiveForUser(userId: string, currentSessionId: string | null): Promise<Session[]> {
  const rows = await prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id, userAgent: r.userAgent, ipAddress: r.ipAddress, createdAt: iso(r.createdAt),
    lastUsedAt: iso(r.lastUsedAt), expiresAt: iso(r.expiresAt), current: r.id === currentSessionId,
  }));
}

/** Revoke one session belonging to `userId`. false when it does not exist or belongs to someone else. */
export async function revokeOwned(sessionId: string, userId: string, reason: SessionRevokeReason): Promise<boolean> {
  const res = await prisma.session.updateMany({
    where: { id: sessionId, userId, revokedAt: null, expiresAt: { gt: new Date() } },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  return res.count === 1;
}
