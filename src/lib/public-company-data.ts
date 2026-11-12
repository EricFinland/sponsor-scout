import { unstable_cache } from "next/cache";
import { normalizeName, tokens } from "./names";
import {
  companyDomain,
  type CompanyCandidate,
  type CompanyProvider,
  type CompanyRecord,
} from "./company-evidence";
import type { Industry } from "./types";

const USER_AGENT =
  "SponsorScout/1.0 (https://github.com/EricFinland/sponsor-scout)";
const inflight = new Map<string, Promise<unknown>>();
function cached<T>(
  key: string,
  work: () => Promise<T>,
  seconds = 3600,
): Promise<T> {
  return unstable_cache(
    () => {
      const old = inflight.get(key);
      if (old) return old as Promise<T>;
      const next = work().finally(() => inflight.delete(key));
      inflight.set(key, next);
      return next;
    },
    ["public-company-data-v1", key],
    { revalidate: seconds },
  )();
}
let secQueue = Promise.resolve();
let secWaiting = 0;
async function secSlot() {
  if (secWaiting >= 12)
    throw new Error("SEC requests are busy. Please retry shortly.");
  secWaiting++;
  const slot = secQueue;
  secQueue = slot.then(
    () => new Promise<void>((resolve) => setTimeout(resolve, 250)),
  );
  try {
    await slot;
  } finally {
    secWaiting--;
  }
}
async function json(url: string): Promise<any> {
  const host = new URL(url).hostname;
  if (
    ![
      "www.wikidata.org",
      "www.sec.gov",
      "data.sec.gov",
      "api.gleif.org",
      "geocoding.geo.census.gov",
    ].includes(host)
  )
    throw new Error("Unsupported data host.");
  if (host.endsWith("sec.gov")) await secSlot();
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent":
        process.env.SEC_USER_AGENT && host.endsWith("sec.gov")
          ? process.env.SEC_USER_AGENT
          : USER_AGENT,
    },
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "Source rate limit reached. Please retry later."
        : `Source returned HTTP ${response.status}.`,
    );
  const text = await response.text();
  if (text.length > 14_000_000)
    throw new Error("Source response is too large.");
  return JSON.parse(text);
}
const clip = (value: unknown, n = 180): string =>
  typeof value === "string" ? value.slice(0, n) : "";
const label = (entity: any) => clip(entity?.labels?.en?.value);
const activeClaims = (entity: any, property: string): any[] => {
  const claims = (entity?.claims?.[property] ?? []).filter(
    (c: any) => c.rank !== "deprecated" && !c.qualifiers?.P582,
  );
  return claims.some((c: any) => c.rank === "preferred")
    ? claims.filter((c: any) => c.rank === "preferred")
    : claims;
};
const ids = (entity: any, property: string): string[] =>
  activeClaims(entity, property)
    .map((c: any) => c.mainsnak?.datavalue?.value?.id)
    .filter(
      (v: unknown) => typeof v === "string" && /^Q\d+$/.test(v as string),
    );
async function wikiEntities(entityIds: string[]) {
  const unique = [...new Set(entityIds)].slice(0, 20);
  if (!unique.length) return {};
  const url = new URL("https://www.wikidata.org/w/api.php");
  url.search = new URLSearchParams({
    action: "wbgetentities",
    ids: unique.join("|"),
    props: "labels|descriptions|claims",
    languages: "en",
    format: "json",
  }).toString();
  return (await json(url.href)).entities ?? {};
}
export function classifyIndustry(labels: string[]): Industry | undefined {
  const text = labels.join(" ").toLowerCase();
  if (/\b(beverages?|soft drinks?|food processing|consumer goods)\b/.test(text))
    return "beverage_cpg";
  if (/\b(apparel|clothing|footwear|outdoor recreation)\b/.test(text))
    return "outdoor_apparel";
  if (
    /\b(software|semiconductors?|information technology|computer hardware)\b/.test(
      text,
    )
  )
    return "tech";
  if (/\b(water treatment|water supply|water technology)\b/.test(text))
    return "water_industrial";
  if (
    /\b(banking|banks?|financial services|insurance|investment banking)\b/.test(
      text,
    )
  )
    return "financial";
  if (/\b(retail|department store|supermarket)\b/.test(text)) return "retail";
  if (/\b(film|entertainment|broadcasting|television|mass media)\b/.test(text))
    return "entertainment";
}
function rank(query: string, name: string) {
  if (normalizeName(query) === normalizeName(name)) return 100;
  const want = tokens(query),
    have = tokens(name);
  if (!want.length) return 0;
  return (
    (want.filter((t) => have.includes(t)).length / want.length) * 60 +
    (normalizeName(name).startsWith(normalizeName(query)) ? 10 : 0)
  );
}

