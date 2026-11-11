import { sameCompany } from "./names";
import type { Company, FilingSummary, PeerRow } from "./types";

/**
 * Peer rows for one company: everything in the Peers table under its name,
 * plus grants to known water nonprofits found in its own filing.
 */
export function peersForCompany(company: Company, table: PeerRow[], filing: FilingSummary | null): PeerRow[] {
  const rows = table.filter((row) => sameCompany(row.company, company.name));
  const seen = new Set(rows.map((r) => `${r.peerNonprofit}|${r.year}|${r.amountUsd}`));
  for (const match of filing?.stats?.peerMatches ?? []) {
    const key = `${match.nonprofit}|${filing?.taxYear}|${match.amount}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      company: company.name,
      industry: company.industry,
      peerNonprofit: match.nonprofit,
      relationship: "Foundation grant",
      year: filing?.taxYear ?? null,
      amountUsd: match.amount,
      sourceUrl: filing?.sources[1]?.url ?? filing?.sources[0]?.url ?? "",
      note: match.purpose,
    });
  }
  return rows.sort((a, b) => (b.amountUsd ?? 0) - (a.amountUsd ?? 0));
}

/** How many other companies in the same industry appear in the Peers table. */
export function industryPeerCompanies(company: Company, table: PeerRow[]): number {
  const names = new Set<string>();
  for (const row of table) {
    if (row.industry === company.industry && !sameCompany(row.company, company.name)) names.add(row.company);
  }
  return names.size;
}
