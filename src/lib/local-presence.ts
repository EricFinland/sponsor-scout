import type { Research } from "./types";
import { evidenceHeadquarters } from "./company-evidence";

export const LA_POINTS = { headquarters: 35, office: 30, operations: 20, retail: 10, regional: 15, none: 0, unknown: 0 } as const;
export const LA_LABELS: Record<NonNullable<Research["laPresence"]>, string> = {
  headquarters: "Headquarters in LA County", office: "Corporate office in LA County",
  operations: "Operating facility in LA County", retail: "Retail presence in LA County",
  regional: "Office or headquarters in a neighboring county", none: "No local presence found", unknown: "Not researched",
};
const NEIGHBORING = new Set(["orange", "ventura", "riverside", "san bernardino"]);
const countyName = (s: string) => s.trim().toLowerCase().replace(/\s+county$/, "");

export function localPresence(research: Research, asOfYear: number): { points: number; verified: boolean; reason: string; sourceUrl?: string } {
  if (!research.laPresence || research.laPresence === "unknown") {
    const record = evidenceHeadquarters(research.publicData, asOfYear);
    const h = record?.headquarters;
    if (record && h && h.country === "US" && ["CA", "US-CA"].includes(h.region)) {
      const county = countyName(h.county ?? "");
      if (county === "los angeles" || NEIGHBORING.has(county)) return { points: county === "los angeles" ? 35 : 15, verified: true, sourceUrl: record.url, reason: `Confirmed ${record.name} headquarters: ${h.city}, ${h.county} County (${record.provider.toUpperCase()}, retrieved ${record.fetchedAt.slice(0, 10)}). Headquarters evidence does not establish sponsorship interest.` };
    }
  }
  const kind = research.laPresence ?? "unknown";
  if (!(kind in LA_POINTS) || kind === "unknown") return { points: 0, verified: false, reason: "LA presence has not been researched. No local-presence points awarded." };
  const reviewed = research.laVerifiedAt ?? "";
  const parsedDate = new Date(`${reviewed}T00:00:00Z`);
  const realDate = /^\d{4}-\d{2}-\d{2}$/.test(reviewed) && Number.isFinite(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === reviewed;
  const year = realDate ? Number(reviewed.slice(0, 4)) : NaN;
  const validUrl = /^https:\/\/[^\s]+$/i.test(research.laSourceUrl ?? "");
  const current = Number.isFinite(year) && year >= asOfYear - 1 && year <= asOfYear;
  if (!validUrl || !current || !research.laEvidence?.trim()) {
    return { points: 0, verified: false, reason: "LA presence needs an HTTPS source, supporting evidence and a review in this or the previous calendar year. No local-presence points awarded." };
  }
  if (kind === "none") return { points: 0, verified: true, reason: "Research found no local presence. This does not establish that the company cannot sponsor remotely." };
  const county = countyName(research.laCounty ?? "");
  const eligible = Boolean(research.laCity?.trim()) && (kind === "regional" ? NEIGHBORING.has(county) : county === "los angeles");
  if (!eligible) return { points: 0, verified: false, reason: "The documented location does not meet the selected LA County or neighboring-county rule. No local-presence points awarded." };
  return { points: LA_POINTS[kind], verified: true, reason: `${LA_LABELS[kind]}: ${research.laCity}, ${research.laCounty} County. Reviewed ${reviewed}.` };
}

export function localPresenceLabel(research: Research, year = new Date().getFullYear()): string {
  if ((!research.laPresence || research.laPresence === "unknown") && localPresence(research, year).verified) return localPresence(research, year).points === 35 ? LA_LABELS.headquarters : LA_LABELS.regional;
  return LA_LABELS[research.laPresence ?? "unknown"];
}