export async function searchPublicCompanies(
  provider: CompanyProvider,
  query: string,
): Promise<CompanyCandidate[]> {
  return cached(`${provider}:search:${query.toLowerCase()}`, async () => {
    let candidates: CompanyCandidate[];
    if (provider === "wikidata") {
      const url = new URL("https://www.wikidata.org/w/api.php");
      url.search = new URLSearchParams({
        action: "wbsearchentities",
        search: query,
        language: "en",
        type: "item",
        limit: "5",
        format: "json",
      }).toString();
      const data = await json(url.href);
      candidates = (data.search ?? [])
        .filter((r: any) => /^Q\d+$/.test(r.id))
        .map((r: any) => ({
          provider,
          id: r.id,
          name: clip(r.label),
          description: clip(r.description),
          url: `https://www.wikidata.org/wiki/${r.id}`,
        }));
    } else if (provider === "gleif") {
      const url = new URL("https://api.gleif.org/api/v1/lei-records");
      url.searchParams.set("filter[entity.legalName]", query);
      url.searchParams.set("page[size]", "8");
      const data = await json(url.href);
      candidates = (data.data ?? [])
        .filter((r: any) => /^[A-Z0-9]{20}$/.test(r.id))
        .map((r: any) => ({
          provider,
          id: r.id,
          name: clip(r.attributes?.entity?.legalName?.name),
          description: [
            r.attributes?.entity?.headquartersAddress?.city,
            r.attributes?.entity?.headquartersAddress?.country,
            r.attributes?.registration?.status,
          ]
            .filter(Boolean)
            .join(" · "),
          url: `https://api.gleif.org/api/v1/lei-records/${r.id}`,
        }));
    } else {
      const all = await cached(
        "sec:tickers",
        () => json("https://www.sec.gov/files/company_tickers.json"),
        86400,
      );
      candidates = Object.values(all)
        .filter(
          (r: any) =>
            rank(query, r.title) >= 50 ||
            r.ticker?.toLowerCase() === query.toLowerCase(),
        )
        .map((r: any) => ({
          provider,
          id: String(r.cik_str).padStart(10, "0"),
          name: clip(r.title),
          description: `Ticker ${r.ticker} · CIK ${String(r.cik_str).padStart(10, "0")}`,
          url: `https://www.sec.gov/edgar/browse/?CIK=${r.cik_str}`,
        }));
    }
    return [
      ...new Map(
        candidates
          .sort((a, b) => rank(query, b.name) - rank(query, a.name))
          .map((c) => [c.id, c]),
      ).values(),
    ].slice(0, 5);
  });
}

