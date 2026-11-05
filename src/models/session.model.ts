// sessions + refresh_tokens. Only SHA-256 hashes are ever stored.
import type { RequestMeta } from "@/types/auth";
import type { Session, SessionRevokeReason } from "@/types/dto";
import { notImplemented } from "@/utilities/not-implemented";

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

/** Create a session and its first refresh token in one transaction. expiresAt = now + SESSION_MAX_DAYS. */
export async function createWithRefreshToken(_input: {
  userId: string;
  meta: RequestMeta;
  refreshTokenHash: string;
  refreshExpiresAt: Date;
}): Promise<LiveSession> {
  return notImplemented("SessionModel.createWithRefreshToken");
}

/**
 * Authentication step 2: the session exists, is not revoked or expired, and its user is ACTIVE and not
 * soft-deleted. null otherwise (the middleware turns that into 401 SESSION_REVOKED).
 */
export async function findLive(_sessionId: string): Promise<LiveSession | null> {
  return notImplemented("SessionModel.findLive");
}

/**
 * Refresh rotation with reuse detection, in ONE transaction:
 * look up by hash; if usedAt is set (outside a ~10 s grace window) revoke the session with
 * REFRESH_REUSE_DETECTED and write audit `auth.refresh_reuse_detected`; otherwise mark the presented
 * token used, insert the new token, set replacedById and bump sessions.lastUsedAt.
 */
export async function rotateRefreshToken(_input: {
  tokenHash: string;
  newTokenHash: string;
  newExpiresAt: Date;
  graceSeconds: number;
  meta: RequestMeta;
}): Promise<RotateResult> {
  return notImplemented("SessionModel.rotateRefreshToken");
}

/** Revoke the session owning this refresh token. Idempotent. Returns the owner, or null if unknown. */
export async function revokeByRefreshTokenHash(
  _tokenHash: string,
  _reason: SessionRevokeReason
): Promise<{ userId: string; sessionId: string } | null> {
  return notImplemented("SessionModel.revokeByRefreshTokenHash");
}

export async function revokeAllForUser(_userId: string, _reason: SessionRevokeReason): Promise<void> {
  return notImplemented("SessionModel.revokeAllForUser");
}

/** Live (not revoked, not expired) sessions. `current` is true for `currentSessionId`. */
export async function listLiveForUser(_userId: string, _currentSessionId: string | null): Promise<Session[]> {
  return notImplemented("SessionModel.listLiveForUser");
}

/** Revoke one session belonging to `userId`. false when it does not exist or belongs to someone else. */
export async function revokeOwned(_sessionId: string, _userId: string, _reason: SessionRevokeReason): Promise<boolean> {
  return notImplemented("SessionModel.revokeOwned");
}
