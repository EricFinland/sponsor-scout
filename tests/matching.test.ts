import { describe, expect, it } from "vitest";
import { isAdjacentCause, isWaterRelated, matchPeerNonprofit } from "@/lib/keywords";
import { normalizeName, sameCompany, slugify, splitPersonName, tidyOrgName, tidyPersonName, withCompanyCasing } from "@/lib/names";
import { matchScore } from "@/lib/propublica";

describe("company names", () => {
  it("ignores punctuation and corporate suffixes", () => {
    expect(normalizeName("The Coca-Cola Company")).toBe("coca cola");
    expect(sameCompany("Patagonia, Inc.", "patagonia")).toBe(true);
    expect(sameCompany("Procter & Gamble", "Procter and Gamble Co")).toBe(true);
    expect(sameCompany("Nike", "Nikon")).toBe(false);
    expect(slugify("Keurig Dr Pepper Inc.")).toBe("keurig-dr-pepper");
  });

  it("tidies names that filings print in capitals", () => {
    expect(tidyPersonName("CARLOS PAGOAGA")).toBe("Carlos Pagoaga");
    expect(tidyPersonName("Beatriz Perez")).toBe("Beatriz Perez");
    expect(tidyOrgName("BOYS AND GIRLS CLUBS OF AMERICA")).toBe("Boys and Girls Clubs of America");
    expect(tidyOrgName("charity: water")).toBe("charity: water");
    expect(tidyOrgName("Bank Of America Charitable Foundation Inc")).toBe("Bank of America Charitable Foundation Inc");
    expect(withCompanyCasing("Pepsico Foundation Inc", "PepsiCo")).toBe("PepsiCo Foundation Inc");
    expect(withCompanyCasing("Rei Cooperative Action Fund", "REI")).toBe("REI Cooperative Action Fund");
    expect(splitPersonName("JAMES R QUINCEY JR")).toEqual({ first: "James", last: "Quincey" });
  });
});

describe("water keyword rules", () => {
  it("matches water, sanitation and hygiene work", () => {
    expect(isWaterRelated("WaterAid America", "")).toBe(true);
    expect(isWaterRelated("Global Fund", "Clean drinking water access in Kenya")).toBe(true);
    expect(isWaterRelated("Global Fund", "WASH programming in schools")).toBe(true);
    expect(isWaterRelated("Great Basin Water Network", "")).toBe(true);
  });

  it("does not match place names and lookalikes", () => {
    expect(isWaterRelated("University of Waterloo", "Scholarships")).toBe(false);
    expect(isWaterRelated("Clearwater Arts Council", "General support")).toBe(false);
    expect(isWaterRelated("Water Street Rescue Mission", "Shelter operations")).toBe(false);
    expect(isWaterRelated("Car wash fundraiser committee", "Wash the cars")).toBe(false);
    expect(isWaterRelated("Wells Fargo Regional Foundation", "Housing")).toBe(false);
    expect(isWaterRelated("Edible Schoolyard Project Dba Alice Waters", "")).toBe(false);
  });

  it("treats river and watershed conservation as a neighboring cause", () => {
    expect(isWaterRelated("The Nature Conservancy", "Watershed restoration")).toBe(false);
    expect(isAdjacentCause("The Nature Conservancy", "Watershed restoration")).toBe(true);
    expect(isAdjacentCause("Columbia Riverkeeper", "")).toBe(true);
  });

  it("recognizes neighboring causes", () => {
    expect(isAdjacentCause("Boys and Girls Club", "Youth leadership")).toBe(true);
    expect(isAdjacentCause("City Opera", "Season sponsorship")).toBe(false);
  });
});

describe("peer nonprofit matching", () => {
  it("matches known water nonprofits by name or legal name", () => {
    expect(matchPeerNonprofit("charity: water")).toBe("charity: water");
    expect(matchPeerNonprofit("Charity Global Inc")).toBe("charity: water");
    expect(matchPeerNonprofit("WATER.ORG INC")).toBe("Water.org");
    expect(matchPeerNonprofit("Water for People")).toBe("Water For People");
  });

  it("does not match unrelated organizations", () => {
    expect(matchPeerNonprofit("American Red Cross")).toBeNull();
    expect(matchPeerNonprofit("Waterkeeper Alliance")).toBeNull();
  });
});

describe("foundation candidate ranking", () => {
  it("puts the corporate foundation ahead of lookalikes", () => {
    const foundation = matchScore("Coca-Cola", "The Coca-cola Foundation Inc");
    const scholars = matchScore("Coca-Cola", "Coca-cola Scholars Foundation Inc");
    const unrelated = matchScore("Coca-Cola", "Cola Family Trust");
    expect(foundation).toBeGreaterThan(scholars);
    expect(scholars).toBeGreaterThan(unrelated);
    expect(foundation).toBeGreaterThanOrEqual(90);
  });
});
