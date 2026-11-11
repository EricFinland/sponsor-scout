import { NextResponse } from "next/server";

/**
 * Optional work-email lookup through Hunter.io. Off unless HUNTER_API_KEY is
 * set. Each lookup spends one credit from Hunter's free monthly allowance, so
 * it only ever runs when someone presses the button.
 */
export async function GET(request: Request) {
  const key = process.env.HUNTER_API_KEY;
  if (!key) return NextResponse.json({ error: "Email lookup is not set up." }, { status: 501 });

  const params = new URL(request.url).searchParams;
  const domain = params.get("domain")?.trim() ?? "";
  const first = params.get("first")?.trim() ?? "";
  const last = params.get("last")?.trim() ?? "";
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain) || !first || !last) {
    return NextResponse.json({ error: "A company domain and a full name are needed." }, { status: 400 });
  }

  const url = new URL("https://api.hunter.io/v2/email-finder");
  url.searchParams.set("domain", domain);
  url.searchParams.set("first_name", first);
  url.searchParams.set("last_name", last);
  try {
    const response = await fetch(url, { headers: { "X-API-KEY": key }, cache: "no-store" });
    const body = (await response.json()) as {
      data?: { email?: string | null; score?: number | null };
      errors?: { details?: string }[];
    };
    if (!response.ok) {
      return NextResponse.json(
        { error: body.errors?.[0]?.details ?? "Hunter could not complete the lookup." },
        { status: 502 },
      );
    }
    return NextResponse.json({ email: body.data?.email ?? null, score: body.data?.score ?? null });
  } catch {
    return NextResponse.json({ error: "Hunter did not respond." }, { status: 502 });
  }
}
