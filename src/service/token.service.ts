// External-module work: JWT signing/verification and opaque token generation + hashing.
// No database calls here (session lookups live in models/session.model.ts).
import { notImplemented } from "@/utilities/not-implemented";

export interface AccessTokenClaims {
  /** user id */
  sub: string;
  /** session id */
  sid: string;
}

export interface GeneratedToken {
  /** Sent to the client (cookie or email link). Never stored. */
  raw: string;
  /** Hex SHA-256 of `raw`. This is what the database stores. */
  hash: string;
}

/** Sign a short-lived access JWT (env.JWT_ACCESS_SECRET, env.JWT_ACCESS_TTL_SECONDS). No permissions inside. */
export async function signAccessToken(_claims: AccessTokenClaims): Promise<string> {
  return notImplemented("TokenService.signAccessToken");
}

/** Verify signature and expiry. Throw Errors.tokenExpired() or Errors.unauthenticated(). */
export async function verifyAccessToken(_token: string): Promise<AccessTokenClaims> {
  return notImplemented("TokenService.verifyAccessToken");
}

/** 256-bit random token plus its SHA-256 hash (refresh tokens, password-reset tokens). */
export function generateOpaqueToken(): GeneratedToken {
  return notImplemented("TokenService.generateOpaqueToken");
}

/** Hex SHA-256 of a raw token, to look it up by hash. */
export function hashToken(_raw: string): string {
  return notImplemented("TokenService.hashToken");
}
