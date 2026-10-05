// Shared helpers: per-source result type, env checks, a small in-memory cache, and store-timezone dates.

export type Source<T> =
  | { state: "off"; missing: string[] }
  | { state: "ok"; data: T }
  | { state: "error"; message: string };

export function missingEnv(names: string[]): string[] {
  return names.filter((n) => !process.env[n]);
}

export async function run<T>(required: string[], fn: () => Promise<T>): Promise<Source<T>> {
  const missing = missingEnv(required);
  if (missing.length) return { state: "off", missing };
  try {
    return { state: "ok", data: await fn() };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Also log it, so failures show up in Vercel → Logs, not only on the page.
    console.error(`[source error] ${message}`);
    return { state: "error", message };
  }
}

// API responses are cached per server instance for a few minutes so page loads stay fast
// and we stay well under each platform's rate limits. `fresh` skips the cache (Refresh button).
const memo = new Map<string, { at: number; value: unknown }>();
export async function cached<T>(key: string, ttlMs: number, fresh: boolean, fn: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (!fresh && hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await fn();
  memo.set(key, { at: Date.now(), value });
  return value;
}

export async function getJson(url: string, init: RequestInit, label: string): Promise<any> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    const detail = body?.error?.message || body?.errors?.[0]?.message || body?.message || body?.errors || text.slice(0, 200);
    throw new Error(`${label} ${res.status}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  }
  return body;
}

export const TZ = process.env.STORE_TIMEZONE || "America/Los_Angeles";
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** YYYY-MM-DD for a moment, in the store's timezone. */
export function dayKey(d: Date): string {
  return dayFmt.format(d);
}

/** The last `n` calendar days ending today (store timezone), oldest first. */
export function lastDays(n: number, endOffset = 0): string[] {
  const out: string[] = [];
  const now = Date.now();
  for (let i = n - 1 + endOffset; i >= endOffset; i--) out.push(dayKey(new Date(now - i * 86400000)));
  return out;
}

export const RANGES = [7, 14, 30] as const;
export type Range = (typeof RANGES)[number];

export const num = (v: unknown): number => {
  const x = parseFloat(String(v ?? ""));
  return Number.isFinite(x) ? x : 0;
};
