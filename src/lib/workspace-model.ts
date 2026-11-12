import type { Company, FilingSummary, PeerRow, ScoringConfig } from "./types";
export interface WorkspaceCatalog {
  companies: Company[];
  summaries: Record<string, FilingSummary>;
  peers: PeerRow[];
  config: ScoringConfig;
  hunterEnabled: boolean;
  partnerSlugs: string[];
}
export const WORKSPACE_PATHS = ["/", "/lookup", "/tracker", "/method"] as const;
