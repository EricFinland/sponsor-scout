import { slugify } from "./names";
import type { Sponsorship } from "./types";

export interface HistorySourceRow { row: number; name: string; amount: number | null; entityKind?: "organization" | "person_or_family" | "event_note" }
export interface ImportReview { row: number; name: string; year: number | null; amountUsd: number | null; disposition: string }
const ALIASES: Record<string, string> = { uta: "United Talent Agency", "pretty litter": "PrettyLitter", "sun trust bank": "SunTrust Bank" };

/** Preserve year headings, source rows and distinct entities; never infer a foundation from a person's gift. */
export function importHistory(rows: HistorySourceRow[], sourceUrl: string, asOfYear: number) {
  let year: number | null = null;
  const sponsorships: Sponsorship[] = [];
  const review: ImportReview[] = [];
  for (const row of rows) {
    const name = row.name.trim().replace(/\s+/g, " ");
    if (/^20\d{2}(\.0)?$/.test(name) && row.amount === null) { year = Number(name); continue; }
    if (!name || /^sponsor name$/i.test(name)) continue;
    const personal = row.entityKind === "person_or_family";
    const valid = year !== null && year <= asOfYear && year >= 1900 && row.amount !== null && Number.isFinite(row.amount) && row.amount >= 0;
    if (!valid || personal) {
      review.push({ row: row.row, name, year, amountUsd: row.amount, disposition: personal ? "Personal/family gift: retained privately, excluded from corporate ranking" : "Event note or incomplete record: excluded from ranking" });
      continue;
    }
    const company = ALIASES[name.toLowerCase()] ?? name;
    sponsorships.push({ id: `gala-${year}-row-${row.row}`, company, originalName: name, year: year!, amountUsd: row.amount!,
      event: "Thirst Project gala", relationship: "Gala sponsorship", sourceUrl: `${sourceUrl}#range=A${row.row}:B${row.row}`, sourceRow: row.row });
    review.push({ row: row.row, name, year, amountUsd: row.amount, disposition: /^(paramount|hjth llc|the good store)$/i.test(name)
      ? "Imported separately; legal entity identity needs review" : "Imported organization sponsorship" });
  }
  return { sponsorships, review, companies: [...new Set(sponsorships.map((s) => s.company))].map((name) => ({ name, slug: slugify(name) })) };
}
