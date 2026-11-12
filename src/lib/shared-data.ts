import { createHash } from "node:crypto";
import { unstable_cache, revalidateTag } from "next/cache";
import { sheetRequest } from "./sheets";
import { decodeDataset } from "./sheet-data";
import type { SheetTab, SheetTables } from "./sheet-schema";
import type { Filing, FilingSummary, ScoringConfig } from "./types";

// Deduplicate concurrent misses as the navigation prefetches its main pages.
const inFlight = new Map<string, Promise<unknown>>();
export function coalesce<T>(key: string, work: () => Promise<T>): Promise<T> {
  const current = inFlight.get(key); if (current) return current as Promise<T>;
  const promise = work().finally(() => { if (inFlight.get(key) === promise) inFlight.delete(key); });
  inFlight.set(key, promise); return promise;
}
function workspaceKey() {
  return createHash("sha256").update(`${process.env.SHEET_WEBHOOK_URL}\n${process.env.SHEET_WEBHOOK_SECRET}`).digest("hex").slice(0, 24);
}
function cached<T>(purpose: string, tabs: SheetTab[], work: () => Promise<T>): Promise<T> {
  const scope = workspaceKey();
  return unstable_cache(() => coalesce(`${scope}:${purpose}`, work), ["sponsor-scout-v3", scope, purpose], {
    revalidate: 60, tags: [`sheet:${scope}`, ...tabs.map((tab) => `sheet:${scope}:${tab}`)],
  })();
}
/** Called only after authentication. No cookie or request data enters the cache. */
export function sharedCatalog(defaults: ScoringConfig) {
  return cached("catalog", ["Companies", "Profiles", "Peers", "Sponsorships", "Weights", "Filings", "Outreach Tracker", "Search Log"], async () => {
    const result = await sheetRequest<{tables: SheetTables; summaries: Record<string, FilingSummary>}>("catalog");
    return { ...decodeDataset(result.tables, defaults), summaries: result.summaries, tables: result.tables };
  });
}
export function sharedFiling(ein: string) {
  return cached(`filing:${ein}`, ["Filings"], () => sheetRequest<Filing | null>("filing", { ein }));
}
export function invalidateSheetData(tabs?: SheetTab[]) {
  const scope = workspaceKey();
  if (!tabs) revalidateTag(`sheet:${scope}`, { expire: 0 });
  else for (const tab of new Set(tabs)) revalidateTag(`sheet:${scope}:${tab}`, { expire: 0 });
}
