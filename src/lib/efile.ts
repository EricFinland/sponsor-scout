import { XMLParser } from "fast-xml-parser";
import { isAdjacentCause, isThirstProject, isWaterRelated, matchPeerNonprofit } from "./keywords";
import { tidyOrgName, tidyPersonName } from "./names";
import type { Grant, GrantStats, Officer } from "./types";

/**
 * Reads an IRS e-filed return (990-PF, or a 990 with Schedule I) and pulls out
 * the grant list, officers and the totals the scoring engine needs.
 */

const REPEATING = new Set([
  "GrantOrContributionPdDurYrGrp",
  "OfficerDirTrstKeyEmplGrp",
  "RecipientTable",
  "Form990PartVIISectionAGrp",
]);

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => REPEATING.has(name),
});

type Node = Record<string, unknown>;

export interface ParsedReturn {
  formType: string;
  taxYear: number | null;
  filerName: string;
  totalGiving: number | null;
  totalAssets: number | null;
  grants: Grant[];
  officers: Officer[];
  preselectedOnly: boolean | null;
  applicationContact: string | null;
  website: string | null;
  /** True when the return points to an attached statement instead of itemizing grants. */
  grantsInAttachment: boolean;
}

/** Keep the largest grants plus every water-related and peer grant, so big filings stay small. */
export const MAX_GRANTS_KEPT = 400;

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findFirst(node: unknown, key: string): unknown {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findFirst(item, key);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (!isNode(node)) return undefined;
  if (key in node) return node[key];
  for (const value of Object.values(node)) {
    const found = findFirst(value, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

function findAll(node: unknown, key: string, out: Node[] = []): Node[] {
  if (Array.isArray(node)) {
    for (const item of node) findAll(item, key, out);
    return out;
  }
  if (!isNode(node)) return out;
  for (const [k, value] of Object.entries(node)) {
    if (k === key) {
      for (const item of Array.isArray(value) ? value : [value]) if (isNode(item)) out.push(item);
    } else {
      findAll(value, key, out);
    }
  }
  return out;
}

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function num(value: unknown): number | null {
  const n = Number(text(value));
  return text(value) !== "" && Number.isFinite(n) ? n : null;
}

function businessName(node: unknown): string {
  if (!isNode(node)) return text(node);
  return [text(node.BusinessNameLine1Txt), text(node.BusinessNameLine2Txt)].filter(Boolean).join(" ");
}

function place(group: Node): string {
  const us = (group.RecipientUSAddress ?? group.USAddress) as Node | undefined;
  if (isNode(us)) {
    return [tidyOrgName(text(us.CityNm)), text(us.StateAbbreviationCd)].filter(Boolean).join(", ");
  }
  const foreign = (group.RecipientForeignAddress ?? group.ForeignAddress) as Node | undefined;
  if (isNode(foreign)) {
    return [tidyOrgName(text(foreign.CityNm)), text(foreign.CountryCd)].filter(Boolean).join(", ");
  }
  return "";
}

function toGrant(recipientRaw: string, purposeRaw: string, amount: number, where: string): Grant {
  const recipient = tidyOrgName(recipientRaw);
  const purpose = purposeRaw.replace(/\s+/g, " ").trim();
  return {
    recipient,
    purpose,
    amount,
    place: where,
    water: isWaterRelated(recipient, purpose),
    adjacent: isAdjacentCause(recipient, purpose),
    peer: matchPeerNonprofit(recipient),
  };
}

const PLACEHOLDER_RECIPIENT =
  /^(see|refer to|per|as per)\b.*\b(attach\w*|statement|schedule|exhibit|list|detail)\b|^(various|attached|see attached)\b/i;

/** Some foundations enter one row such as "See Statement 12" and attach the real list as a PDF. */
export function isPlaceholderGrant(grant: Grant): boolean {
  return PLACEHOLDER_RECIPIENT.test(grant.recipient);
}

function pfGrants(form: Node): Grant[] {
  return findAll(form, "GrantOrContributionPdDurYrGrp")
    .map((g) => {
      const recipient = businessName(g.RecipientBusinessName) || tidyPersonName(text(g.RecipientPersonNm));
      const amount = num(g.Amt);
      if (!recipient || amount === null) return null;
      return toGrant(recipient, text(g.GrantOrContributionPurposeTxt), amount, place(g));
    })
    .filter((g): g is Grant => g !== null);
}

function scheduleIGrants(data: Node): Grant[] {
  return findAll(data, "RecipientTable")
    .map((g) => {
      const recipient = businessName(g.RecipientBusinessName);
      const amount = num(g.CashGrantAmt);
      if (!recipient || amount === null) return null;
      return toGrant(recipient, text(g.PurposeOfGrantTxt), amount, place(g));
    })
    .filter((g): g is Grant => g !== null);
}

function officers(data: Node, key: string): Officer[] {
  const seen = new Set<string>();
  const out: Officer[] = [];
  for (const o of findAll(data, key)) {
    const name = tidyPersonName(text(o.PersonNm)) || businessName(o.BusinessName);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({ name, title: tidyOrgName(text(o.TitleTxt)) });
  }
  return out;
}

export function parseReturn(xml: string): ParsedReturn {
  const doc = parser.parse(xml.replace(/^﻿/, "")) as Node;
  const root = (doc.Return ?? {}) as Node;
  const header = (root.ReturnHeader ?? {}) as Node;
  const data = (root.ReturnData ?? {}) as Node;
  const formType = text(header.ReturnTypeCd);
  const periodEnd = text(header.TaxPeriodEndDt);
  const taxYear = num(header.TaxYr) ?? (periodEnd ? Number(periodEnd.slice(0, 4)) : null);
  const filer = (header.Filer ?? {}) as Node;
  const filerName = tidyOrgName(businessName(filer.BusinessName));
  const website = text(findFirst(data, "WebsiteAddressTxt")) || null;

  if (formType === "990PF") {
    const form = (data.IRS990PF ?? {}) as Node;
    const listedGrants = pfGrants(form);
    const grants = listedGrants.filter((g) => !isPlaceholderGrant(g));
    const grantsInAttachment = grants.length < listedGrants.length;
    const listed = grants.reduce((t, g) => t + g.amount, 0);
    const reported = num(findFirst(form, "ContriPaidRevAndExpnssAmt")) ?? num(findFirst(form, "TotalGrantOrContriPdDurYrAmt"));
    const preselected = text(findFirst(form, "OnlyContriToPreselectedInd"));
    const application = findFirst(form, "ApplicationSubmissionInfoGrp");
    const contact = isNode(application)
      ? tidyPersonName(text(application.RecipientPersonNm)) || businessName(application.RecipientBusinessName)
      : "";
    return {
      formType,
      taxYear,
      filerName,
      totalGiving: reported ?? (grants.length ? listed : null),
      totalAssets: num(findFirst(form, "TotalAssetsEOYAmt")) ?? num(findFirst(form, "TotalAssetsEOYFMVAmt")),
      grants,
      officers: officers(form, "OfficerDirTrstKeyEmplGrp"),
      preselectedOnly: preselected ? /^(x|true|1)$/i.test(preselected) : application !== undefined ? false : null,
      applicationContact: contact || null,
      website,
      grantsInAttachment,
    };
  }

  const grants = scheduleIGrants(data);
  return {
    formType,
    taxYear,
    filerName,
    totalGiving:
      num(findFirst(data, "CYGrantsAndSimilarPaidAmt")) ?? (grants.length ? grants.reduce((t, g) => t + g.amount, 0) : null),
    totalAssets: num(findFirst(data, "TotalAssetsEOYAmt")),
    grants,
    officers: officers(data, "Form990PartVIISectionAGrp"),
    preselectedOnly: null,
    applicationContact: null,
    website,
    grantsInAttachment: false,
  };
}

export function grantStats(grants: Grant[]): GrantStats {
  const amounts = grants.map((g) => g.amount).sort((a, b) => a - b);
  const edges = [1_000, 10_000, 50_000, 250_000, 1_000_000];
  const buckets: GrantStats["buckets"] = [0, 0, 0, 0, 0, 0];
  for (const amount of amounts) {
    let i = edges.findIndex((edge) => amount < edge);
    if (i === -1) i = 5;
    buckets[i] += 1;
  }
  const mid = Math.floor(amounts.length / 2);
  const median =
    amounts.length === 0 ? null : amounts.length % 2 ? amounts[mid] : Math.round((amounts[mid - 1] + amounts[mid]) / 2);
  const water = grants.filter((g) => g.water);
  return {
    count: grants.length,
    total: amounts.reduce((t, a) => t + a, 0),
    median,
    buckets,
    waterCount: water.length,
    waterAmount: water.reduce((t, g) => t + g.amount, 0),
    adjacentCount: grants.filter((g) => g.adjacent).length,
    peerMatches: grants
      .filter((g) => g.peer !== null && !isThirstProject(g.recipient))
      .map((g) => ({ nonprofit: g.peer as string, amount: g.amount, purpose: g.purpose })),
    thirstProjectGrants: grants.filter((g) => isThirstProject(g.recipient)).length,
  };
}

export function trimGrants(grants: Grant[]): { grants: Grant[]; truncated: boolean } {
  const sorted = [...grants].sort((a, b) => b.amount - a.amount);
  if (sorted.length <= MAX_GRANTS_KEPT) return { grants: sorted, truncated: false };
  const kept = sorted.filter((g, i) => i < MAX_GRANTS_KEPT || g.water || g.peer !== null);
  return { grants: kept, truncated: true };
}
