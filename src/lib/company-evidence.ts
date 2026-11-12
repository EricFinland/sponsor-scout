import type { Company, Industry, Research } from "./types";

export const PROVIDERS = ["wikidata", "sec", "gleif"] as const;
export type CompanyProvider = (typeof PROVIDERS)[number];
export const PROVIDER_NAMES = {
  wikidata: "Wikidata",
  sec: "SEC EDGAR",
  gleif: "GLEIF",
};
export interface CompanyCandidate {
  provider: CompanyProvider;
  id: string;
  name: string;
  description: string;
  url: string;
}
export interface CompanyRecord extends CompanyCandidate {
  fetchedAt: string;
  domain?: string;
  industries?: string[];
  suggestedIndustry?: Industry;
  headquarters?: {
    city: string;
    region: string;
    country: string;
    address?: string;
    county?: string;
    countyUrl?: string;
  };
  revenue?: {
    usd: number;
    start: string;
    end: string;
    filed: string;
    form: string;
    url: string;
  };
  assets?: { usd: number; end: string; url: string };
  warnings?: string[];
}
export interface CompanyEvidence {
  version: 1;
  confirmedAt: string;
  records: CompanyRecord[];
}

export function safePublicUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 1000) return;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password) return;
    return u.href;
  } catch {
    return;
  }
}
export function companyDomain(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try {
    const u = new URL(value.includes("://") ? value : `https://${value}`);
    if (
      !["https:", "http:"].includes(u.protocol) ||
      u.username ||
      u.password ||
      !u.hostname.includes(".") ||
      /^\d+(\.\d+){3}$/.test(u.hostname)
    )
      return;
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return;
  }
}
/** Small, versioned snapshot, suitable for a single Sheets cell. Invalid imports are ignored. */
export function parseCompanyEvidence(
  value: unknown,
): CompanyEvidence | undefined {
  try {
    const data = typeof value === "string" ? JSON.parse(value) : value;
    if (
      !data ||
      data.version !== 1 ||
      !/^\d{4}-\d{2}-\d{2}T/.test(data.confirmedAt) ||
      !Number.isFinite(Date.parse(data.confirmedAt)) ||
      !Array.isArray(data.records) ||
      !data.records.length ||
      data.records.length > 3 ||
      JSON.stringify(data).length > 5000
    )
      return;
    const seen = new Set<string>();
    for (const r of data.records) {
      if (
        !PROVIDERS.includes(r.provider) ||
        seen.has(r.provider) ||
        typeof r.id !== "string" ||
        typeof r.name !== "string" ||
        !r.name.trim() ||
        r.name.length > 200 ||
        typeof r.description !== "string" ||
        r.description.length > 500 ||
        typeof r.fetchedAt !== "string" ||
        !Number.isFinite(Date.parse(r.fetchedAt))
      )
        return;
      seen.add(r.provider);
      const u = safePublicUrl(r.url);
      if (!u) return;
      const host = new URL(u).hostname;
      if (
        (r.provider === "wikidata" &&
          (host !== "www.wikidata.org" || !/^Q\d+$/.test(r.id))) ||
        (r.provider === "sec" &&
          (host !== "www.sec.gov" || !/^\d{10}$/.test(r.id))) ||
        (r.provider === "gleif" &&
          (host !== "api.gleif.org" || !/^[A-Z0-9]{20}$/.test(r.id)))
      )
        return;
      if (r.domain && companyDomain(r.domain) !== r.domain) return;
      if (
        r.warnings &&
        (!Array.isArray(r.warnings) ||
          r.warnings.length > 8 ||
          r.warnings.some(
            (w: unknown) => typeof w !== "string" || w.length > 500,
          ))
      )
        return;
      if (
        r.industries &&
        (!Array.isArray(r.industries) ||
          r.industries.some(
            (i: unknown) => typeof i !== "string" || i.length > 150,
          ))
      )
        return;
      if (
        r.suggestedIndustry &&
        ![
          "beverage_cpg",
          "outdoor_apparel",
          "tech",
          "water_industrial",
          "financial",
          "retail",
          "entertainment",
          "other",
        ].includes(r.suggestedIndustry)
      )
        return;
      if (r.headquarters) {
        const h = r.headquarters;
        if (
          typeof h.city !== "string" ||
          h.city.length > 200 ||
          typeof h.region !== "string" ||
          h.region.length > 100 ||
          typeof h.country !== "string" ||
          h.country.length > 100 ||
          (h.address !== undefined &&
            (typeof h.address !== "string" || h.address.length > 300)) ||
          (h.county &&
            (typeof h.county !== "string" ||
              !safePublicUrl(h.countyUrl) ||
              !["www.wikidata.org", "geocoding.geo.census.gov"].includes(
                new URL(h.countyUrl).hostname,
              )))
        )
          return;
      }
      if (
        r.revenue &&
        (r.provider !== "sec" ||
          !Number.isFinite(r.revenue.usd) ||
          r.revenue.usd < 0 ||
          !safePublicUrl(r.revenue.url) ||
          new URL(r.revenue.url).hostname !== "www.sec.gov" ||
          ![r.revenue.start, r.revenue.end, r.revenue.filed].every(
            (d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d),
          ) ||
          !["10-K", "10-K/A", "20-F", "20-F/A", "40-F", "40-F/A"].includes(
            r.revenue.form,
          ))
      )
        return;
      if (
        r.assets &&
        (r.provider !== "sec" ||
          !Number.isFinite(r.assets.usd) ||
          r.assets.usd < 0 ||
          !safePublicUrl(r.assets.url) ||
          new URL(r.assets.url).hostname !== "www.sec.gov" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(r.assets.end))
      )
        return;
    }
    return data as CompanyEvidence;
  } catch {
    return;
  }
}

