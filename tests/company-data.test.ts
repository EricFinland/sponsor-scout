import { describe, expect, it, vi, afterEach } from "vitest";
vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => Promise<unknown>) => fn,
}));
import {
  annualFinancials,
  classifyIndustry,
  publicCompanyRecord,
  searchPublicCompanies,
} from "@/lib/public-company-data";
import {
  evidenceHeadquarters,
  parseCompanyEvidence,
  revenueSize,
  withPublicMetadata,
  type CompanyEvidence,
  type CompanyRecord,
} from "@/lib/company-evidence";
import { localPresence } from "@/lib/local-presence";
import { EMPTY_RESEARCH, type Company, type ScoringConfig } from "@/lib/types";
import { scoreCompany } from "@/lib/scoring";
import {
  researchFromRow,
  researchToRow,
  companyToRow,
  decodeDataset,
} from "@/lib/sheet-data";
import { validateOperations } from "@/lib/mutations";
import { createSheetRuntime } from "./helpers/sheet-runtime";
import config from "@data/weights.json";
import { GET } from "@/app/api/company-data/route";

const record: CompanyRecord = {
  provider: "sec",
  id: "0000063276",
  name: "Acme",
  description: "Public company",
  url: "https://www.sec.gov/edgar/browse/?CIK=63276",
  fetchedAt: "2026-11-11T00:00:00Z",
  revenue: {
    usd: 5_000_000_000,
    start: "2025-01-01",
    end: "2025-12-31",
    filed: "2026-02-01",
    form: "10-K",
    url: "https://www.sec.gov/Archives/edgar/data/63276/000006327626000001/",
  },
};
const hq: CompanyRecord = {
  provider: "gleif",
  id: "549300VELLG24KHTJ564",
  name: "Acme",
  description: "Headquarters, not registered agent",
  fetchedAt: record.fetchedAt,
  url: "https://api.gleif.org/api/v1/lei-records/549300VELLG24KHTJ564",
  headquarters: {
    city: "El Segundo",
    region: "US-CA",
    country: "US",
    county: "Los Angeles",
    countyUrl:
      "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=public",
  },
};
const evidence = (records = [record, hq]): CompanyEvidence => ({
  version: 1,
  confirmedAt: record.fetchedAt,
  records,
});
const company = (publicData?: CompanyEvidence): Company => ({
  slug: "acme",
  name: "Acme",
  industry: "other",
  domain: "",
  hqState: "",
  foundation: { status: "unverified", ein: null, name: null },
  research: { ...EMPTY_RESEARCH, publicData },
});
const scored = (c: Company) =>
  scoreCompany({
    company: c,
    filing: null,
    peers: [],
    industryPeerCompanies: 0,
    config: config as ScoringConfig,
    asOfYear: 2026,
  });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("public company facts and scoring", () => {
  it("uses annual USD revenue as size only and awards no giving/peer confidence", () => {
    const before = scored(company()),
      after = scored(company(evidence([record])));
    expect(after.factors.capacity_fit.score).toBe(55);
    expect(after.factors.mission_alignment).toEqual(
      before.factors.mission_alignment,
    );
    expect(after.factors.peer_signal).toEqual(before.factors.peer_signal);
    expect(after.factors.confidence).toEqual(before.factors.confidence);
    expect(after.factors.capacity_fit.evidence[0].sourceUrl).toContain(
      "sec.gov",
    );
    expect(
      revenueSize(
        evidence([
          { ...record, revenue: { ...record.revenue!, end: "2023-12-31" } },
        ]),
        2026,
      ),
    ).toBeNull();
  });
  it("keeps manually researched size and giving ahead of public size estimates", () => {
    const c = company(evidence());
    c.research.sizeBand = "small";
    expect(scored(c).factors.capacity_fit.score).toBe(25);
    c.research.annualGivingUsd = 1_000_000;
    expect(scored(c).factors.capacity_fit.score).toBe(70);
  });
  it("requires a confirmed, current headquarters and independently sourced county for LA points", () => {
    expect(localPresence(company(evidence([hq])).research, 2026).points).toBe(
      35,
    );
    expect(
      localPresence(
        company(
          evidence([
            {
              ...hq,
              headquarters: {
                ...hq.headquarters!,
                county: undefined,
                countyUrl: undefined,
              },
            },
          ]),
        ).research,
        2026,
      ).points,
    ).toBe(0);
    expect(
      localPresence(
        company(evidence([{ ...hq, warnings: ["GLEIF registration LAPSED"] }]))
          .research,
        2026,
      ).points,
    ).toBe(0);
    expect(
      localPresence(
        company({ ...evidence([hq]), confirmedAt: "2023-01-01T00:00:00Z" })
          .research,
        2026,
      ).points,
    ).toBe(0);
  });
  it("does not score conflicting locations and does not override reviewed local research", () => {
    const other = {
      ...hq,
      provider: "wikidata" as const,
      id: "Q123",
      url: "https://www.wikidata.org/wiki/Q123",
      headquarters: { ...hq.headquarters!, city: "San Francisco" },
    };
    expect(evidenceHeadquarters(evidence([hq, other]), 2026)).toBeNull();
    const c = company(evidence([hq]));
    c.research.laPresence = "none";
    expect(localPresence(c.research, 2026).points).toBe(0);
  });
  it("rejects malformed persisted records and unsafe or misattributed sources", () => {
    for (const data of [
      { ...evidence(), version: 2 },
      evidence([record, record]),
      evidence([{ ...record, description: {} as string }]),
      evidence([{ ...record, url: "javascript:alert(1)" }]),
      evidence([
        {
          ...record,
          revenue: { ...record.revenue!, url: "https://unrelated.example" },
        },
      ]),
      evidence([
        {
          ...hq,
          headquarters: {
            ...hq.headquarters!,
            countyUrl: "https://unrelated.example",
          },
        },
      ]),
    ])
      expect(parseCompanyEvidence(data)).toBeUndefined();
  });
  it("round trips confirmed sources through the actual Sheet runtime and decoder", () => {
    const c = company(evidence()),
      row = researchToRow(c.slug, c.research);
    expect(researchFromRow(row).publicData).toEqual(evidence());
    const runtime = createSheetRuntime({
      Companies: [companyToRow(c)],
      Profiles: [{ ...row, publicData: "", version: "v1" }],
    });
    const operations = validateOperations([
      { tab: "Profiles", key: c.slug, row, expectedVersion: "v1" },
    ]);
    expect(
      runtime.call({
        action: "mutate",
        secret: "fixture-only-secret",
        operations,
      }).ok,
    ).toBe(true);
    const tables = runtime.call({
      action: "read",
      secret: "fixture-only-secret",
      tabs: ["Companies", "Profiles"],
    }).data;
    const decoded = decodeDataset(tables, config as ScoringConfig).companies[0];
    expect(decoded.research.publicData).toEqual(evidence());
    expect(scored(decoded)).toEqual(scored(c));
    expect(() =>
      validateOperations([
        {
          tab: "Profiles",
          key: c.slug,
          row: { slug: c.slug, publicData: '{"invalid":true}' },
        },
      ]),
    ).toThrow("invalid");
  });
  it("fills metadata gaps while preserving explicit metadata", () => {
    const data = evidence([
      { ...record, domain: "acme.example", suggestedIndustry: "tech" },
    ]);
    expect(withPublicMetadata(company(data)).domain).toBe("acme.example");
    expect(
      withPublicMetadata({
        ...company(data),
        domain: "reviewed.example",
        industry: "retail",
      }).industry,
    ).toBe("retail");
    expect(classifyIndustry(["software industry"])).toBe("tech");
    expect(classifyIndustry(["toy industry"])).toBeUndefined();
  });
});

