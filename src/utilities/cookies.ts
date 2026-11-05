import type { NextResponse } from "next/server";
import { env } from "@/config/env";

export const REFRESH_COOKIE = "refresh_token";

export function setRefreshCookie(res: NextResponse, rawToken: string, expires: Date): void {
  res.cookies.set(REFRESH_COOKIE, rawToken, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: "strict",
    path: "/api/auth",
    expires,
  });
}

export function clearRefreshCookie(res: NextResponse): void {
  res.cookies.set(REFRESH_COOKIE, "", {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: "strict",
    path: "/api/auth",
    maxAge: 0,
  });
}
