import { afterEach, describe, expect, it, vi } from "vitest";
import { createSession, sameOrigin, validAccessKey, verifySession } from "@/lib/auth";
import { configFromRows, configToRows, filingRows, outreachFromRow, researchFromRow } from "@/lib/sheet-data";
import { validateOperations } from "@/lib/mutations";
import { sheetRequest } from "@/lib/sheets";
import config from "@data/weights.json";
import type { ScoringConfig, Filing } from "@/lib/types";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("team sessions", () => {
  it("rejects wrong credentials, forged cookies, expired sessions and weak configuration", () => {
    vi.stubEnv("TEAM_ACCESS_KEY", "a-sufficiently-long-test-only-team-key");
    expect(validAccessKey("wrong")).toBe(false); expect(validAccessKey(process.env.TEAM_ACCESS_KEY!)).toBe(true);
    const cookie = createSession(1_000_000);
    expect(verifySession(cookie, 1_000_000)).toBe(true);
    expect(verifySession(cookie + "x", 1_000_000)).toBe(false);
    expect(verifySession(cookie, 1_000_000 + 8 * 3600 * 1000)).toBe(false);
    vi.stubEnv("TEAM_ACCESS_KEY", "short"); expect(verifySession(cookie, 1_000_000)).toBe(false);
  });
  it("requires same-origin writes", () => {
    expect(sameOrigin(new Request("https://app.example/api/workspace", {headers: {origin: "https://evil.example"}}))).toBe(false);
    expect(sameOrigin(new Request("https://app.example/api/workspace", {headers: {origin: "https://app.example"}}))).toBe(true);
    expect(sameOrigin(new Request("http://localhost:3210/api/workspace", {headers: {origin: "http://127.0.0.1:3210", host: "127.0.0.1:3210"}}))).toBe(true);
    expect(sameOrigin(new Request("http://localhost:3210/api/workspace", {headers: {origin: "http://evil.example", host: "127.0.0.1:3210"}}))).toBe(false);
  });
});
describe("sheet data boundaries", () => {
  it("normalizes numeric Sheet IDs so outreach can be edited or removed after reload", () => {
    const row = outreachFromRow({id:1794433000000,company:"Acme",date:"2026-11-11",status:"Drafted"});
    expect(row.id).toBe("1794433000000");
    expect(validateOperations([{tab:"Outreach Tracker",key:row.id,row:{...row,status:"Replied"}}])).toHaveLength(1);
    expect(validateOperations([{tab:"Outreach Tracker",key:row.id,delete:true}])).toHaveLength(1);
  });
  it("round-trips editable weights and rejects broken tier ordering and all-zero weights", () => {
    expect(configFromRows(configToRows(config as ScoringConfig), config as ScoringConfig)).toEqual(config);
    expect(() => configFromRows([{section: "tiers", key: "A", value: 1}], config as ScoringConfig)).toThrow("Tier cutoffs");
    expect(() => configFromRows(Object.keys(config.weights).map((key) => ({section: "weights", key, value: 0})), config as ScoringConfig)).toThrow("greater than zero");
  });
  it("preserves unknown versus actual zero and checkbox values", () => {
    expect(researchFromRow({annualGivingUsd: "", warmIntro: "FALSE"}).annualGivingUsd).toBeNull();
    expect(researchFromRow({annualGivingUsd: 0, warmIntro: "FALSE"})).toMatchObject({annualGivingUsd: 0, warmIntro: false});
  });
  it("chunks large filings below the Google Sheets cell size limit without data loss", () => {
    const filing = {ein: "012345678", grants: [], padding: "x".repeat(60000)} as unknown as Filing;
    const rows = filingRows(filing); expect(rows).toHaveLength(3);
    expect(rows.every((r) => String(r.payload).length <= 25000)).toBe(true);
    expect(JSON.parse(rows.map((r) => r.payload).join(""))).toEqual(filing);
  });
  it("does not allow public callers to target source history, derived scores or unknown tables", () => {
    expect(() => validateOperations([{tab: "Source History", key: "1", row: {}}])).toThrow();
    expect(() => validateOperations([{tab: "Scores", key: "acme", row: {}}])).toThrow();
    expect(() => validateOperations([{tab: "Profiles", key: "acme", row: {slug: "other"}}])).toThrow("key");
  });
  it("does not falsely report a rejected webhook write as success", async () => {
    vi.stubEnv("SHEET_WEBHOOK_URL", "https://example.org/script"); vi.stubEnv("SHEET_WEBHOOK_SECRET", "test-only");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ok:false,error:"Conflict: changed by another editor"}), {status:200})));
    await expect(sheetRequest("mutate", {})).rejects.toThrow("Conflict");
  });
});
