import type { NextRequest } from "next/server";
import type { PermissionKey } from "@/config/permissions";

/** Who and where a request came from. Available on every route, public or not. */
export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

/** Built by middleware/authenticate.ts for every protected route. */
export interface AuthContext extends RequestMeta {
  userId: string;
  /** "sid" claim of the access token = sessions.id */
  sessionId: string;
  /** Effective permission keys, resolved from the database on this request. */
  permissions: string[];
}

export interface ProtectedContext<P = Record<string, string>> {
  req: NextRequest;
  params: P;
  auth: AuthContext;
}

export interface PublicContext<P = Record<string, string>> {
  req: NextRequest;
  params: P;
  meta: RequestMeta;
}

export type PermissionRequirement = {
  /** Caller must hold every one of these. */
  all?: PermissionKey[];
  /** Caller must hold at least one of these. */
  any?: PermissionKey[];
};