describe("source adapters", () => {
  it("selects consolidated annual USD facts, handles restatements and ignores quarterly, future and foreign-currency values", () => {
    const base = {
      start: "2025-01-01",
      end: "2025-12-31",
      filed: "2026-02-01",
      form: "10-K",
      val: 100,
      accn: "0000063276-26-000001",
    };
    const facts = {
      facts: {
        "us-gaap": {
          Revenues: {
            units: {
              USD: [
                base,
                { ...base, filed: "2026-03-01", val: 110 },
                { ...base, start: "2025-10-01", val: 999 },
                { ...base, end: "2027-12-31", val: 999 },
                { ...base, form: "10-Q", val: 999 },
              ],
              EUR: [{ ...base, val: 999 }],
            },
          },
          Assets: { units: { USD: [{ ...base, val: 200 }] } },
        },
      },
    };
    const result = annualFinancials(
      facts,
      "0000063276",
      new Date("2026-11-11"),
    );
    expect(result.revenue?.usd).toBe(110);
    expect(result.assets?.usd).toBe(200);
    expect(result.revenue?.url).toContain("/63276/000006327626000001/");
  });
  it("deduplicates SEC share classes and supports ticker searches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          0: { title: "Acme Inc", ticker: "ACME", cik_str: 123 },
          1: { title: "Acme Inc", ticker: "ACMEB", cik_str: 123 },
        }),
      ),
    );
    expect(await searchPublicCompanies("sec", "ACME")).toHaveLength(1);
  });
  it("keeps GLEIF registered-agent addresses separate and declines ambiguous county geocoding", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        Response.json(
          url.includes("gleif")
            ? {
                data: {
                  attributes: {
                    entity: {
                      legalName: { name: "Acme" },
                      status: "ACTIVE",
                      legalAddress: { city: "Wilmington", country: "US" },
                      headquartersAddress: {
                        city: "El Segundo",
                        region: "US-CA",
                        country: "US",
                        addressLines: ["333 Continental Blvd"],
                      },
                    },
                    registration: { status: "ISSUED" },
                  },
                },
              }
            : { result: { addressMatches: [] } },
        ),
      ),
    );
    const result = await publicCompanyRecord("gleif", hq.id);
    expect(result.headquarters?.city).toBe("El Segundo");
    expect(result.headquarters?.county).toBeUndefined();
  });
  it("rejects provider/id injection before making network requests", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    for (const query of [
      "provider=other&q=Acme",
      "provider=sec&id=https://evil.example",
      "provider=wikidata&id=Q1/../../x",
      "provider=gleif&q=x",
    ])
      expect(
        (
          await GET(
            new Request(`https://example.com/api/company-data?${query}`),
          )
        ).status,
      ).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("surfaces upstream failures without inventing data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("busy", { status: 429 })),
    );
    const response = await GET(
      new Request("https://example.com/api/company-data?provider=gleif&q=Acme"),
    );
    expect(response.status).toBe(502);
    expect(await response.json()).not.toHaveProperty("record");
  });
});
