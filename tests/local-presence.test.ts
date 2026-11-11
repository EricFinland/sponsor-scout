import { describe, expect, it } from "vitest";
import { localPresence, LA_POINTS } from "@/lib/local-presence";
import { EMPTY_RESEARCH, type Research } from "@/lib/types";

const evidence: Research = { ...EMPTY_RESEARCH, laPresence: "headquarters", laCity: "El Segundo", laCounty: "Los Angeles", laSourceUrl: "https://example.org/locations", laVerifiedAt: "2026-11-11", laEvidence: "Corporate headquarters at a documented local address." };
describe("objective LA accessibility", () => {
  it.each(["headquarters", "office", "operations", "retail"] as const)("awards the documented %s tier", (kind) => {
    expect(localPresence({ ...evidence, laPresence: kind }, 2026)).toMatchObject({ points: LA_POINTS[kind], verified: true });
  });
  it("does not grant LA points for a California address alone", () => {
    expect(localPresence(EMPTY_RESEARCH, 2026).points).toBe(0);
    expect(localPresence({ ...evidence, laCounty: "San Francisco" }, 2026).points).toBe(0);
  });
  it.each(["Orange", "Ventura", "Riverside", "San Bernardino"])("recognizes a regional office in %s County", (county) => {
    expect(localPresence({ ...evidence, laPresence: "regional", laCounty: county }, 2026).points).toBe(15);
  });
  it.each([{ laSourceUrl: "" }, { laSourceUrl: "javascript:alert(1)" }, { laVerifiedAt: "2024-11-11" }, { laVerifiedAt: "2027-01-01" }, { laVerifiedAt: "2026-99-99" }, { laVerifiedAt: "2026-02-30" }, { laCity: "" }, { laEvidence: "" }])("withholds unverified or stale location points: %j", (patch) => {
    expect(localPresence({ ...evidence, ...patch }, 2026).points).toBe(0);
  });
  it("accepts a review from the previous calendar year and county suffixes", () => {
    expect(localPresence({ ...evidence, laVerifiedAt: "2025-01-01", laCounty: "Los Angeles County" }, 2026).points).toBe(35);
  });
  it("distinguishes an unknown location from a researched absence", () => {
    expect(localPresence(EMPTY_RESEARCH, 2026).verified).toBe(false);
    expect(localPresence({ ...evidence, laPresence: "none" }, 2026)).toMatchObject({ points: 0, verified: true });
  });
});
