export type Industry =
  | "beverage_cpg"
  | "outdoor_apparel"
  | "tech"
  | "water_industrial"
  | "financial"
  | "retail"
  | "entertainment"
  | "other";

export const INDUSTRY_LABELS: Record<Industry, string> = {
  beverage_cpg: "Beverage and CPG",
  outdoor_apparel: "Outdoor and apparel",
  tech: "Technology",
  water_industrial: "Water and industrial",
  financial: "Financial services",
  retail: "Retail",
  entertainment: "Entertainment and media",
  other: "Other",
};

export interface Grant {
  recipient: string;
  purpose: string;
  amount: number;
  place: string;
  /** Recipient or purpose mentions water, sanitation or hygiene. */
  water: boolean;
  /** Purpose touches a cause next to Thirst Project's (youth, education, global health). */
  adjacent: boolean;
  /** Name of the known water nonprofit this grant went to, if any. */
  peer: string | null;
}

export interface Officer {
  name: string;
  title: string;
}

export interface FilingYear {
  year: number;
  giving: number | null;
  assets: number | null;
  pdfUrl: string | null;
}

export interface PeerMatch {
  nonprofit: string;
  amount: number;
  purpose: string;
}

/** Grant counts by size. Edges: 1k, 10k, 50k, 250k, 1M. */
export interface GrantStats {
  count: number;
  total: number;
  median: number | null;
  buckets: [number, number, number, number, number, number];
  waterCount: number;
  waterAmount: number;
  adjacentCount: number;
  peerMatches: PeerMatch[];
  thirstProjectGrants: number;
}

export interface SourceLink {
  label: string;
  url: string;
}

/** Everything scoring needs from a foundation filing, without the grant list. */
export interface FilingSummary {
  ein: string;
  name: string;
  city: string;
  state: string;
  formType: string;
  taxYear: number | null;
  totalGiving: number | null;
  totalAssets: number | null;
  /** True when the grant-by-grant filing XML was found and parsed. */
  detailAvailable: boolean;
  stats: GrantStats | null;
  /** True when the filing points to an attached PDF statement instead of itemizing grants. */
  grantsInAttachment: boolean;
  officers: Officer[];
  /** True when the 990-PF says the foundation only funds preselected organizations. */
  preselectedOnly: boolean | null;
  applicationContact: string | null;
  website: string | null;
  history: FilingYear[];
  sources: SourceLink[];
  fetchedAt: string;
}

export interface Filing extends FilingSummary {
  grants: Grant[];
  /** True when only the largest grants plus every water and peer grant were kept. */
  grantsTruncated: boolean;
}

export type FoundationStatus = "matched" | "none_found" | "unverified";

export interface Research {
  waterFocus: "yes" | "no" | "unknown";
  focusAreas: string[];
  applicationProcess: "open" | "invite_only" | "unknown";
  annualGivingUsd: number | null;
  sizeBand: "small" | "mid" | "large" | "enterprise" | "unknown";
  warmIntro: boolean;
  sourceUrl: string;
  notes: string;
  updatedAt: string | null;
  /** Local presence is scored only with a location, source and recent review. */
  laPresence?: "headquarters" | "office" | "operations" | "retail" | "regional" | "none" | "unknown";
  laCity?: string;
  laCounty?: string;
  laSourceUrl?: string;
  laVerifiedAt?: string;
  laEvidence?: string;
  /** Sponsor-fit signals for companies without a foundation filing. All come from the company's own or public reporting. */
  csrReport?: "yes" | "no" | "unknown";
  givingPrograms?: string[];
  nonprofitPartners?: string[];
  ethicsCredentials?: string[];
  ethicsCheck?: EthicsCheck;
  ethicsNotes?: string;
  ethicsSourceUrl?: string;
}

export type EthicsCheck = "unknown" | "clear" | "review" | "conflict";

export const ETHICS_LABELS: Record<EthicsCheck, string> = {
  unknown: "Not screened yet",
  clear: "Screened, no concerns found",
  review: "Concern worth discussing before outreach",
  conflict: "Not a fit for Thirst Project",
};

export const GIVING_PROGRAMS = [
  "Corporate grants",
  "Event sponsorships",
  "Employee matching gifts",
  "Cause marketing",
  "In-kind donations",
  "Employee volunteering",
] as const;

