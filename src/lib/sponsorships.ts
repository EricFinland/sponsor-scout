import type { Company, Sponsorship } from "./types";

/** Future years and malformed/import-duplicate rows never influence ranking. */
export function sponsorshipHistory(company: Company, asOfYear: number): Sponsorship[] {
  const seen = new Set<string>();
  return (company.sponsorships ?? []).filter((s) => {
    if (!s.id || seen.has(s.id) || !Number.isInteger(s.year) || s.year < 1900 || s.year > asOfYear ||
      !Number.isFinite(s.amountUsd) || s.amountUsd < 0 || s.relationship !== "Gala sponsorship" || !s.sourceUrl) return false;
    seen.add(s.id);
    return true;
  }).sort((a, b) => b.year - a.year || b.amountUsd - a.amountUsd);
}

export function recentSponsorships(company: Company, asOfYear: number): Sponsorship[] {
  return sponsorshipHistory(company, asOfYear).filter((s) => s.year >= asOfYear - 2);
}
