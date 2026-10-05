// Single-owner password login. The session cookie holds a hash of APP_PASSWORD,
// so changing the password signs out every device.
export const COOKIE = "hq_session";

// Trimmed so a stray space or newline pasted into Vercel or the login box doesn't lock you out.
export async function hashPassword(pw: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`creeptee-hq:${pw.trim()}`));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sessionValue(): Promise<string | null> {
  const pw = process.env.APP_PASSWORD;
  return pw ? hashPassword(pw) : null;
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
