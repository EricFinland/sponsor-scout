import { describe, expect, it } from "vitest";
import config from "@data/weights.json";
import { laFieldsFrom, pickRecord } from "@/lib/public-record";
import { PROFILE_FIT_COLUMNS, SHEET_COLUMNS } from "@/lib/sheet-schema";
import { researchFromRow, researchToRow } from "@/lib/sheet-data";
import { withoutColumns } from "@/lib/mutations";
import { ethicsCeiling, scoreCompany } from "@/lib/scoring";
import type { Company, Research, ScoreInputs, ScoringConfig } from "@/lib/types";
import { EMPTY_RESEARCH } from "@/lib/types";

const CONFIG = config as ScoringConfig;

// A company with no foundation: the case these signals exist for.
function company(research: Partial<Research> = {}): Company {
  return {
    slug: "acme",
    name: "Acme",
    industry: "other",
    domain: "",
    hqState: "",
    foundation: { status: "none_found", ein: null, name: null },
    research: { ...EMPTY_RESEARCH, ...research },
  };
}

function score(research: Partial<Research> = {}, overrides: Partial<ScoreInputs> = {}) {
  return scoreCompany({
    company: company(research),
    filing: null,
    peers: [],
    industryPeerCompanies: 0,
    config: CONFIG,
    asOfYear: 2026,
    ...overrides,
  });
}

describe("past nonprofit work", () => {
  it("lifts peer signal above the unresearched baseline", () => {
    const none = score().factors.peer_signal;
    const two = score({ nonprofitPartners: ["Boys & Girls Clubs", "LA Food Bank"] }).factors.peer_signal;
    const three = score({ nonprofitPartners: ["A", "B", "C"] }).factors.peer_signal;
    expect(none.hasData).toBe(false);
    expect(two.score).toBe(30);
    expect(two.score).toBeGreaterThan(none.score);
    expect(three.score).toBe(40);
    expect(two.hasData).toBe(true);
  });

  it("counts each partner once", () => {
    expect(score({ nonprofitPartners: ["A", "A", " A ", ""] }).factors.peer_signal.score).toBe(30);
  });
});

describe("CSR and giving programs", () => {
  it("adds CSR reporting and values commitments to mission alignment", () => {
    const result = score({ csrReport: "yes", ethicsCredentials: ["Certified B Corporation", "1% for the Planet member", "UN Global Compact participant"] });
    const lines = result.factors.mission_alignment.evidence.map((e) => e.points);
    expect(lines).toContain(10);
    expect(result.factors.mission_alignment.hasData).toBe(true);
    // Commitments cap at +10, plus the 15 held for unreviewed priorities.
    expect(result.factors.mission_alignment.score).toBe(10 + 10 + 15);
  });

  it("adds giving programs to capacity when there is no filing", () => {
    const base = score({ sizeBand: "large" }).factors.capacity_fit.score;
    const withPrograms = score({ sizeBand: "large", givingPrograms: ["Corporate grants", "Event sponsorships", "Cause marketing", "In-kind donations"] }).factors.capacity_fit.score;
    expect(withPrograms - base).toBe(15);
  });

  it("credits event sponsorships and matching gifts as ways in", () => {
    const base = score({ applicationProcess: "open" }).factors.accessibility.score;
    const withPrograms = score({ applicationProcess: "open", givingPrograms: ["Event sponsorships", "Employee matching gifts"] }).factors.accessibility.score;
    expect(withPrograms - base).toBe(15);
  });
});

describe("ethics screen", () => {
  const strong: Partial<Research> = {
    waterFocus: "yes",
    focusAreas: ["Youth", "Education"],
    applicationProcess: "open",
    warmIntro: true,
    nonprofitPartners: ["A", "B", "C"],
    csrReport: "yes",
    givingPrograms: ["Corporate grants", "Event sponsorships", "Cause marketing"],
    annualGivingUsd: 20_000_000,
    sourceUrl: "https://example.org/impact",
  };

  it("leaves a clear company uncapped", () => {
    const result = score({ ...strong, ethicsCheck: "clear" });
    expect(result.tier).toBe("A");
    expect(result.ethics).toEqual({ check: "clear", uncapped: result.overall, capped: false });
  });

  it("holds a company with a concern below Tier A", () => {
    const result = score({ ...strong, ethicsCheck: "review" });
    expect(result.ethics.uncapped).toBeGreaterThanOrEqual(CONFIG.tiers.A);
    expect(result.overall).toBe(CONFIG.tiers.A - 1);
    expect(result.tier).toBe("B");
    expect(result.ethics.capped).toBe(true);
  });

  it("drops a company that is not a fit to Tier D", () => {
    const result = score({ ...strong, ethicsCheck: "conflict" });
    expect(result.overall).toBe(CONFIG.tiers.C - 1);
    expect(result.tier).toBe("D");
  });

  it("follows the tier cutoffs in the weights", () => {
    const custom = { ...CONFIG, tiers: { A: 80, B: 60, C: 40 } };
    expect(ethicsCeiling("review", custom)).toBe(79);
    expect(ethicsCeiling("conflict", custom)).toBe(39);
    expect(ethicsCeiling("unknown", custom)).toBe(100);
  });

  it("counts a completed screen toward confidence", () => {
    const before = score().factors.confidence.score;
    expect(score({ ethicsCheck: "clear" }).factors.confidence.score - before).toBe(10);
  });
});