export function annualFinancials(
  facts: any,
  cik: string,
  now = new Date(),
): Pick<CompanyRecord, "revenue" | "assets"> {
  const annualForms = new Set([
    "10-K",
    "10-K/A",
    "20-F",
    "20-F/A",
    "40-F",
    "40-F/A",
  ]);
  const endLimit = now.toISOString().slice(0, 10);
  const filingUrl = (r: any) =>
    /^\d{10}-\d{2}-\d{6}$/.test(r.accn ?? "")
      ? `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${r.accn.replaceAll("-", "")}/`
      : `https://www.sec.gov/edgar/browse/?CIK=${cik}`;
  const revenueTags = [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "Revenues",
    "SalesRevenueNet",
    "SalesRevenueGoodsNet",
    "Revenue",
  ];
  const values: any[] = [];
  for (const [priority, tag] of revenueTags.entries())
    for (const taxonomy of ["us-gaap", "ifrs-full"]) {
      for (const r of facts?.facts?.[taxonomy]?.[tag]?.units?.USD ?? []) {
        const days = (Date.parse(r.end) - Date.parse(r.start)) / 86400000;
        if (
          annualForms.has(r.form) &&
          Number.isFinite(r.val) &&
          r.val >= 0 &&
          days >= 300 &&
          days <= 400 &&
          /^\d{4}-\d{2}-\d{2}$/.test(r.filed ?? "") &&
          r.end <= endLimit &&
          r.filed <= endLimit
        )
          values.push({ ...r, priority });
      }
    }
  values.sort(
    (a, b) =>
      b.end.localeCompare(a.end) ||
      b.filed.localeCompare(a.filed) ||
      a.priority - b.priority,
  );
  const r = values[0];
  const assetValues = ["us-gaap", "ifrs-full"]
    .flatMap((tax) => facts?.facts?.[tax]?.Assets?.units?.USD ?? [])
    .filter(
      (v: any) =>
        annualForms.has(v.form) &&
        Number.isFinite(v.val) &&
        v.val >= 0 &&
        /^\d{4}-\d{2}-\d{2}$/.test(v.end ?? "") &&
        v.end <= endLimit &&
        v.filed <= endLimit,
    );
  assetValues.sort(
    (a: any, b: any) =>
      b.end.localeCompare(a.end) || b.filed.localeCompare(a.filed),
  );
  const a = assetValues[0];
  return {
    ...(r
      ? {
          revenue: {
            usd: r.val,
            start: r.start,
            end: r.end,
            filed: r.filed,
            form: r.form,
            url: filingUrl(r),
          },
        }
      : {}),
    ...(a ? { assets: { usd: a.val, end: a.end, url: filingUrl(a) } } : {}),
  };
}

async function countyFor(
  h: NonNullable<CompanyRecord["headquarters"]>,
): Promise<CompanyRecord["headquarters"]> {
  if (h.country !== "US" || !["CA", "US-CA"].includes(h.region) || !h.address)
    return h;
  try {
    const url = new URL(
      "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress",
    );
    url.search = new URLSearchParams({
      address: `${h.address}, ${h.city}, CA`,
      benchmark: "Public_AR_Current",
      vintage: "Current_Current",
      layers: "Counties",
      format: "json",
    }).toString();
    const data = await json(url.href);
    const matches = data.result?.addressMatches;
    if (
      matches?.length !== 1 ||
      matches[0].addressComponents?.state !== "CA" ||
      normalizeName(matches[0].addressComponents?.city ?? "") !==
        normalizeName(h.city)
    )
      return h;
    const county = matches[0].geographies?.Counties?.[0];
    if (county?.STATE === "06" && county.NAME)
      return {
        ...h,
        county: county.NAME.replace(/ County$/, ""),
        countyUrl: url.href,
      };
  } catch {
    /* Missing geography never turns into evidence of no LA presence. */
  }
  return h;
}

