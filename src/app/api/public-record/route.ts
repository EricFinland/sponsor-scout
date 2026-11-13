import { NextResponse } from "next/server";
import { findPublicRecord } from "@/lib/public-record";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const name = params.get("name")?.trim() ?? "";
  const domain = params.get("domain")?.trim() ?? "";
  if (name.length < 2 || name.length > 80 || domain.length > 120) {
    return NextResponse.json({ error: "Enter a company name." }, { status: 400 });
  }
  try {
    const record = await findPublicRecord(name, domain);
    return NextResponse.json(
      { record },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
    );
  } catch {
    return NextResponse.json({ error: "Wikidata did not respond. Try again later." }, { status: 502 });
  }
}
