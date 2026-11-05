import type { NextRequest } from "next/server";
import type { ZodTypeAny, z } from "zod";
import { env } from "@/config/env";
import { Errors } from "@/utilities/api-error";
import type { RequestMeta } from "@/types/auth";

export function getRequestMeta(req: NextRequest): RequestMeta {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ip: forwarded || req.headers.get("x-real-ip") || null,
    userAgent: req.headers.get("user-agent"),
  };
}

export function getBearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

/** Parse and validate a JSON body. Unknown fields are rejected by the schemas (.strict()). */
export async function parseBody<S extends ZodTypeAny>(req: NextRequest, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw Errors.validation("Request body must be valid JSON");
  }
  return schema.parse(raw);
}

/** For routes whose body is optional (e.g. POST /users/:id/activate): empty body = {}. */
export async function parseOptionalBody<S extends ZodTypeAny>(req: NextRequest, schema: S): Promise<z.infer<S>> {
  const text = await req.text();
  if (!text.trim()) return schema.parse({});
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw Errors.validation("Request body must be valid JSON");
  }
  return schema.parse(raw);
}

export function parseQuery<S extends ZodTypeAny>(req: NextRequest, schema: S): z.infer<S> {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams));
}

export function parseParams<S extends ZodTypeAny>(params: unknown, schema: S): z.infer<S> {
  return schema.parse(params);
}

/** CSRF defence in depth for /auth/refresh and /auth/logout (docs section 5.2). */
export function assertAllowedOrigin(req: NextRequest): void {
  const origin = req.headers.get("origin");
  // Same-site requests may omit Origin; when it is present it must be on the allow-list.
  if (origin && !env.CORS_ORIGINS.includes(origin)) {
    throw Errors.forbidden("Origin not allowed");
  }
}