export function revenueSize(
  evidence: CompanyEvidence | undefined,
  year: number,
): { band: Research["sizeBand"]; record: CompanyRecord } | null {
  const data = parseCompanyEvidence(evidence);
  const record = data?.records.find(
    (r) =>
      r.provider === "sec" &&
      r.revenue &&
      Number(r.revenue.end.slice(0, 4)) >= year - 2 &&
      Number(r.revenue.end.slice(0, 4)) <= year,
  );
  if (!record?.revenue) return null;
  const n = record.revenue.usd;
  return {
    band:
      n < 50_000_000
        ? "small"
        : n < 1_000_000_000
          ? "mid"
          : n < 10_000_000_000
            ? "large"
            : "enterprise",
    record,
  };
}

export function evidenceHeadquarters(
  evidence: CompanyEvidence | undefined,
  year: number,
): CompanyRecord | null {
  const data = parseCompanyEvidence(evidence);
  if (
    !data ||
    Number(data.confirmedAt.slice(0, 4)) < year - 1 ||
    Number(data.confirmedAt.slice(0, 4)) > year
  )
    return null;
  const recent = data.records.filter(
    (r) =>
      r.headquarters &&
      Number(r.fetchedAt.slice(0, 4)) >= year - 1 &&
      Number(r.fetchedAt.slice(0, 4)) <= year &&
      !r.warnings?.some((w) => /lapsed|inactive|historical/i.test(w)),
  );
  const cities = new Set(
    recent.map(
      (r) =>
        `${r.headquarters!.country}:${r.headquarters!.city.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
    ),
  );
  if (cities.size > 1) return null;
  return (
    ["gleif", "sec", "wikidata"]
      .map((p) =>
        recent.find((r) => r.provider === p && r.headquarters?.county),
      )
      .find(Boolean) ?? null
  );
}

/** Fill metadata gaps only; reviewed company metadata remains authoritative. */
export function withPublicMetadata(company: Company): Company {
  const records =
    parseCompanyEvidence(company.research.publicData)?.records ?? [];
  const industry = records.find((r) => r.suggestedIndustry)?.suggestedIndustry;
  const location = records.find(
    (r) => r.headquarters?.country === "US",
  )?.headquarters;
  return {
    ...company,
    domain: company.domain || records.find((r) => r.domain)?.domain || "",
    industry:
      company.industry === "other" && industry ? industry : company.industry,
    hqState: company.hqState || location?.region.replace(/^US-/, "") || "",
  };
}
