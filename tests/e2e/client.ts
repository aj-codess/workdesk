// Tiny HTTP client for the e2e tests: bearer token + manual refresh-cookie jar + a private client IP.
export const BASE = process.env.E2E_BASE_URL ?? "http://localhost:4000";
export const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "Workdesk#Demo1";
export const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@workdesk.local";
export const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe-Admin-123";

let ipCounter = Math.floor(Math.random() * 60_000);
/** A unique private address per client, so tests never share a rate-limit bucket (the server reads it from X-Forwarded-For). */
export const nextIp = () => {
  const n = ipCounter++ % 16_000_000;
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
};

export interface Res<T = any> { status: number; body: T; headers: Headers; raw: Response }

export class Client {
  token: string | null = null;
  refreshCookie: string | null = null;
  constructor(public readonly ip = nextIp()) {}

  async req<T = any>(method: string, path: string, opts: { body?: unknown; headers?: Record<string, string>; form?: FormData; auth?: boolean } = {}): Promise<Res<T>> {
    const headers: Record<string, string> = { "x-forwarded-for": this.ip, ...opts.headers };
    if (opts.auth !== false && this.token) headers.authorization = `Bearer ${this.token}`;
    if (this.refreshCookie && path.startsWith("/api/auth")) headers.cookie = `refresh_token=${this.refreshCookie}`;
    let body: BodyInit | undefined;
    if (opts.form) body = opts.form;
    else if (opts.body !== undefined) { body = JSON.stringify(opts.body); headers["content-type"] = "application/json"; }
    const raw = await fetch(BASE + path, { method, headers, body });
    const setCookie = raw.headers.get("set-cookie");
    const m = setCookie && /refresh_token=([^;]*)/.exec(setCookie);
    if (m) this.refreshCookie = m[1] || null;
    const text = await raw.text();
    let parsed: any = text;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* csv or binary */ }
    return { status: raw.status, body: parsed, headers: raw.headers, raw };
  }
  get = <T = any>(p: string, o = {}) => this.req<T>("GET", p, o);
  post = <T = any>(p: string, body?: unknown, o = {}) => this.req<T>("POST", p, { body, ...o });
  put = <T = any>(p: string, body?: unknown, o = {}) => this.req<T>("PUT", p, { body, ...o });
  patch = <T = any>(p: string, body?: unknown, o = {}) => this.req<T>("PATCH", p, { body, ...o });
  del = <T = any>(p: string, o = {}) => this.req<T>("DELETE", p, o);

  async login(email: string, password: string): Promise<Res> {
    const r = await this.post("/api/auth/login", { email, password });
    if (r.status === 200) this.token = r.body.data.accessToken;
    return r;
  }
}

export async function loginAs(email: string, password = DEMO_PASSWORD): Promise<Client> {
  const c = new Client();
  const r = await c.login(email, password);
  if (r.status !== 200) throw new Error(`login failed for ${email}: ${r.status} ${JSON.stringify(r.body)}`);
  return c;
}

export const adminClient = () => loginAs(ADMIN_EMAIL, ADMIN_PASSWORD);
export const uniq = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
