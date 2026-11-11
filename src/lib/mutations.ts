import { SHEET_COLUMNS, type SheetTab, type SheetRow } from "./sheet-schema";

export interface SheetOperation { tab: SheetTab; key: string; row?: SheetRow; delete?: boolean; expectedVersion?: string | null }
const WRITABLE = new Set<SheetTab>(["Companies", "Profiles", "Weights", "Outreach Tracker", "Search Log", "Filings"]);
const KEYS: Partial<Record<SheetTab, string>> = { Companies: "slug", Profiles: "slug", Weights: "id", "Outreach Tracker": "id", "Search Log": "id", Filings: "id" };
export function validateOperations(value: unknown): SheetOperation[] {
  if (!Array.isArray(value) || !value.length || value.length > 50) throw new Error("Send between 1 and 50 changes.");
  return value.map((op) => {
    if (!op || typeof op !== "object" || !WRITABLE.has(op.tab) || typeof op.key !== "string" || !op.key || op.key.length > 200) throw new Error("Invalid storage change.");
    if (op.expectedVersion !== undefined && op.expectedVersion !== null && typeof op.expectedVersion !== "string") throw new Error("Invalid record version.");
    if (op.delete) {
      if (!["Companies", "Profiles", "Outreach Tracker"].includes(op.tab)) throw new Error("This table cannot be deleted from the app.");
      return { tab: op.tab, key: op.key, delete: true, expectedVersion: op.expectedVersion ?? null };
    }
    if (!op.row || typeof op.row !== "object" || Array.isArray(op.row)) throw new Error("Missing row data.");
    const allowed = SHEET_COLUMNS[op.tab as SheetTab] as readonly string[];
    const row: SheetRow = {};
    for (const [key, value] of Object.entries(op.row)) {
      if (!allowed.includes(key) || key === "version") continue;
      if (value !== null && !["string", "number", "boolean"].includes(typeof value)) throw new Error(`Invalid value for ${key}.`);
      if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`Invalid number for ${key}.`);
      if (typeof value === "string" && value.length > (op.tab === "Filings" ? 25000 : 5000)) throw new Error(`The ${key} value is too long.`);
      row[key] = value as SheetRow[string];
    }
    if (String(row[KEYS[op.tab as SheetTab]!] ?? "") !== op.key) throw new Error("The row key does not match its change.");
    return { tab: op.tab, key: op.key, row, expectedVersion: op.expectedVersion ?? null };
  });
}
