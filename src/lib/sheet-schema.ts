/** Stable, human-editable columns shared by the app, workbook builder and Apps Script. */
export const SHEET_COLUMNS = {
  Companies: ["slug", "name", "industry", "domain", "hqState", "foundationStatus", "ein", "foundationName", "entityType", "relationshipStatus", "aliases", "version"],
  Profiles: ["slug", "waterFocus", "focusAreas", "applicationProcess", "annualGivingUsd", "sizeBand", "warmIntro", "sourceUrl", "notes", "updatedAt", "laPresence", "laCity", "laCounty", "laSourceUrl", "laVerifiedAt", "laEvidence", "version"],
  Peers: ["id", "company", "industry", "peerNonprofit", "relationship", "year", "amountUsd", "sourceUrl", "note"],
  Sponsorships: ["id", "company", "year", "amountUsd", "event", "relationship", "sourceUrl", "sourceRow", "originalName"],
  Weights: ["id", "section", "key", "value", "version"],
  Scores: ["slug", "company", "overall", "tier", "mission_alignment", "peer_signal", "capacity_fit", "accessibility", "confidence", "confidenceLabel", "provisional", "scoredAt", "inputHash"],
  "Tier Summary": ["tier", "companies", "provisional", "scoredAt"],
  "Outreach Tracker": ["id", "date", "company", "contact", "channel", "template", "status", "notes", "version"],
  "Search Log": ["id", "date", "query", "result", "score", "tier", "confidence"],
  Filings: ["id", "ein", "part", "payload"],
  "Import Review": ["row", "name", "year", "amountUsd", "disposition"],
  "Source History": ["sourceRow", "sponsorName", "amountSponsored", "year", "sourceUrl"],
} as const;
export type SheetTab = keyof typeof SHEET_COLUMNS;
export type SheetRow = Record<string, string | number | boolean | null>;
export type SheetTables = Partial<Record<SheetTab, SheetRow[]>>;
