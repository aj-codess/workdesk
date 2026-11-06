// Validated environment. Parsed lazily on first access so `next build` (which imports route modules
// without runtime secrets, e.g. inside a Docker build stage) does not need production values.
import { z } from "zod";

const PLACEHOLDER_SECRET_PREFIX = "change-me";

const bool = z
  .enum(["true", "false"])
  .transform((v) => v === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "is required"),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  /** Comma separated. CORS_ORIGIN (singular) is accepted as a legacy alias. */
  CORS_ORIGINS: z.string().optional(),
  CORS_ORIGIN: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(32, "must be at least 32 characters"),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  SESSION_MAX_DAYS: z.coerce.number().int().positive().default(30),
  COOKIE_SECURE: bool.default("false"),
  UPLOAD_DIR: z.string().default("./storage/uploads"),
  /** Optional SMTP connection string, e.g. smtps://user:pass@smtp.example.com. Unset = log the link (non-production only). */
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default("WorkDesk <no-reply@workdesk.local>"),
  /** Shared secret for /api/internal/housekeeping (cron). Unset = endpoint disabled. */
  CRON_SECRET: z.string().min(24, "must be at least 24 characters").optional(),
  /** Set to "true" behind a trusted reverse proxy so X-Forwarded-For is honoured. */
  TRUST_PROXY: bool.default("false"),
  RATE_LIMIT_DISABLED: bool.default("false"),
});

type Parsed = z.infer<typeof schema>;
export type Env = Omit<Parsed, "CORS_ORIGINS" | "CORS_ORIGIN"> & { CORS_ORIGINS: string[] };

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}`);
  }
  const { CORS_ORIGINS, CORS_ORIGIN, ...rest } = parsed.data;
  const origins = (CORS_ORIGINS ?? CORS_ORIGIN ?? rest.FRONTEND_URL)
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const env: Env = { ...rest, CORS_ORIGINS: origins };

  if (env.NODE_ENV === "production") {
    const problems: string[] = [];
    if (env.JWT_ACCESS_SECRET.startsWith(PLACEHOLDER_SECRET_PREFIX)) problems.push("JWT_ACCESS_SECRET is still the placeholder value");
    if (!env.COOKIE_SECURE) problems.push("COOKIE_SECURE must be true in production");
    if (env.CORS_ORIGINS.some((o) => o === "*")) problems.push("CORS_ORIGINS must not contain *");
    if (env.RATE_LIMIT_DISABLED) problems.push("RATE_LIMIT_DISABLED must not be true in production");
    if (problems.length) throw new Error(`Unsafe production configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  }
  return env;
}

let cached: Env | undefined;

export const env: Env = new Proxy({} as Env, {
  get(_t, prop: string) {
    cached ??= load();
    return cached[prop as keyof Env];
  },
});
