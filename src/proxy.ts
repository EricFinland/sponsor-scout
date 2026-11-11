import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "./lib/auth";

/** Shared Sheets contain private history and notes. Every shared-mode route requires a team session. */
export function proxy(request: NextRequest) {
  if (!process.env.SHEET_WEBHOOK_URL) return NextResponse.next();
  const path = request.nextUrl.pathname;
  if (path === "/login" || path.startsWith("/api/auth/")) return NextResponse.next();
  if ((process.env.TEAM_ACCESS_KEY ?? "").length < 24) {
    return new NextResponse("Team access is not configured. Set TEAM_ACCESS_KEY before enabling shared Google Sheets storage.", { status: 503 });
  }
  if (verifySession(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (path.startsWith("/api/")) return NextResponse.json({ error: "Sign in to the team workspace to continue." }, { status: 401 });
  const url = new URL("/login", request.url);
  url.searchParams.set("next", path + request.nextUrl.search);
  return NextResponse.redirect(url);
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
