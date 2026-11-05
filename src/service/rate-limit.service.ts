// External-module work: rate limiting (in-memory, Redis, or an edge provider).
// Rules live in config/rate-limits.ts. When the limit is exceeded, throw Errors.tooManyRequests(retryAfterSeconds)
// (the response should carry a Retry-After header).
//
// TODO: write this. It is a deliberate pass-through for now (not a 501) because the route wrapper calls it on
// every request, so a throwing stub would block every route, including the ones you have already implemented.
import type { RateLimitRule } from "@/config/rate-limits";

export async function consume(_rule: RateLimitRule, _identifier: string): Promise<void> {
  // no-op until implemented
}
