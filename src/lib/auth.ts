import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "sponsor-scout-team";
const HOURS = 8 * 60 * 60;
export function validAccessKey(candidate: string): boolean {
  const expected = process.env.TEAM_ACCESS_KEY ?? "";
  if (expected.length < 24) return false;
  const a = createHmac("sha256", expected).update(candidate).digest();
  const b = createHmac("sha256", expected).update(expected).digest();
  return timingSafeEqual(a, b);
}
export function createSession(now = Date.now()): string {
  const expiry = String(Math.floor(now / 1000) + HOURS);
  const signature = createHmac("sha256", process.env.TEAM_ACCESS_KEY ?? "").update(`team:${expiry}`).digest("hex");
  return `${expiry}.${signature}`;
}
export function verifySession(value: string | undefined, now = Date.now()): boolean {
  if (!value || (process.env.TEAM_ACCESS_KEY ?? "").length < 24) return false;
  const [expiry, signature, extra] = value.split(".");
  if (extra || !/^\d+$/.test(expiry ?? "") || !/^[a-f0-9]{64}$/.test(signature ?? "")) return false;
  const remaining = Number(expiry) - Math.floor(now / 1000);
  if (remaining <= 0 || remaining > HOURS) return false;
  const expected = createHmac("sha256", process.env.TEAM_ACCESS_KEY!).update(`team:${expiry}`).digest("hex");
  return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
}
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  // Next may normalize the internal URL to localhost. The incoming Host still
  // identifies the site the browser requested, including its port.
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  return origin === `${url.protocol}//${host}`;
}
