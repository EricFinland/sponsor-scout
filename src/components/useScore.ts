"use client";

import { useMemo } from "react";
import { industryPeerCompanies, peersForCompany } from "@/lib/peers";
import { scoreCompany } from "@/lib/scoring";
import { useStore } from "@/lib/store";
import type { Company, FilingSummary, PeerRow, ScoreResult, ScoringConfig } from "@/lib/types";

export const AS_OF_YEAR = new Date().getFullYear();

/** The weights in force: the team's local adjustment if there is one, else the bundled defaults. */
export function useConfig(defaults: ScoringConfig): ScoringConfig {
  const [override] = useStore("weights");
  return override ?? defaults;
}

/** A company with any research notes saved in this browser applied on top. */
export function useCompanyWithResearch(company: Company): Company {
  const [research] = useStore("research");
  return useMemo(() => {
    const saved = research[company.slug];
    return saved ? { ...company, research: saved } : company;
  }, [company, research]);
}

export function score(
  company: Company,
  filing: FilingSummary | null,
  peersTable: PeerRow[],
  config: ScoringConfig,
): { result: ScoreResult; peers: PeerRow[]; industryPeers: number } {
  const peers = peersForCompany(company, peersTable, filing);
  const industryPeers = industryPeerCompanies(company, peersTable);
  const result = scoreCompany({
    company,
    filing,
    peers,
    industryPeerCompanies: industryPeers,
    config,
    asOfYear: AS_OF_YEAR,
  });
  return { result, peers, industryPeers };
}
