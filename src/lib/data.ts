import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import companiesJson from "@data/companies.json";
import peersJson from "@data/peers.json";
import weightsJson from "@data/weights.json";
import { normalizeName } from "./names";
import type { Company, Filing, FilingSummary, PeerRow, ScoringConfig } from "./types";

/** Server-side access to the dataset bundled with the app. */

export const COMPANIES = companiesJson as Company[];
export const PEERS = peersJson as PeerRow[];
export const DEFAULT_CONFIG = weightsJson as ScoringConfig;

export function getCompany(slug: string): Company | undefined {
  return COMPANIES.find((c) => c.slug === slug);
}

export function getFiling(ein: string | null): Filing | null {
  if (!ein) return null;
  const file = path.join(process.cwd(), "data", "filings", `${ein}.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as Filing;
}

export function summarize(filing: Filing | null): FilingSummary | null {
  if (!filing) return null;
  const { grants: _grants, grantsTruncated: _truncated, ...summary } = filing;
  return summary;
}

/**
 * Existing Thirst Project partners. Kept out of the repository: set the
 * PARTNER_COMPANIES environment variable to a comma-separated list.
 */
export function isExistingPartner(name: string): boolean {
  const wanted = normalizeName(name);
  return (process.env.PARTNER_COMPANIES ?? "")
    .split(",")
    .map((entry) => normalizeName(entry))
    .filter(Boolean)
    .includes(wanted);
}

export function hunterEnabled(): boolean {
  return Boolean(process.env.HUNTER_API_KEY);
}
