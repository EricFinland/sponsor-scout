import { NextResponse } from "next/server";
/** Retired append-only route. Shared changes use the authenticated workspace API. */
export async function POST() { return NextResponse.json({ error: "Use the shared workspace save flow." }, { status: 410 }); }
