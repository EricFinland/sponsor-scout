import { NextResponse } from "next/server";

const TABS = new Set(["Search Log", "Outreach Tracker", "Profiles", "Scores"]);

/**
 * Optional Google Sheet logging. When SHEET_WEBHOOK_URL points at the Apps
 * Script in docs/apps-script/Code.gs, rows are appended to the matching tab.
 * Without it this route does nothing and the app works the same.
 */
export async function POST(request: Request) {
  const webhook = process.env.SHEET_WEBHOOK_URL;
  if (!webhook) return new NextResponse(null, { status: 204 });

  let payload: { tab?: string; row?: Record<string, unknown> };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  if (!payload.tab || !TABS.has(payload.tab) || typeof payload.row !== "object" || payload.row === null) {
    return NextResponse.json({ error: "Unknown tab." }, { status: 400 });
  }
  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tab: payload.tab, row: payload.row, secret: process.env.SHEET_WEBHOOK_SECRET ?? "" }),
      redirect: "follow",
    });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "The Sheet did not accept the row." }, { status: 502 });
  }
}
