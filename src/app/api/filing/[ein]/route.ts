import { NextResponse } from "next/server";
import { fetchFiling } from "@/lib/propublica";

export const maxDuration = 30;

export async function GET(request: Request, context: { params: Promise<{ ein: string }> }) {
  const { ein } = await context.params;
  if (!/^\d{9}$/.test(ein)) {
    return NextResponse.json({ error: "An EIN is nine digits." }, { status: 400 });
  }
  const company = new URL(request.url).searchParams.get("company")?.slice(0, 80) ?? undefined;
  try {
    const filing = await fetchFiling(ein, company);
    if (!filing) return NextResponse.json({ error: "No filings found for that EIN." }, { status: 404 });
    return NextResponse.json(
      { filing },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
    );
  } catch {
    return NextResponse.json(
      { error: "The filing could not be loaded from ProPublica. Try again in a minute." },
      { status: 502 },
    );
  }
}
