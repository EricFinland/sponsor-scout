import { grantStats, parseReturn, trimGrants } from "./efile";
import { tidyOrgName, tidyPersonName, tokens, withCompanyCasing } from "./names";
import type { Filing, FilingYear, FoundationCandidate, SourceLink } from "./types";

/**
 * Free, keyless public sources:
 *  - ProPublica Nonprofit Explorer API: foundation search and yearly totals.
 *  - GivingTuesday 990 Data Lake: the IRS e-file XML for a filing, which holds
 *    the grant list and officers that ProPublica's API does not expose.
 */

const API = "https://projects.propublica.org/nonprofits/api/v2";
const XML_MIRROR = "https://gt990datalake-rawdata.s3.amazonaws.com/EfileData/XmlFiles";
const DAY = 60 * 60 * 24;

interface SearchOrg {
  ein: number;
  name: string;
  city: string | null;
  state: string | null;
}

const GIVING_WORDS = /\b(foundation|fund|charitable|trust|giving|philanthrop\w*)\b/i;
const UNLIKELY_WORDS =
  /\b(scholars?|scholarship|employees?|retirees?|credit union|alumni|club|association|pta|pac|union|pension|benefit|veba)\b/i;

/** How well a nonprofit's name fits the company searched, 0 to 100. */
export function matchScore(company: string, orgName: string): number {
  const want = tokens(company);
  const have = new Set(tokens(orgName));
  if (want.length === 0) return 0;
  const overlap = want.filter((t) => have.has(t)).length / want.length;
  let score = overlap * 60;
  if (GIVING_WORDS.test(orgName)) score += 25;
  const extra = [...have].filter((t) => !want.includes(t) && !GIVING_WORDS.test(t)).length;
  score += Math.max(0, 15 - extra * 5);
  if (UNLIKELY_WORDS.test(orgName)) score -= 20;
  return Math.max(0, Math.min(100, Math.round(score)));
}

async function getJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12000),
    next: { revalidate: DAY },
  } as RequestInit);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`ProPublica returned ${response.status}`);
  return (await response.json()) as T;
}

export async function searchFoundations(company: string): Promise<FoundationCandidate[]> {
  const queries = [`${company} foundation`, company];
  const settled = await Promise.allSettled(
    queries.map((q) => getJson<{ organizations: SearchOrg[] }>(`${API}/search.json?q=${encodeURIComponent(q)}`)),
  );
  // A 404 means "no results" and resolves to null. Only fail when every request errored.
  if (settled.every((s) => s.status === "rejected")) throw new Error("ProPublica search is unavailable");
  const results = settled.map((s) => (s.status === "fulfilled" ? s.value : null));
  const byEin = new Map<string, FoundationCandidate>();
  for (const result of results) {
    for (const org of result?.organizations ?? []) {
      const ein = String(org.ein).padStart(9, "0");
      if (byEin.has(ein)) continue;
      byEin.set(ein, {
        ein,
        name: withCompanyCasing(tidyOrgName(org.name), company),
        city: tidyOrgName(org.city ?? ""),
        state: org.state ?? "",
        match: matchScore(company, org.name),
      });
    }
  }
  return [...byEin.values()]
    .filter((c) => c.match >= 35)
    .sort((a, b) => b.match - a.match)
    .slice(0, 8);
}

interface OrgResponse {
  organization: {
    ein: number;
    name: string;
    city: string | null;
    state: string | null;
    latest_object_id?: string | null;
  };
  filings_with_data: Array<Record<string, number | string | null>>;
}

function history(filings: OrgResponse["filings_with_data"]): FilingYear[] {
  const byYear = new Map<number, FilingYear>();
  for (const f of filings) {
    const year = Number(f.tax_prd_yr);
    if (!year || byYear.has(year)) continue;
    const isPf = Number(f.formtype) === 2;
    const giving = isPf ? f.contrpdpbks : null;
    const assets = isPf ? (f.fairmrktvalamt ?? f.totassetsend) : f.totassetsend;
    byYear.set(year, {
      year,
      giving: typeof giving === "number" ? giving : null,
      assets: typeof assets === "number" ? assets : null,
      pdfUrl: typeof f.pdf_url === "string" ? f.pdf_url : null,
    });
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year).slice(-8);
}

