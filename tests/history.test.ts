import { describe, expect, it } from "vitest";
import { importHistory } from "@/lib/import-history";
import { scoreCompany } from "@/lib/scoring";
import { sponsorshipHistory } from "@/lib/sponsorships";
import { EMPTY_RESEARCH, type Company, type ScoringConfig, type Sponsorship } from "@/lib/types";
import config from "@data/weights.json";

const source = "https://example.org/history";
const gift: Sponsorship = { id: "source-row-3", company: "Acme", year: 2026, amountUsd: 10000, event: "Thirst Project gala", relationship: "Gala sponsorship", sourceUrl: source, sourceRow: 3, originalName: "Acme" };
const company: Company = { slug: "acme", name: "Acme", industry: "other", domain: "", hqState: "", foundation: {status: "unverified", ein: null, name: null}, research: { ...EMPTY_RESEARCH }, sponsorships: [gift] };
const score = (c: Company) => scoreCompany({ company: c, filing: null, peers: [], industryPeerCompanies: 0, config: config as ScoringConfig, asOfYear: 2026 });

describe("historical sponsorship import", () => {
  it("normalizes whitespace and verified UTA aliases without merging ambiguous Paramount identities", () => {
    const imported = importHistory([{row: 1, name: "2026", amount: null}, {row: 2, name: "UTA ", amount: 5000}, {row: 3, name: "United Talent Agency", amount: 2500}, {row: 4, name: "Paramount", amount: 10000}, {row: 5, name: "Paramount Pictures", amount: 10000}], source, 2026);
    expect(imported.companies.map((c) => c.name)).toEqual(["United Talent Agency", "Paramount", "Paramount Pictures"]);
    expect(imported.sponsorships.reduce((n, s) => n + s.amountUsd, 0)).toBe(27500);
  });
  it("retains personal gifts and event notes for review without creating corporate profiles", () => {
    const imported = importHistory([{row: 1, name: "2025", amount: null}, {row: 2, name: "Alex Example", amount: 1234, entityKind: "person_or_family"}, {row: 3, name: "NO GALA", amount: null}], source, 2026);
    expect(imported.companies).toEqual([]); expect(imported.review).toHaveLength(2);
  });
  it("does not infer a foundation from an individual with a similar name", () => {
    const imported = importHistory([{row: 1, name: "2026", amount: null}, {row: 2, name: "Alex Example Foundation", amount: 10000}, {row: 3, name: "Alex Example", amount: 20000, entityKind: "person_or_family"}], source, 2026);
    expect(imported.sponsorships).toHaveLength(1); expect(imported.sponsorships[0].amountUsd).toBe(10000);
  });
  it("rejects future-year and invalid amounts without silently turning them into zero", () => {
    expect(importHistory([{row: 1, name: "2027", amount: null}, {row: 2, name: "Acme", amount: 5000}], source, 2026).sponsorships).toHaveLength(0);
    expect(importHistory([{row: 1, name: "2026", amount: null}, {row: 2, name: "Acme", amount: NaN}], source, 2026).sponsorships).toHaveLength(0);
  });
});
describe("sponsorship evidence in ranking", () => {
  it("uses a recent actual sponsorship amount without treating it as annual giving", () => {
    const result = score(company);
    expect(result.factors.capacity_fit.score).toBe(70);
    expect(result.factors.capacity_fit.evidence[0].text).toContain("not an annual giving budget");
    expect(result.factors.peer_signal.score).toBe(config.baseline.peer_signal);
  });
  it("does not sum several years to inflate capacity", () => {
    expect(score({ ...company, sponsorships: [gift, { ...gift, id: "old", year: 2025 }] }).factors.capacity_fit.score).toBe(70);
  });
  it("uses the largest recent gift and stops at the three-calendar-year boundary", () => {
    expect(score({ ...company, sponsorships: [{ ...gift, year: 2024, amountUsd: 25000 }] }).factors.capacity_fit.score).toBe(85);
    expect(score({ ...company, sponsorships: [{ ...gift, year: 2023, amountUsd: 25000 }] }).factors.capacity_fit.hasData).toBe(false);
  });
  it("keeps historical relationship evidence without assuming a warm introduction", () => {
    const evidence = score(company).factors.accessibility.evidence;
    expect(evidence.some((e) => e.text.includes("active contact or warm introduction has not been assumed"))).toBe(true);
  });
  it("filters duplicates and malformed or future evidence", () => {
    expect(sponsorshipHistory({ ...company, sponsorships: [gift, gift, {...gift, id: "future", year: 2027}, {...gift, id: "negative", amountUsd: -1}] }, 2026)).toHaveLength(1);
  });
});
