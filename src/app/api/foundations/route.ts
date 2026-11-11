import { NextResponse } from "next/server";
import { isExistingPartner } from "@/lib/data";
import { searchFoundations } from "@/lib/propublica";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 80) {
    return NextResponse.json({ error: "Enter a company name." }, { status: 400 });
  }
  try {
    const candidates = await searchFoundations(query);
    return NextResponse.json(
      { candidates, alreadyPartner: isExistingPartner(query) },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
    );
  } catch {
    return NextResponse.json(
      { error: "ProPublica's nonprofit search did not respond. Try again in a minute." },
      { status: 502 },
    );
  }
}