export function xmlUrl(objectId: string): string {
  return `${XML_MIRROR}/${objectId}_public.xml`;
}

export async function fetchFiling(einInput: string, company?: string): Promise<Filing | null> {
  const ein = einInput.replace(/\D/g, "").padStart(9, "0");
  const org = await getJson<OrgResponse>(`${API}/organizations/${Number(ein)}.json`);
  if (!org) return null;
  // ProPublica answers unknown EINs with a stub record instead of a 404.
  if (/^unknown organization$/i.test(org.organization.name ?? "") && !(org.filings_with_data ?? []).length) return null;

  const years = history(org.filings_with_data ?? []);
  const latest = years[years.length - 1] ?? null;
  const sources: SourceLink[] = [
    { label: "ProPublica Nonprofit Explorer", url: `https://projects.propublica.org/nonprofits/organizations/${Number(ein)}` },
  ];

  const filing: Filing = {
    ein,
    name: tidyOrgName(org.organization.name),
    city: tidyOrgName(org.organization.city ?? ""),
    state: org.organization.state ?? "",
    formType: "",
    taxYear: latest?.year ?? null,
    totalGiving: latest?.giving ?? null,
    totalAssets: latest?.assets ?? null,
    detailAvailable: false,
    stats: null,
    grantsInAttachment: false,
    officers: [],
    preselectedOnly: null,
    applicationContact: null,
    website: null,
    history: years,
    sources,
    fetchedAt: new Date().toISOString(),
    grants: [],
    grantsTruncated: false,
  };

  const objectId = org.organization.latest_object_id;
  if (objectId) {
    try {
      const response = await fetch(xmlUrl(objectId), { cache: "no-store" });
      if (response.ok) {
        const parsed = parseReturn(await response.text());
        if (parsed.formType === "990PF" || parsed.grants.length > 0 || parsed.officers.length > 0) {
          const { grants, truncated } = trimGrants(parsed.grants);
          filing.formType = parsed.formType;
          filing.taxYear = parsed.taxYear ?? filing.taxYear;
          filing.totalGiving = parsed.totalGiving ?? filing.totalGiving;
          filing.totalAssets = parsed.totalAssets ?? filing.totalAssets;
          if (parsed.filerName) filing.name = parsed.filerName;
          filing.grantsInAttachment = parsed.grantsInAttachment;
          // An attached statement with no itemized rows leaves nothing to analyze.
          filing.detailAvailable =
            parsed.grants.length > 0 || (parsed.formType === "990PF" && !parsed.grantsInAttachment);
          filing.stats = filing.detailAvailable ? grantStats(parsed.grants) : null;
          filing.officers = parsed.officers.slice(0, 40);
          filing.preselectedOnly = parsed.preselectedOnly;
          filing.applicationContact = parsed.applicationContact ? tidyPersonName(parsed.applicationContact) : null;
          filing.website = parsed.website;
          filing.grants = grants;
          filing.grantsTruncated = truncated;
          sources.push({ label: `IRS e-file XML, ${parsed.formType} ${parsed.taxYear ?? ""}`.trim(), url: xmlUrl(objectId) });
          if (parsed.taxYear && filing.totalGiving !== null) {
            const row = years.find((y) => y.year === parsed.taxYear);
            if (row) row.giving = row.giving ?? filing.totalGiving;
            else years.push({ year: parsed.taxYear, giving: filing.totalGiving, assets: filing.totalAssets, pdfUrl: null });
            years.sort((a, b) => a.year - b.year);
          }
        }
      }
    } catch {
      // The mirror is a convenience. Totals from ProPublica still stand without it.
    }
  }
  if (company) filing.name = withCompanyCasing(filing.name, company);
  const pdf = [...years].reverse().find((y) => y.pdfUrl);
  if (pdf?.pdfUrl) sources.push({ label: `Filing PDF, ${pdf.year}`, url: pdf.pdfUrl });
  return filing;
}
