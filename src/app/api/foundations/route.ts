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
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { candidates: [], alreadyPartner: isExistingPartner(query), warning: "ProPublica's nonprofit search did not respond. Retry later or continue with company data; foundation status remains unverified." },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
