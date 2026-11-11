import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { grantStats, MAX_GRANTS_KEPT, parseReturn, trimGrants } from "@/lib/efile";
import type { Grant } from "@/lib/types";

// The real 2024 Form 990-PF of The Coca-Cola Foundation, as published by the IRS.
const xml = readFileSync(path.join(__dirname, "fixtures", "coca-cola-foundation-2024-990pf.xml"), "utf8");
const parsed = parseReturn(xml);

describe("parseReturn on a real 990-PF", () => {
  it("reads the header", () => {
    expect(parsed.formType).toBe("990PF");
    expect(parsed.taxYear).toBe(2024);
    expect(parsed.filerName).toBe("The Coca-Cola Foundation Inc");
  });

  it("reads totals", () => {
    expect(parsed.totalGiving).toBe(116505217);
    expect(parsed.totalAssets).toBeGreaterThan(100_000_000);
  });

  it("reads every grant paid during the year", () => {
    expect(parsed.grants).toHaveLength(246);
    const first = parsed.grants.find((g) => g.recipient === "100 Black Men of America Inc");
    expect(first).toMatchObject({ amount: 300000, place: "Atlanta, GA" });
    expect(first?.purpose).toContain("Youth Leadership Academy");
  });

  it("reads officers without duplicates", () => {
    expect(parsed.officers.length).toBeGreaterThanOrEqual(8);
    expect(parsed.officers[0]).toEqual({ name: "Beatriz Perez", title: "Chair/Director" });
    expect(new Set(parsed.officers.map((o) => o.name)).size).toBe(parsed.officers.length);
  });

  it("detects that the foundation accepts requests", () => {
    expect(parsed.preselectedOnly).toBe(false);
    expect(parsed.applicationContact).toContain("Carlos Pagoaga");
  });

  it("flags water-related grants", () => {
    const stats = grantStats(parsed.grants);
    expect(stats.count).toBe(246);
    expect(stats.waterCount).toBeGreaterThan(0);
    expect(stats.waterAmount).toBeGreaterThan(0);
    expect(stats.buckets.reduce((a, b) => a + b, 0)).toBe(246);
  });
});

describe("parseReturn on a 990 with Schedule I", () => {
  const scheduleI = `<?xml version="1.0"?>
  <Return xmlns="http://www.irs.gov/efile"><ReturnHeader><TaxPeriodEndDt>2023-12-31</TaxPeriodEndDt>
  <ReturnTypeCd>990</ReturnTypeCd><Filer><BusinessName><BusinessNameLine1Txt>EXAMPLE ACTION FUND</BusinessNameLine1Txt></BusinessName></Filer>
  </ReturnHeader><ReturnData><IRS990><CYGrantsAndSimilarPaidAmt>75000</CYGrantsAndSimilarPaidAmt>
  <Form990PartVIISectionAGrp><PersonNm>JANE DOE</PersonNm><TitleTxt>PRESIDENT</TitleTxt></Form990PartVIISectionAGrp></IRS990>
  <IRS990ScheduleI><RecipientTable><RecipientBusinessName><BusinessNameLine1Txt>WATER FOR PEOPLE</BusinessNameLine1Txt></RecipientBusinessName>
  <USAddress><CityNm>DENVER</CityNm><StateAbbreviationCd>CO</StateAbbreviationCd></USAddress>
  <CashGrantAmt>75000</CashGrantAmt><PurposeOfGrantTxt>General support</PurposeOfGrantTxt></RecipientTable></IRS990ScheduleI>
  </ReturnData></Return>`;

  it("reads grants, officers and the peer match", () => {
    const result = parseReturn(scheduleI);
    expect(result.formType).toBe("990");
    expect(result.taxYear).toBe(2023);
    expect(result.totalGiving).toBe(75000);
    expect(result.officers).toEqual([{ name: "Jane Doe", title: "President" }]);
    expect(result.grants[0]).toMatchObject({
      recipient: "Water for People",
      place: "Denver, CO",
      water: true,
      peer: "Water For People",
    });
    expect(result.preselectedOnly).toBeNull();
  });
});

describe("a preselected-only foundation", () => {
  it("is flagged", () => {
    const result = parseReturn(`<Return><ReturnHeader><ReturnTypeCd>990PF</ReturnTypeCd><TaxYr>2023</TaxYr></ReturnHeader>
      <ReturnData><IRS990PF><SupplementaryInformationGrp><OnlyContriToPreselectedInd>X</OnlyContriToPreselectedInd>
      </SupplementaryInformationGrp></IRS990PF></ReturnData></Return>`);
    expect(result.preselectedOnly).toBe(true);
    expect(result.grants).toEqual([]);
  });
});

describe("trimGrants", () => {
  const grant = (amount: number, water = false): Grant => ({
    recipient: `Org ${amount}`,
    purpose: "",
    amount,
    place: "",
    water,
    adjacent: false,
    peer: null,
  });

  it("keeps small water grants that would otherwise be cut", () => {
    const grants = Array.from({ length: MAX_GRANTS_KEPT + 50 }, (_, i) => grant(1000 + i));
    grants.push(grant(5, true));
    const result = trimGrants(grants);
    expect(result.truncated).toBe(true);
    expect(result.grants).toHaveLength(MAX_GRANTS_KEPT + 1);
    expect(result.grants.some((g) => g.amount === 5)).toBe(true);
  });

  it("leaves short lists alone, largest first", () => {
    const result = trimGrants([grant(1), grant(3), grant(2)]);
    expect(result.truncated).toBe(false);
    expect(result.grants.map((g) => g.amount)).toEqual([3, 2, 1]);
  });
});

describe("a foundation that attaches its grant list as a PDF", () => {
  it("drops the placeholder row and says so", () => {
    const result = parseReturn(`<Return><ReturnHeader><ReturnTypeCd>990PF</ReturnTypeCd><TaxYr>2024</TaxYr></ReturnHeader>
      <ReturnData><IRS990PF><ContriPaidRevAndExpnssAmt>2263812</ContriPaidRevAndExpnssAmt>
      <GrantOrContributionPdDurYrGrp><RecipientBusinessName><BusinessNameLine1Txt>See Statement 12</BusinessNameLine1Txt>
      </RecipientBusinessName><Amt>2263812</Amt></GrantOrContributionPdDurYrGrp></IRS990PF></ReturnData></Return>`);
    expect(result.grants).toEqual([]);
    expect(result.grantsInAttachment).toBe(true);
    expect(result.totalGiving).toBe(2263812);
  });
});
