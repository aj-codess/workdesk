// External-module work: JWT signing/verification and opaque token generation + hashing.
// No database calls here (session lookups live in models/session.model.ts).
import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify, errors as joseErrors } from "jose";
import { env } from "@/config/env";
import { Errors } from "@/utilities/api-error";

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

const ALG = "HS256";
const ISSUER = "workdesk";
const AUDIENCE = "workdesk-api";

let keyCache: { secret: string; key: Uint8Array } | undefined;
function key(): Uint8Array {
  const secret = env.JWT_ACCESS_SECRET;
  if (keyCache?.secret !== secret) keyCache = { secret, key: new TextEncoder().encode(secret) };
  return keyCache.key;
}

/** Sign a short-lived access JWT (env.JWT_ACCESS_SECRET, env.JWT_ACCESS_TTL_SECONDS). No permissions inside. */
export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  return new SignJWT({ sid: claims.sid })
    .setProtectedHeader({ alg: ALG, typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_ACCESS_TTL_SECONDS}s`)
    .sign(key());
}

/** Verify signature and expiry. Throw Errors.tokenExpired() or Errors.unauthenticated(). */
export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  try {
    const { payload } = await jwtVerify(token, key(), {
      algorithms: [ALG],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (typeof payload.sub !== "string" || typeof payload.sid !== "string") throw Errors.unauthenticated();
    return { sub: payload.sub, sid: payload.sid };
  } catch (error) {
    if (error instanceof joseErrors.JWTExpired) throw Errors.tokenExpired();
    if (error && typeof error === "object" && "statusCode" in error) throw error; // already an ApiError
    throw Errors.unauthenticated();
  }
}

/** 256-bit random token (64 hex chars, matching resetPasswordBody) plus its SHA-256 hash. */
export function generateOpaqueToken(): GeneratedToken {
  const raw = randomBytes(32).toString("hex");
  return { raw, hash: hashToken(raw) };
}

/** Hex SHA-256 of a raw token, to look it up by hash. */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
