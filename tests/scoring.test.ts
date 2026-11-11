import { describe, expect, it } from "vitest";
import config from "@data/weights.json";
import { scoreCompany, tierFor } from "@/lib/scoring";
import type { Company, FilingSummary, GrantStats, PeerRow, ScoreInputs, ScoringConfig } from "@/lib/types";
import { EMPTY_RESEARCH } from "@/lib/types";

const CONFIG = config as ScoringConfig;

function company(overrides: Partial<Company> = {}): Company {
  return {
    slug: "acme",
    name: "Acme",
    industry: "other",
    domain: "",
    hqState: "",
    foundation: { status: "unverified", ein: null, name: null },
    research: { ...EMPTY_RESEARCH },
    ...overrides,
  };
}

function stats(overrides: Partial<GrantStats> = {}): GrantStats {
  return {
    count: 100,
    total: 10_000_000,
    median: 50_000,
    buckets: [0, 10, 30, 40, 15, 5],
    waterCount: 0,
    waterAmount: 0,
    adjacentCount: 0,
    peerMatches: [],
    thirstProjectGrants: 0,
    ...overrides,
  };
}

function filing(overrides: Partial<FilingSummary> = {}): FilingSummary {
  return {
    ein: "123456789",
    name: "Acme Foundation",
    city: "Denver",
    state: "CO",
    formType: "990PF",
    taxYear: 2024,
    totalGiving: 10_000_000,
    totalAssets: 50_000_000,
    detailAvailable: true,
    stats: stats(),
    grantsInAttachment: false,
    officers: [{ name: "Pat Lee", title: "President" }],
    preselectedOnly: false,
    applicationContact: null,
    website: null,
    history: [],
    sources: [{ label: "ProPublica", url: "https://example.org/filing" }],
    fetchedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function inputs(overrides: Partial<ScoreInputs> = {}): ScoreInputs {
  return {
    company: company(),
    filing: null,
    peers: [],
    industryPeerCompanies: 0,
    config: CONFIG,
    asOfYear: 2026,
    ...overrides,
  };
}

const peer = (nonprofit: string, amountUsd = 50_000): PeerRow => ({
  company: "Acme",
  industry: "other",
  peerNonprofit: nonprofit,
  relationship: "Foundation grant",
  year: 2024,
  amountUsd,
  sourceUrl: "https://example.org/filing",
  note: "",
});

describe("a company nobody has researched", () => {
  const result = scoreCompany(inputs());

  it("sits at the neutral baselines instead of the bottom", () => {
    expect(result.factors.mission_alignment.score).toBe(CONFIG.baseline.mission_alignment);
    expect(result.factors.capacity_fit.score).toBe(CONFIG.baseline.capacity_fit);
    expect(result.factors.peer_signal.score).toBe(CONFIG.baseline.peer_signal);
    expect(result.factors.mission_alignment.hasData).toBe(false);
  });

  it("lands in Tier C, which reads as needs research, not low priority", () => {
    expect(result.tier).toBe("C");
  });

  it("is marked provisional with low confidence", () => {
    expect(result.factors.confidence.score).toBe(0);
    expect(result.confidenceLabel).toBe("Low");
    expect(result.provisional).toBe(true);
  });
});

describe("mission alignment", () => {
  it("rewards water grants found in the filing", () => {
    const none = scoreCompany(inputs({ filing: filing() })).factors.mission_alignment;
    const some = scoreCompany(
      inputs({ filing: filing({ stats: stats({ waterCount: 4, waterAmount: 900_000 }) }) }),
    ).factors.mission_alignment;
    expect(none.score).toBe(15);
    expect(none.hasData).toBe(true);
    expect(some.score).toBe(35 + 15);
    expect(some.evidence[0].sourceUrl).toBe("https://example.org/filing");
  });

  it("drops the neutral credit once a researcher confirms water is not a priority", () => {
    const result = scoreCompany(
      inputs({ company: company({ research: { ...EMPTY_RESEARCH, waterFocus: "no" } }), filing: filing() }),
    ).factors.mission_alignment;
    expect(result.score).toBe(0);
  });

  it("adds a stated water priority, focus areas and the industry tie", () => {
    const result = scoreCompany(
      inputs({
        company: company({
          industry: "beverage_cpg",
          research: { ...EMPTY_RESEARCH, waterFocus: "yes", focusAreas: ["Youth", "Education"] },
        }),
      }),
    ).factors.mission_alignment;
    expect(result.score).toBe(40 + 16 + 10);
  });

  it("never exceeds 100", () => {
    const result = scoreCompany(
      inputs({
        company: company({
          industry: "beverage_cpg",
          research: { ...EMPTY_RESEARCH, waterFocus: "yes", focusAreas: ["Youth", "Education", "Environment"] },
        }),
        filing: filing({
          stats: stats({ waterCount: 20, waterAmount: 5_000_000, adjacentCount: 60, thirstProjectGrants: 1 }),
        }),
      }),
    ).factors.mission_alignment;
    expect(result.score).toBe(100);
  });
});

describe("peer signal", () => {
  it("scales with the number of distinct water nonprofits supported", () => {
    const score = (rows: PeerRow[]) => scoreCompany(inputs({ peers: rows })).factors.peer_signal.score;
    expect(score([peer("WaterAid")])).toBe(55);
    expect(score([peer("WaterAid"), peer("WaterAid")])).toBe(55);
    expect(score([peer("WaterAid"), peer("Water.org")])).toBe(75);
    expect(score([peer("WaterAid"), peer("Water.org"), peer("charity: water", 200_000)])).toBe(100);
  });

  it("is zero, not baseline, when a filing was checked and nothing was found", () => {
    const result = scoreCompany(inputs({ filing: filing() })).factors.peer_signal;
    expect(result.score).toBe(0);
    expect(result.hasData).toBe(true);
  });

  it("credits an industry where peers already sponsor water nonprofits", () => {
    const result = scoreCompany(inputs({ filing: filing(), industryPeerCompanies: 3 })).factors.peer_signal;
    expect(result.score).toBe(15);
  });
});

describe("capacity fit", () => {
  it("blends giving volume with how many grants are a realistic ask size", () => {
    // $10M giving is band 90. 70 of 100 grants in range caps the fit at 100.
    expect(scoreCompany(inputs({ filing: filing() })).factors.capacity_fit.score).toBe(94);
  });

  it("marks down a foundation that only writes very large checks", () => {
    const result = scoreCompany(
      inputs({ filing: filing({ stats: stats({ buckets: [0, 0, 5, 5, 40, 50] }) }) }),
    ).factors.capacity_fit;
    expect(result.score).toBe(Math.round(90 * 0.6 + 20 * 0.4));
  });

  it("falls back to reported giving, then company size", () => {
    const reported = scoreCompany(
      inputs({ company: company({ research: { ...EMPTY_RESEARCH, annualGivingUsd: 2_000_000 } }) }),
    ).factors.capacity_fit;
    const sized = scoreCompany(
      inputs({ company: company({ research: { ...EMPTY_RESEARCH, sizeBand: "enterprise" } }) }),
    ).factors.capacity_fit;
    expect(reported.score).toBe(70);
    expect(sized.score).toBe(65);
  });
});

describe("accessibility", () => {
  it("reserves 35 points for LA even when contact evidence is already strong", () => {
    const c = company({ domain: "acme.com", research: { ...EMPTY_RESEARCH, applicationProcess: "open", warmIntro: true } });
    const without = scoreCompany(inputs({company: c, filing: filing()})).factors.accessibility.score;
    const withLA = scoreCompany(inputs({company: { ...c, research: { ...c.research, laPresence: "headquarters", laCity: "El Segundo", laCounty: "Los Angeles", laSourceUrl: "https://example.org/office", laVerifiedAt: "2026-11-11", laEvidence: "Headquarters address." } }, filing: filing()})).factors.accessibility.score;
    expect(without).toBe(65); expect(withLA).toBe(100); expect(withLA - without).toBe(35);
  });
  it("reads the application stance from the filing", () => {
    const open = scoreCompany(inputs({ filing: filing() })).factors.accessibility.score;
    const closed = scoreCompany(inputs({ filing: filing({ preselectedOnly: true }) })).factors.accessibility.score;
    expect(open).toBe(35 + 20);
    expect(closed).toBe(5 + 20);
  });

  it("lets manual research override the filing", () => {
    const result = scoreCompany(
      inputs({
        company: company({
          hqState: "CA",
          domain: "acme.com",
          research: { ...EMPTY_RESEARCH, applicationProcess: "open", warmIntro: true },
        }),
        filing: filing({ preselectedOnly: true }),
      }),
    ).factors.accessibility;
    // A California address alone no longer earns local accessibility points.
    expect(result.score).toBe(65);
  });
});

describe("confidence", () => {
  it("is high for a matched foundation with recent grant detail and reviewed research", () => {
    const result = scoreCompany(
      inputs({
        company: company({
          foundation: { status: "matched", ein: "123456789", name: "Acme Foundation" },
          research: {
            ...EMPTY_RESEARCH,
            waterFocus: "no",
            focusAreas: ["Education"],
            applicationProcess: "open",
            sourceUrl: "https://acme.com/impact",
          },
        }),
        filing: filing(),
      }),
    );
    expect(result.factors.confidence.score).toBe(100);
    expect(result.confidenceLabel).toBe("High");
    expect(result.provisional).toBe(false);
  });

  it("drops the recency points for a stale filing", () => {
    const fresh = scoreCompany(inputs({ filing: filing() })).factors.confidence.score;
    const stale = scoreCompany(inputs({ filing: filing({ taxYear: 2019 }) })).factors.confidence.score;
    expect(fresh - stale).toBe(10);
  });
});

describe("overall score", () => {
  it("is the weighted average of the five factors", () => {
    const result = scoreCompany(inputs({ filing: filing() }));
    const { weights } = CONFIG;
    const f = result.factors;
    const expected =
      (weights.mission_alignment * f.mission_alignment.score +
        weights.peer_signal * f.peer_signal.score +
        weights.capacity_fit * f.capacity_fit.score +
        weights.accessibility * f.accessibility.score +
        weights.confidence * f.confidence.score) /
      100;
    expect(result.overall).toBe(Math.round(expected));
  });

  it("follows the weights when they change", () => {
    const onlyCapacity: ScoringConfig = {
      ...CONFIG,
      weights: { mission_alignment: 0, peer_signal: 0, capacity_fit: 5, accessibility: 0, confidence: 0 },
    };
    const result = scoreCompany(inputs({ filing: filing(), config: onlyCapacity }));
    expect(result.overall).toBe(result.factors.capacity_fit.score);
  });

  it("maps to tiers at the configured thresholds", () => {
    expect(tierFor(CONFIG.tiers.A, CONFIG)).toBe("A");
    expect(tierFor(CONFIG.tiers.A - 1, CONFIG)).toBe("B");
    expect(tierFor(CONFIG.tiers.C, CONFIG)).toBe("C");
    expect(tierFor(CONFIG.tiers.C - 1, CONFIG)).toBe("D");
  });

  it("is deterministic", () => {
    const a = scoreCompany(inputs({ filing: filing(), peers: [peer("WaterAid")] }));
    const b = scoreCompany(inputs({ filing: filing(), peers: [peer("WaterAid")] }));
    expect(a).toEqual(b);
  });
});
