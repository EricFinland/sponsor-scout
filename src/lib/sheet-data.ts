import { EMPTY_RESEARCH, INDUSTRY_LABELS } from "./types";
import type { Company, Filing, PeerRow, Research, ScoringConfig, Sponsorship } from "./types";
import type { SheetRow, SheetTables } from "./sheet-schema";

const str = (x: unknown) => x == null ? "" : String(x);
const number = (x: unknown): number | null => x === "" || x == null ? null : Number.isFinite(Number(x)) ? Number(x) : null;
const bool = (x: unknown) => x === true || str(x).toLowerCase() === "true" || str(x).toLowerCase() === "yes";
const list = (x: unknown) => str(x).split(";").map((s) => s.trim()).filter(Boolean);
const oneOf = <T extends string>(x: unknown, allowed: readonly T[], fallback: T): T => allowed.includes(str(x) as T) ? str(x) as T : fallback;

export function researchFromRow(row: SheetRow): Research {
  return {
    ...EMPTY_RESEARCH,
    waterFocus: oneOf(row.waterFocus, ["yes", "no", "unknown"], "unknown"), focusAreas: list(row.focusAreas),
    applicationProcess: oneOf(row.applicationProcess, ["open", "invite_only", "unknown"], "unknown"),
    annualGivingUsd: number(row.annualGivingUsd), sizeBand: oneOf(row.sizeBand, ["small", "mid", "large", "enterprise", "unknown"], "unknown"),
    warmIntro: bool(row.warmIntro), sourceUrl: str(row.sourceUrl), notes: str(row.notes), updatedAt: str(row.updatedAt) || null,
    laPresence: oneOf(row.laPresence, ["headquarters", "office", "operations", "retail", "regional", "none", "unknown"] as const, "unknown"),
    laCity: str(row.laCity), laCounty: str(row.laCounty), laSourceUrl: str(row.laSourceUrl), laVerifiedAt: str(row.laVerifiedAt).slice(0, 10), laEvidence: str(row.laEvidence),
  };
}

export function researchToRow(slug: string, r: Research): SheetRow {
  return { slug, ...EMPTY_RESEARCH, ...r, focusAreas: r.focusAreas.join("; ") };
}

export function companyToRow(c: Company): SheetRow {
  return { slug: c.slug, name: c.name, industry: c.industry, domain: c.domain, hqState: c.hqState,
    foundationStatus: c.foundation.status, ein: c.foundation.ein, foundationName: c.foundation.name,
    entityType: c.entityType ?? "company", relationshipStatus: c.relationshipStatus ?? "prospect", aliases: (c.aliases ?? []).join("; ") };
}

export function configToRows(config: ScoringConfig): SheetRow[] {
  return Object.entries(config).flatMap(([section, value]) => typeof value === "object"
    ? Object.entries(value).map(([key, v]) => ({ id: `${section}.${key}`, section, key, value: v as number }))
    : [{ id: `settings.${section}`, section: "settings", key: section, value }]);
}

export function configFromRows(rows: SheetRow[], defaults: ScoringConfig): ScoringConfig {
  const config = structuredClone(defaults);
  for (const row of rows) {
    const section = str(row.section), key = str(row.key);
    if (section === "settings" && key === "homeState") { config.homeState = str(row.value); continue; }
    if (!["weights", "tiers", "baseline", "confidenceLabels"].includes(section)) continue;
    const target = config[section as "weights"] as unknown as Record<string, number>;
    if (!(key in target)) continue;
    const value = number(row.value);
    if (value === null || value < 0 || value > 100) throw new Error(`Invalid Weights value: ${section}.${key}. Use a number from 0 to 100.`);
    target[key] = value;
  }
  if (Object.values(config.weights).reduce((a, b) => a + b, 0) === 0) throw new Error("At least one scoring weight must be greater than zero.");
  if (!(config.tiers.A > config.tiers.B && config.tiers.B > config.tiers.C)) throw new Error("Tier cutoffs must satisfy A > B > C.");
  if (config.confidenceLabels.high <= config.confidenceLabels.medium) throw new Error("High confidence cutoff must exceed Medium.");
  return config;
}

export function filingRows(filing: Filing): SheetRow[] {
  const text = JSON.stringify(filing), rows: SheetRow[] = [];
  for (let offset = 0; offset < text.length; offset += 25000) {
    const part = offset / 25000;
    rows.push({ id: `${filing.ein}:${part}`, ein: filing.ein, part, payload: text.slice(offset, offset + 25000) });
  }
  return rows;
}

export function decodeDataset(tables: SheetTables, defaults: ScoringConfig) {
  if (!tables.Companies?.length) throw new Error("The connected Sheet has no Companies rows. Restore its Companies tab before retrying.");
  const research = new Map((tables.Profiles ?? []).map((r) => [str(r.slug), researchFromRow(r)]));
  const sponsorships = (tables.Sponsorships ?? []).map((r) => ({ ...r, year: number(r.year), amountUsd: number(r.amountUsd), sourceRow: number(r.sourceRow) })) as unknown as Sponsorship[];
  const seen = new Set<string>();
  const companies: Company[] = tables.Companies.map((row) => {
    const slug = str(row.slug), name = str(row.name);
    if (!slug || !name || seen.has(slug)) throw new Error(`Companies requires unique, nonblank slugs and names. Check ${slug || "the blank slug"}.`);
    seen.add(slug);
    return { slug, name, industry: oneOf(row.industry, Object.keys(INDUSTRY_LABELS), "other") as Company["industry"], domain: str(row.domain), hqState: str(row.hqState),
      foundation: { status: oneOf(row.foundationStatus, ["matched", "none_found", "unverified"], "unverified"), ein: str(row.ein).padStart(str(row.ein) ? 9 : 0, "0") || null, name: str(row.foundationName) || null },
      research: research.get(slug) ?? { ...EMPTY_RESEARCH }, aliases: list(row.aliases),
      entityType: oneOf(row.entityType, ["company", "foundation"] as const, "company"),
      relationshipStatus: oneOf(row.relationshipStatus, ["prospect", "historical_sponsor", "current_partner"] as const, "prospect"),
      sponsorships: sponsorships.filter((s) => s.company === name),
    };
  });
  const filings: Record<string, Filing> = {};
  const chunks = new Map<string, SheetRow[]>();
  for (const r of tables.Filings ?? []) { const ein = str(r.ein).padStart(9, "0"); chunks.set(ein, [...(chunks.get(ein) ?? []), r]); }
  for (const [ein, rows] of chunks) {
    const ordered = rows.sort((a, b) => Number(a.part) - Number(b.part));
    if (!ordered.every((r, index) => Number(r.part) === index)) throw new Error(`Filing ${ein} has missing or duplicate chunks.`);
    try { const parsed = JSON.parse(ordered.map((r) => str(r.payload)).join("")) as Filing;
      if (parsed.ein !== ein || !Array.isArray(parsed.grants)) throw new Error(); filings[ein] = parsed;
    } catch { throw new Error(`Filing ${ein} is incomplete or invalid. Restore the Filings rows.`); }
  }
  const peers = (tables.Peers ?? []).map((r) => ({ ...r, year: number(r.year), amountUsd: number(r.amountUsd) })) as unknown as PeerRow[];
  return { companies, peers, config: configFromRows(tables.Weights ?? [], defaults), filings };
}
