import { NextResponse } from "next/server";
import { createSession, publicWorkspace, sameOrigin, SESSION_COOKIE, validAccessKey } from "@/lib/auth";

const attempts = new Map<string, { count: number; until: number }>();
export async function POST(request: Request) {
  if (publicWorkspace()) return NextResponse.json({ error: "Sign-in is not enabled for this workspace." }, { status: 410 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const attempt = attempts.get(ip);
  if (attempt && attempt.until > Date.now() && attempt.count >= 5) return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
  let key = "";
  try { const body = await request.json(); if (typeof body.key === "string" && body.key.length <= 512) key = body.key; } catch { /* invalid credentials */ }
  if (!validAccessKey(key)) {
    if (attempts.size > 1000) for (const [k, v] of attempts) if (v.until <= Date.now()) attempts.delete(k);
    attempts.set(ip, { count: attempt && attempt.until > Date.now() ? attempt.count + 1 : 1, until: Date.now() + 15 * 60 * 1000 });
    return NextResponse.json({ error: "That team access key was not accepted." }, { status: 401 });
  }
  attempts.delete(ip);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, createSession(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 8 * 60 * 60 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
