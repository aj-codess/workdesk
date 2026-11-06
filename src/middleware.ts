// Edge middleware: CORS for the separate frontend origin. Everything else (auth, permissions) lives in the route wrappers.
// The refresh cookie is SameSite=Strict, so the frontend must be same-SITE (e.g. app.example.com + api.example.com)
// for the browser to send it; CORS with credentials is still required because the origins differ.
import { NextResponse, type NextRequest } from "next/server";

function allowedOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS ?? process.env.CORS_ORIGIN ?? process.env.FRONTEND_URL ?? "http://localhost:3000";
  return raw.split(",").map((o) => o.trim().replace(/\/$/, "")).filter((o) => o && o !== "*");
}

export function middleware(req: NextRequest) {
  const origin = req.headers.get("origin");
  const allowed = !!origin && allowedOrigins().includes(origin);

  if (req.method === "OPTIONS") {
    const res = new NextResponse(null, { status: allowed ? 204 : 403 });
    if (allowed) {
      res.headers.set("Access-Control-Allow-Origin", origin!);
      res.headers.set("Access-Control-Allow-Credentials", "true");
      res.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      res.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.headers.set("Access-Control-Max-Age", "600");
      res.headers.append("Vary", "Origin");
    }
    return res;
  }

  const res = NextResponse.next();
  if (allowed) {
    res.headers.set("Access-Control-Allow-Origin", origin!);
    res.headers.set("Access-Control-Allow-Credentials", "true");
    res.headers.set("Access-Control-Expose-Headers", "Content-Disposition, Retry-After");
  }
  res.headers.append("Vary", "Origin");
  return res;
}

export const config = { matcher: "/api/:path*" };