export const ETHICS_CREDENTIALS = [
  "Certified B Corporation",
  "1% for the Planet member",
  "UN Global Compact participant",
  "Published water stewardship goals",
] as const;

export const EMPTY_RESEARCH: Research = {
  waterFocus: "unknown",
  focusAreas: [],
  applicationProcess: "unknown",
  annualGivingUsd: null,
  sizeBand: "unknown",
  warmIntro: false,
  sourceUrl: "",
  notes: "",
  updatedAt: null,
  laPresence: "unknown",
  laCity: "",
  laCounty: "",
  laSourceUrl: "",
  laVerifiedAt: "",
  laEvidence: "",
  csrReport: "unknown",
  givingPrograms: [],
  nonprofitPartners: [],
  ethicsCredentials: [],
  ethicsCheck: "unknown",
  ethicsNotes: "",
  ethicsSourceUrl: "",
};

export const FOCUS_AREAS = [
  "Youth",
  "Education",
  "Global health",
  "International development",
  "Environment",
  "Hunger and poverty",
] as const;

export interface Company {
  slug: string;
  name: string;
  industry: Industry;
  domain: string;
  hqState: string;
  foundation: {
    status: FoundationStatus;
    ein: string | null;
    name: string | null;
  };
  research: Research;
  aliases?: string[];
  entityType?: "company" | "foundation";
  relationshipStatus?: "prospect" | "historical_sponsor" | "current_partner";
  /** Imported history stays separate from grants and other nonprofits' support. */
  sponsorships?: Sponsorship[];
}

export interface Sponsorship {
  id: string;
  company: string;
  year: number;
  amountUsd: number;
  event: string;
  relationship: "Gala sponsorship";
  sourceUrl: string;
  sourceRow: number;
  originalName: string;
}

export interface PeerRow {
  company: string;
  industry: Industry;
  peerNonprofit: string;
  relationship: string;
  year: number | null;
  amountUsd: number | null;
  sourceUrl: string;
  note: string;
}

export type FactorKey =
  | "mission_alignment"
  | "peer_signal"
  | "capacity_fit"
  | "accessibility"
  | "confidence";

export const FACTOR_LABELS: Record<FactorKey, string> = {
  mission_alignment: "Mission alignment",
  peer_signal: "Peer signal",
  capacity_fit: "Capacity fit",
  accessibility: "Accessibility",
  confidence: "Confidence",
};

export const FACTOR_ORDER: FactorKey[] = [
  "mission_alignment",
  "peer_signal",
  "capacity_fit",
  "accessibility",
  "confidence",
];

export interface ScoringConfig {
  weights: Record<FactorKey, number>;
  tiers: { A: number; B: number; C: number };
  confidenceLabels: { high: number; medium: number };
  /** Score given to a factor when nothing is on file for it. */
  baseline: Record<Exclude<FactorKey, "confidence">, number>;
  homeState: string;
}

export interface Evidence {
  text: string;
  points: number | null;
  sourceUrl?: string;
}

export interface FactorScore {
  key: FactorKey;
  score: number;
  hasData: boolean;
  evidence: Evidence[];
}

export type Tier = "A" | "B" | "C" | "D";
export type ConfidenceLabel = "High" | "Medium" | "Low";

export interface ScoreResult {
  overall: number;
  tier: Tier;
  confidenceLabel: ConfidenceLabel;
  /** True when confidence is Low. The score should be read as a placeholder. */
  provisional: boolean;
  factors: Record<FactorKey, FactorScore>;
  /** Result of the ethics screen. A flagged company has its overall score capped. */
  ethics: {
    check: EthicsCheck;
    /** The weighted score before any ethics cap. */
    uncapped: number;
    capped: boolean;
  };
}

export interface ScoreInputs {
  company: Company;
  filing: FilingSummary | null;
  /** Peer rows for this company, from the Peers table and from its own grants. */
  peers: PeerRow[];
  /** Other companies in the same industry that appear in the Peers table. */
  industryPeerCompanies: number;
  config: ScoringConfig;
  asOfYear: number;
}

export interface FoundationCandidate {
  ein: string;
  name: string;
  city: string;
  state: string;
  /** 0 to 100, how well the name fits the company searched. */
  match: number;
}
