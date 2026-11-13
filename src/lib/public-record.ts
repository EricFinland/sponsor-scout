import type { Research } from "./types";

/**
 * Company headquarters from Wikidata, a free public knowledge base with no key.
 * The result is a suggestion: a researcher confirms it before it counts toward
 * the score, the same way a person confirms a foundation match.
 */

const SEARCH = "https://www.wikidata.org/w/api.php";
const SPARQL = "https://query.wikidata.org/sparql";
const USER_AGENT = "SponsorScout/1.0 (nonprofit sponsor research)";
const DAY = 60 * 60 * 24;

/** Los Angeles County and the four neighboring counties the LA rules recognize. */
export const COUNTIES: Record<string, string> = {
  Q104994: "Los Angeles",
  Q5925: "Orange",
  Q108127: "Ventura",
  Q108111: "Riverside",
  Q108053: "San Bernardino",
};

export interface Candidate {
  id: string;
  label: string;
  description: string;
}

export interface SparqlRow {
  item: string;
  site?: string;
  hqLabel?: string;
  county?: string;
}

export interface PublicRecord {
  qid: string;
  label: string;
  description: string;
  url: string;
  website: string | null;
  hqCity: string | null;
  /** Set only when the headquarters sits in LA County or a neighboring county. */
  county: string | null;
  /** "website" when the record's official site matches the company's domain. */
  matchedBy: "website" | "name";
}

export function hostOf(url: string): string {
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function sameSite(site: string, domain: string): boolean {
  const a = hostOf(site);
  const b = hostOf(domain);
  if (!a || !b) return false;
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

/**
 * Picks the record for the company from Wikidata's name matches. Only candidates
 * with a listed headquarters or industry (companies, not places) reach `rows`. A match on the company's
 * own web domain wins; otherwise the best-ranked organization is used.
 */
export function pickRecord(candidates: Candidate[], rows: SparqlRow[], domain: string): PublicRecord | null {
  const byItem = new Map<string, { sites: Set<string>; hqs: { city: string; county: string | null }[] }>();
  for (const row of rows) {
    const id = row.item.split("/").pop() ?? "";
    const entry = byItem.get(id) ?? { sites: new Set<string>(), hqs: [] };
    if (row.site) entry.sites.add(row.site);
    if (row.hqLabel && !/^Q\d+$/.test(row.hqLabel)) {
      const county = row.county ? COUNTIES[row.county.split("/").pop() ?? ""] ?? null : null;
      if (!entry.hqs.some((h) => h.city === row.hqLabel && h.county === county)) entry.hqs.push({ city: row.hqLabel, county });
    }
    byItem.set(id, entry);
  }
  const organizations = candidates.filter((c) => byItem.has(c.id));
  if (organizations.length === 0) return null;
  const bySite = domain ? organizations.find((c) => [...byItem.get(c.id)!.sites].some((s) => sameSite(s, domain))) : undefined;
  const chosen = bySite ?? organizations[0];
  const entry = byItem.get(chosen.id)!;
  const hq = entry.hqs.find((h) => h.county === "Los Angeles") ?? entry.hqs.find((h) => h.county) ?? entry.hqs[0] ?? null;
  return {
    qid: chosen.id,
    label: chosen.label,
    description: chosen.description,
    url: `https://www.wikidata.org/wiki/${chosen.id}`,
    website: [...entry.sites][0] ?? null,
    hqCity: hq?.city ?? null,
    county: hq?.county ?? null,
    matchedBy: bySite ? "website" : "name",
  };
}

/** The LA research fields a confirmed record fills in. Null when the headquarters is outside the LA area. */
export function laFieldsFrom(record: PublicRecord, today: string): Partial<Research> | null {
  if (!record.hqCity || !record.county) return null;
  const inLA = record.county === "Los Angeles";
  return {
    laPresence: inLA ? "headquarters" : "regional",
    laCity: record.hqCity,
    laCounty: record.county,
    laSourceUrl: record.url,
    laVerifiedAt: today,
    laEvidence: `Wikidata lists ${record.label}'s headquarters as ${record.hqCity}, in ${record.county} County.`,
  };
}

async function getJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(12000),
    next: { revalidate: DAY },
  } as RequestInit);
  if (!response.ok) throw new Error(`Wikidata returned ${response.status}`);
  return (await response.json()) as T;
}

export async function findPublicRecord(name: string, domain: string): Promise<PublicRecord | null> {
  const search = await getJson<{ search?: { id: string; label?: string; description?: string }[] }>(
    `${SEARCH}?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&type=item&limit=7&format=json`,
  );
  const candidates: Candidate[] = (search.search ?? [])
    .filter((c) => /^Q\d+$/.test(c.id))
    .map((c) => ({ id: c.id, label: c.label ?? name, description: c.description ?? "" }));
  if (candidates.length === 0) return null;

  const counties = Object.keys(COUNTIES).map((q) => `wd:${q}`).join(" ");
  const query = `SELECT ?item ?site ?hqLabel ?county WHERE {
    VALUES ?item { ${candidates.map((c) => `wd:${c.id}`).join(" ")} }
    FILTER EXISTS { ?item wdt:P159|wdt:P452 [] }
    OPTIONAL { ?item wdt:P856 ?site }
    OPTIONAL { ?item wdt:P159 ?hq .
      # A headquarters recorded only as a state or country is too vague to place, and sometimes wrong.
      FILTER NOT EXISTS { ?hq wdt:P31 ?broad . VALUES ?broad { wd:Q35657 wd:Q6256 wd:Q3624078 } }
      OPTIONAL { VALUES ?county { ${counties} } ?hq wdt:P131* ?county } }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  }`;
  const result = await getJson<{ results: { bindings: Record<string, { value: string }>[] } }>(
    `${SPARQL}?query=${encodeURIComponent(query)}`,
    { headers: { Accept: "application/sparql-results+json" } },
  );
  const rows: SparqlRow[] = result.results.bindings.map((b) => ({
    item: b.item.value,
    site: b.site?.value,
    hqLabel: b.hqLabel?.value,
    county: b.county?.value,
  }));
  return pickRecord(candidates, rows, domain);
}
