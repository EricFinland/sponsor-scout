import { NextResponse } from "next/server";
import { PROVIDERS, type CompanyProvider } from "@/lib/company-evidence";
import {
  publicCompanyRecord,
  searchPublicCompanies,
} from "@/lib/public-company-data";

export const maxDuration = 60;
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const provider = params.get("provider") as CompanyProvider;
  const id = params.get("id"),
    q = params.get("q")?.trim() ?? "";
  if (!PROVIDERS.includes(provider))
    return NextResponse.json(
      { error: "Choose a supported company data source." },
      { status: 400 },
    );
  if (
    id
      ? !(provider === "wikidata"
          ? /^Q[1-9]\d{0,11}$/.test(id)
          : provider === "sec"
            ? /^\d{10}$/.test(id)
            : /^[A-Z0-9]{20}$/.test(id))
      : q.length < 2 || q.length > 80
  )
    return NextResponse.json(
      { error: "Enter a valid company name or identifier." },
      { status: 400 },
    );
  try {
    const data = id
      ? { record: await publicCompanyRecord(provider, id) }
      : { candidates: await searchPublicCompanies(provider, q) };
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      {
        error: `${provider === "sec" ? "SEC EDGAR" : provider === "gleif" ? "GLEIF" : "Wikidata"} did not return usable data. Retry this source or continue with the others.`,
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
