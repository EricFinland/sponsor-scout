import { createHash } from "node:crypto";
import { decodeDataset } from "./sheet-data";
import { peersForCompany, industryPeerCompanies } from "./peers";
import { scoreCompany } from "./scoring";
import type { SheetTables, SheetRow } from "./sheet-schema";
import type { ScoringConfig } from "./types";

export function sheetConfigured() { return Boolean(process.env.SHEET_WEBHOOK_URL); }

export async function sheetRequest<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const url = process.env.SHEET_WEBHOOK_URL, secret = process.env.SHEET_WEBHOOK_SECRET;
  if (!url || !secret) throw new Error("Google Sheets storage is not configured.");
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, secret, ...payload }), cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`Google Sheets returned HTTP ${response.status}. No shared save was confirmed.`);
  let result: { ok?: boolean; error?: string; data?: T; code?: string };
  try { result = await response.json(); } catch { throw new Error("The Sheet endpoint did not return JSON. Check the Apps Script deployment."); }
  if (!result.ok) throw new Error(result.error ?? "The Sheet rejected this request.");
  return result.data as T;
}

export async function readSheet(defaults: ScoringConfig) {
  const tables = await sheetRequest<SheetTables>("read");
  return { ...decodeDataset(tables, defaults), tables };
}

export function scoreRows(dataset: ReturnType<typeof decodeDataset>, asOfYear: number) {
  const scoredAt = new Date().toISOString();
  const inputHash = createHash("sha256").update(JSON.stringify({ ...dataset, asOfYear })).digest("hex");
  const rows: SheetRow[] = dataset.companies.map((company) => {
    const filing = company.foundation.ein ? dataset.filings[company.foundation.ein] ?? null : null;
    const result = scoreCompany({ company, filing, peers: peersForCompany(company, dataset.peers, filing),
      industryPeerCompanies: industryPeerCompanies(company, dataset.peers), config: dataset.config, asOfYear });
    return { slug: company.slug, company: company.name, overall: result.overall, tier: result.tier,
      ...Object.fromEntries(Object.entries(result.factors).map(([key, factor]) => [key, factor.score])),
      confidenceLabel: result.confidenceLabel, provisional: result.provisional, scoredAt, inputHash };
  });
  return { rows, summary: ["A", "B", "C", "D"].map((tier) => ({ tier, companies: rows.filter((r) => r.tier === tier).length,
    provisional: rows.filter((r) => r.tier === tier && r.provisional).length, scoredAt })), inputHash };
}