describe("a company with no foundation, fully researched", () => {
  it("reaches High confidence and is no longer provisional", () => {
    const result = score({
      waterFocus: "no",
      focusAreas: ["Youth"],
      applicationProcess: "open",
      annualGivingUsd: 500_000,
      sourceUrl: "https://example.org/impact",
      nonprofitPartners: ["A"],
      csrReport: "yes",
      givingPrograms: ["Event sponsorships"],
      ethicsCheck: "clear",
    });
    expect(result.confidenceLabel).toBe("High");
    expect(result.provisional).toBe(false);
  });
});

describe("Sheet storage", () => {
  it("round-trips the new fields through a Profiles row", () => {
    const research: Research = {
      ...EMPTY_RESEARCH,
      csrReport: "yes",
      givingPrograms: ["Corporate grants", "Event sponsorships"],
      nonprofitPartners: ["Boys & Girls Clubs"],
      ethicsCredentials: ["Certified B Corporation"],
      ethicsCheck: "review",
      ethicsNotes: "Water-use dispute in 2023.",
      ethicsSourceUrl: "https://example.org/news",
    };
    const row = researchToRow("acme", research);
    expect(row.givingPrograms).toBe("Corporate grants; Event sponsorships");
    expect(researchFromRow(row)).toMatchObject(research);
  });

  it("reads an older row without the new columns as unresearched", () => {
    expect(researchFromRow({ slug: "acme", waterFocus: "yes" })).toMatchObject({
      csrReport: "unknown",
      givingPrograms: [],
      nonprofitPartners: [],
      ethicsCheck: "unknown",
    });
  });

  it("lists every new column in the Profiles schema", () => {
    for (const column of PROFILE_FIT_COLUMNS) expect(SHEET_COLUMNS.Profiles).toContain(column);
  });

  it("strips only the new columns, and only from Profiles, for an older Sheet", () => {
    const ops = withoutColumns(
      [
        { tab: "Profiles", key: "acme", row: { slug: "acme", notes: "Keep", ethicsCheck: "clear" } },
        { tab: "Outreach Tracker", key: "1", row: { id: "1", notes: "Keep" } },
      ],
      "Profiles",
      PROFILE_FIT_COLUMNS,
    );
    expect(ops[0].row).toEqual({ slug: "acme", notes: "Keep" });
    expect(ops[1].row).toEqual({ id: "1", notes: "Keep" });
  });
});

describe("Wikidata headquarters match", () => {
  const candidates = [
    { id: "Q1", label: "Patagonia", description: "region of South America" },
    { id: "Q2", label: "Patagonia Bank", description: "bank" },
    { id: "Q3", label: "Patagonia, Inc.", description: "outdoor clothing company" },
  ];

  it("prefers the candidate whose official website matches the company's domain", () => {
    const record = pickRecord(
      candidates,
      [
        { item: "http://www.wikidata.org/entity/Q2", site: "https://patagoniabank.example", hqLabel: "Buenos Aires" },
        { item: "http://www.wikidata.org/entity/Q3", site: "https://www.patagonia.com/", hqLabel: "Ventura", county: "http://www.wikidata.org/entity/Q108127" },
      ],
      "patagonia.com",
    );
    expect(record).toMatchObject({ qid: "Q3", hqCity: "Ventura", county: "Ventura", matchedBy: "website" });
  });

  it("ignores places, which never reach the organization rows", () => {
    expect(pickRecord(candidates.slice(0, 1), [], "")).toBeNull();
  });

  it("falls back to the best-ranked organization when no website matches", () => {
    const record = pickRecord(candidates, [{ item: "http://www.wikidata.org/entity/Q2", hqLabel: "Buenos Aires" }], "patagonia.com");
    expect(record).toMatchObject({ qid: "Q2", county: null, matchedBy: "name" });
  });

  it("prefers an LA County headquarters when a company lists several", () => {
    const record = pickRecord(
      [{ id: "Q9", label: "Snap Inc.", description: "" }],
      [
        { item: "http://www.wikidata.org/entity/Q9", hqLabel: "Denver" },
        { item: "http://www.wikidata.org/entity/Q9", hqLabel: "Santa Monica", county: "http://www.wikidata.org/entity/Q104994" },
      ],
      "",
    );
    expect(record).toMatchObject({ hqCity: "Santa Monica", county: "Los Angeles" });
  });

  it("fills LA fields that pass the existing LA rules", () => {
    const fields = laFieldsFrom(
      { qid: "Q9", label: "Snap Inc.", description: "", url: "https://www.wikidata.org/wiki/Q9", website: null, hqCity: "Santa Monica", county: "Los Angeles", matchedBy: "website" },
      "2026-11-13",
    );
    expect(fields).toMatchObject({ laPresence: "headquarters", laCity: "Santa Monica", laCounty: "Los Angeles", laVerifiedAt: "2026-11-13" });
    expect(fields?.laSourceUrl).toMatch(/^https:\/\//);
    expect(fields?.laEvidence).toContain("Santa Monica");
  });

  it("offers nothing to fill for a headquarters outside the LA area", () => {
    expect(
      laFieldsFrom({ qid: "Q5", label: "Target", description: "", url: "https://www.wikidata.org/wiki/Q5", website: null, hqCity: "Minneapolis", county: null, matchedBy: "website" }, "2026-11-13"),
    ).toBeNull();
  });
});
