// Rate limit table from docs/API_ROUTES.md section 0. Enforced by RateLimitService.
export interface RateLimitRule {
  name: string;
  limit: number;
  windowSeconds: number;
  /** What the counter is keyed on. */
  by: "ip" | "user";
}

export const RATE_LIMITS = {
  default: { name: "default", limit: 300, windowSeconds: 60, by: "ip" },
  login: { name: "auth.login", limit: 10, windowSeconds: 60, by: "ip" },
  refresh: { name: "auth.refresh", limit: 30, windowSeconds: 60, by: "ip" },
  forgotPassword: { name: "auth.forgot-password", limit: 3, windowSeconds: 15 * 60, by: "ip" },
  resetPassword: { name: "auth.reset-password", limit: 5, windowSeconds: 15 * 60, by: "ip" },
  reportExport: { name: "reports.export", limit: 5, windowSeconds: 60, by: "user" },
} as const satisfies Record<string, RateLimitRule>;
