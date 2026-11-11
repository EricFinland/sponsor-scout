import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sameOrigin, SESSION_COOKIE, verifySession } from "@/lib/auth";
import { DEFAULT_CONFIG } from "@/lib/data";
import { readSheet, scoreRows, sheetConfigured, sheetRequest } from "@/lib/sheets";
import { validateOperations } from "@/lib/mutations";
import { configFromRows } from "@/lib/sheet-data";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!sheetConfigured()) return NextResponse.json({ error: "Shared storage is not configured." }, { status: 503 });
  if (!verifySession((await cookies()).get(SESSION_COOKIE)?.value)) return NextResponse.json({ error: "Sign in to save shared data." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (Number(request.headers.get("content-length")) > 1_000_000) return NextResponse.json({ error: "This change is too large." }, { status: 413 });
  try {
    const text = await request.text(); if (text.length > 1_000_000) return NextResponse.json({ error: "This change is too large." }, { status: 413 });
    const body = JSON.parse(text);
    if (body.action === "refreshScores") {
      const data = await readSheet(DEFAULT_CONFIG);
      const scored = scoreRows(data, new Date().getFullYear());
      await sheetRequest("scores", scored);
      return NextResponse.json({ ok: true, count: scored.rows.length, scoredAt: scored.rows[0]?.scoredAt }, { headers: { "Cache-Control": "no-store" } });
    }
    const operations = validateOperations(body.operations);
    if (operations.some((op) => op.tab === "Weights")) {
      const data = await readSheet(DEFAULT_CONFIG);
      const next = new Map((data.tables.Weights ?? []).map((r) => [String(r.id), r]));
      for (const op of operations.filter((op) => op.tab === "Weights")) if (op.row) next.set(op.key, op.row);
      configFromRows([...next.values()], DEFAULT_CONFIG);
    }
    const result = await sheetRequest<{ versions: Record<string, string> }>("mutate", { operations });
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The shared save failed.";
    return NextResponse.json({ error: message }, { status: /conflict|changed by another/i.test(message) ? 409 : 400 });
  }
}
