import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { canReadWorkspace, canWriteWorkspace, sameOrigin, SESSION_COOKIE } from "@/lib/auth";
import { DEFAULT_CONFIG } from "@/lib/data";
import { readSheet, scoreRows, sheetConfigured, sheetRequest } from "@/lib/sheets";
import { validateOperations, withoutColumns } from "@/lib/mutations";
import { PROFILE_FIT_COLUMNS } from "@/lib/sheet-schema";
import { configFromRows } from "@/lib/sheet-data";
import { invalidateSheetData } from "@/lib/shared-data";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!sheetConfigured()) return NextResponse.json({ error: "Shared storage is not configured." }, { status: 503 });
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!canReadWorkspace(session)) return NextResponse.json({ error: "Sign in to save shared data." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (Number(request.headers.get("content-length")) > 1_000_000) return NextResponse.json({ error: "This change is too large." }, { status: 413 });
  try {
    const text = await request.text(); if (text.length > 1_000_000) return NextResponse.json({ error: "This change is too large." }, { status: 413 });
    const body = JSON.parse(text);
    if (body.action === "refreshData") {
      await sheetRequest("refresh");
      invalidateSheetData();
      return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    }
    if (!canWriteWorkspace(session)) return NextResponse.json({ error: "This workspace is view-only. Edit the private Google Sheet directly." }, { status: 403 });
    if (body.action === "refreshScores") {
      const data = await readSheet(DEFAULT_CONFIG);
      const scored = scoreRows(data, new Date().getFullYear());
      await sheetRequest("scores", scored);
      return NextResponse.json({ ok: true, count: scored.rows.length, scoredAt: scored.rows[0]?.scoredAt }, { headers: { "Cache-Control": "no-store" } });
    }
    const operations = validateOperations(body.operations);
    if (operations.some((op) => op.tab === "Weights")) {
      const data = await sheetRequest<import("@/lib/sheet-schema").SheetTables>("read", { tabs: ["Weights"] });
      const next = new Map((data.Weights ?? []).map((r) => [String(r.id), r]));
      for (const op of operations.filter((op) => op.tab === "Weights")) if (op.row) next.set(op.key, op.row);
      configFromRows([...next.values()], DEFAULT_CONFIG);
    }
    let result: { versions: Record<string, string> };
    let warning: string | undefined;
    try {
      result = await sheetRequest<{ versions: Record<string, string> }>("mutate", { operations });
    } catch (error) {
      // Workbooks created before the sponsor-fit fields lack their Profiles columns.
      // The Apps Script checks every change before writing, so nothing was saved; retry without them.
      const missing = /Unknown or protected column: (\w+)/.exec(error instanceof Error ? error.message : "")?.[1];
      if (!missing || !(PROFILE_FIT_COLUMNS as readonly string[]).includes(missing)) throw error;
      result = await sheetRequest<{ versions: Record<string, string> }>("mutate", {
        operations: withoutColumns(operations, "Profiles", PROFILE_FIT_COLUMNS),
      });
      warning = "Saved, except nonprofit history, CSR and ethics notes: the team Sheet's Profiles tab has no columns for them yet. " +
        "Redeploy the Apps Script from docs/apps-script/Code.gs and it adds them on the next save.";
    }
    invalidateSheetData(operations.map((op) => op.tab));
    return NextResponse.json({ ok: true, ...result, warning }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The shared save failed.";
    return NextResponse.json({ error: message }, { status: /conflict|changed by another/i.test(message) ? 409 : 400 });
  }
}