export async function publicCompanyRecord(
  provider: CompanyProvider,
  id: string,
): Promise<CompanyRecord> {
  return cached(`${provider}:record:${id}`, async () => {
    const fetchedAt = new Date().toISOString();
    if (provider === "gleif") {
      const url = `https://api.gleif.org/api/v1/lei-records/${id}`;
      const data = (await json(url)).data?.attributes;
      if (!data?.entity?.legalName?.name)
        throw new Error("GLEIF record not found.");
      const e = data.entity,
        h = e.headquartersAddress,
        warnings: string[] = [];
      if (data.registration?.status !== "ISSUED")
        warnings.push(
          `GLEIF registration ${clip(data.registration?.status)}; location needs review.`,
        );
      if (e.status !== "ACTIVE")
        warnings.push(
          "Legal entity is inactive; historical locations are not scored.",
        );
      return {
        provider,
        id,
        name: clip(e.legalName.name),
        description: `LEI ${id}; registered address: ${clip([...(e.legalAddress?.addressLines ?? []), e.legalAddress?.city, e.legalAddress?.country].filter(Boolean).join(", "), 250)}`,
        url,
        fetchedAt,
        ...(h?.city
          ? {
              headquarters: await countyFor({
                city: clip(h.city),
                region: clip(h.region),
                country: clip(h.country),
                address: clip(h.addressLines?.join(", "), 250),
              }),
            }
          : {}),
        warnings,
      };
    }
    if (provider === "sec") {
      const [metaResult, factsResult] = await Promise.allSettled([
        json(`https://data.sec.gov/submissions/CIK${id}.json`),
        json(`https://data.sec.gov/api/xbrl/companyfacts/CIK${id}.json`),
      ]);
      if (metaResult.status === "rejected") throw metaResult.reason;
      const meta = metaResult.value,
        h = meta.addresses?.business;
      const financials =
        factsResult.status === "fulfilled"
          ? annualFinancials(factsResult.value, id)
          : {};
      const warnings =
        factsResult.status === "rejected"
          ? [
              "Financial facts unavailable. Identity data is still available; retry later.",
            ]
          : !financials.revenue
            ? [
                "No comparable annual USD revenue found. Capacity is not inferred from non-USD or quarterly figures.",
              ]
            : [];
      // EDGAR's business address is not guaranteed to be headquarters; retain as context only.
      return {
        provider,
        id,
        name: clip(meta.name),
        description: [
          meta.tickers?.join(", "),
          meta.sicDescription,
          h ? `Business address: ${h.city}, ${h.stateOrCountry}` : "",
        ]
          .filter(Boolean)
          .join(" · ")
          .slice(0, 400),
        url: `https://www.sec.gov/edgar/browse/?CIK=${id}`,
        fetchedAt,
        ...financials,
        ...(companyDomain(meta.website)
          ? { domain: companyDomain(meta.website) }
          : {}),
        ...(meta.sicDescription
          ? {
              industries: [clip(meta.sicDescription)],
              suggestedIndustry: classifyIndustry([meta.sicDescription]),
            }
          : {}),
        warnings,
      };
    }
    const entities = await wikiEntities([id]),
      entity = entities[id];
    if (
      !entity ||
      entity.missing !== undefined ||
      ids(entity, "P31").includes("Q5")
    )
      throw new Error("Select an organization record, not a person.");
    const headquarters = ids(entity, "P159"),
      industryIds = ids(entity, "P452").slice(0, 4);
    const related = await wikiEntities([
      ...headquarters.slice(0, 2),
      ...industryIds,
    ]);
    const industries = industryIds
      .map((q) => label(related[q]))
      .filter(Boolean);
    let location: CompanyRecord["headquarters"];
    const warnings: string[] = [];
    if (headquarters.length > 1)
      warnings.push(
        "Multiple headquarters are listed. LA presence needs manual review.",
      );
    if (headquarters.length === 1) {
      const city = related[headquarters[0]];
      let node = city,
        nodeId = headquarters[0],
        county = "",
        countyUrl = "",
        region = "",
        country = "";
      for (let depth = 0; depth < 5 && node; depth++) {
        if (ids(node, "P17").includes("Q30") || nodeId === "Q30")
          country = "US";
        if (nodeId === "Q99") {
          region = "CA";
          country = "US";
        }
        if (/ County$/.test(label(node))) {
          county = label(node).replace(/ County$/, "");
          countyUrl = `https://www.wikidata.org/wiki/${nodeId}`;
        }
        const parents = ids(node, "P131");
        if (parents.length !== 1) break;
        nodeId = parents[0];
        node = (await wikiEntities([nodeId]))[nodeId];
      }
      location = {
        city: label(city),
        region,
        country,
        ...(county && region === "CA" ? { county, countyUrl } : {}),
      };
    }
    const website = activeClaims(entity, "P856")[0]?.mainsnak?.datavalue?.value;
    return {
      provider,
      id,
      name: label(entity),
      description: clip(entity.descriptions?.en?.value),
      url: `https://www.wikidata.org/wiki/${id}`,
      fetchedAt,
      ...(companyDomain(website) ? { domain: companyDomain(website) } : {}),
      industries,
      suggestedIndustry: classifyIndustry(industries),
      ...(location ? { headquarters: location } : {}),
      warnings,
    };
  });
}
