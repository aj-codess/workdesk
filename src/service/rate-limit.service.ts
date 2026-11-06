// Rate limiting. Fixed-window counters in process memory.
//
// LIMITATION (documented in docs/BACKEND_SETUP.md): counters are per instance. Behind N instances the
// effective limit is N x the configured one. For multi-instance production swap this module's body for Redis
// (INCR + EXPIRE) or enforce limits at the edge; the `consume` signature does not change.
// Per-account protection does not depend on this: login lockout and the forgot-password per-user cap are in the database.
import { env } from "@/config/env";
import type { RateLimitRule } from "@/config/rate-limits";
import { Errors } from "@/utilities/api-error";

interface Bucket {
  count: number;
  resetAt: number;
}

const MAX_BUCKETS = 50_000;
const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function sweep(now: number): void {
  if (now - lastSweep < 30_000 && buckets.size < MAX_BUCKETS) return;
  lastSweep = now;
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  // Hard cap: under a flood of distinct keys drop the oldest entries rather than grow without bound.
  if (buckets.size >= MAX_BUCKETS) {
    let excess = buckets.size - MAX_BUCKETS + 1000;
    for (const k of buckets.keys()) {
      if (excess-- <= 0) break;
      buckets.delete(k);
    }
  }
}

export async function consume(rule: RateLimitRule, identifier: string): Promise<void> {
  if (env.RATE_LIMIT_DISABLED) return;
  const now = Date.now();
  sweep(now);
  const id = `${rule.name}:${identifier}`;
  let bucket = buckets.get(id);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + rule.windowSeconds * 1000 };
    buckets.set(id, bucket);
  }
  bucket.count += 1;
  if (bucket.count > rule.limit) {
    throw Errors.tooManyRequests(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)));
  }
}

/** Test helper. */
export function resetRateLimits(): void {
  buckets.clear();
}
