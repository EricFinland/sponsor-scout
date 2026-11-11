import { formatUsd } from "./format";
import type {
  ConfidenceLabel,
  Evidence,
  FactorKey,
  FactorScore,
  Industry,
  ScoreInputs,
  ScoreResult,
  ScoringConfig,
  Tier,
} from "./types";
import { FACTOR_ORDER } from "./types";
import { localPresence } from "./local-presence";
import { recentSponsorships, sponsorshipHistory } from "./sponsorships";

/**
 * Rules-based scoring. Every point awarded is listed as a line of evidence,
 * so a reader can trace any score back to a filing, the Peers table or a
 * research note. No model, no network: the same inputs always give the same score.
 */

const INDUSTRY_WATER_TIE: Partial<Record<Industry, number>> = {
  beverage_cpg: 10,
  water_industrial: 10,
  outdoor_apparel: 8,
};

const SIZE_BAND_SCORE = { small: 25, mid: 40, large: 55, enterprise: 65 } as const;

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function sum(evidence: Evidence[]): number {
  return evidence.reduce((total, e) => total + (e.points ?? 0), 0);
}

function givingBandScore(annualGiving: number): number {
  if (annualGiving >= 10_000_000) return 90;
  if (annualGiving >= 1_000_000) return 70;
  if (annualGiving >= 100_000) return 45;
  return 20;
}

function filingSource(inputs: ScoreInputs): string | undefined {
  return inputs.filing?.sources[0]?.url;
}

function missionAlignment(inputs: ScoreInputs): FactorScore {
  const { company, filing, config } = inputs;
  const { research } = company;
  const evidence: Evidence[] = [];
  const stats = filing?.stats ?? null;
  const source = filingSource(inputs);

  if (research.waterFocus === "yes") {
    evidence.push({
      text: "Company names water as a giving or sustainability priority.",
      points: 40,
      sourceUrl: research.sourceUrl || undefined,
    });
  } else if (research.waterFocus === "no") {
    evidence.push({
      text: "Company's published giving priorities do not include water.",
      points: 0,
      sourceUrl: research.sourceUrl || undefined,
    });
  }

  const history = sponsorshipHistory(company, inputs.asOfYear);
  const recent = recentSponsorships(company, inputs.asOfYear);
  if (history.length > 0) {
    evidence.push({ text: `Documented Thirst Project gala sponsorship in ${history[0].year}${recent.length ? " (within the last three calendar years)" : " (historical; current interest is unconfirmed)"}.`,
      points: recent.length ? 20 : 10, sourceUrl: history[0].sourceUrl });
  } else if (stats && stats.thirstProjectGrants > 0) {
    evidence.push({
      text: `Foundation has already funded Thirst Project (${stats.thirstProjectGrants} grant${
        stats.thirstProjectGrants === 1 ? "" : "s"
      } in the ${filing?.taxYear ?? "latest"} filing).`,
      points: 20,
      sourceUrl: source,
    });
  }

  if (stats) {
    if (stats.waterCount > 0) {
      const share = stats.total > 0 ? stats.waterAmount / stats.total : 0;
      const points = (stats.waterCount >= 3 ? 30 : 20) + (share >= 0.05 ? 5 : 0);
      evidence.push({
        text: `${stats.waterCount} of ${stats.count} grants in the ${filing?.taxYear} filing are water-related (${formatUsd(
          stats.waterAmount,
        )}, ${Math.round(share * 100)}% of grant dollars).`,
        points,
        sourceUrl: source,
      });
    } else {
      evidence.push({
        text: `None of the ${stats.count} grants in the ${filing?.taxYear} filing mention water, sanitation or hygiene.`,
        points: 0,
        sourceUrl: source,
      });
    }
    const adjacentShare = stats.count > 0 ? stats.adjacentCount / stats.count : 0;
    if (adjacentShare >= 0.1) {
      evidence.push({
        text: `${Math.round(adjacentShare * 100)}% of grants fund neighboring causes (youth, education, health, environment).`,
        points: 10,
        sourceUrl: source,
      });
    }
  }

  if (research.focusAreas.length > 0) {
    evidence.push({
      text: `Stated focus areas next to Thirst Project's work: ${research.focusAreas.join(", ")}.`,
      points: Math.min(16, research.focusAreas.length * 8),
      sourceUrl: research.sourceUrl || undefined,
    });
  }

  const tie = INDUSTRY_WATER_TIE[company.industry];
  if (tie) {
    evidence.push({ text: "Industry has a direct business tie to water.", points: tie });
  }

  const hasData = research.waterFocus !== "unknown" || research.focusAreas.length > 0 || stats !== null || history.length > 0;
  if (hasData && research.waterFocus === "unknown") {
    // Foundation grants are only one channel. Until someone reads the company's own
    // reporting, its stated priorities get partial credit instead of none.
    evidence.push({
      text: "The company's own stated priorities have not been reviewed yet. Held at 15 of a possible 40.",
      points: 15,
    });
  }
  let score = clamp(sum(evidence));
  if (!hasData) {
    score = Math.max(score, config.baseline.mission_alignment);
    evidence.unshift({
      text: `No giving priorities on file yet. Held at a neutral ${config.baseline.mission_alignment} until someone reads the company's impact report.`,
      points: null,
    });
  }
  return { key: "mission_alignment", score, hasData, evidence };
}

function peerSignal(inputs: ScoreInputs): FactorScore {
  const { company, filing, peers, industryPeerCompanies, config } = inputs;
  const evidence: Evidence[] = [];
  const nonprofits = [...new Set(peers.map((p) => p.peerNonprofit))];

  if (nonprofits.length > 0) {
    const base = nonprofits.length >= 3 ? 90 : nonprofits.length === 2 ? 75 : 55;
    evidence.push({
      text: `Has supported ${nonprofits.length} other water nonprofit${nonprofits.length === 1 ? "" : "s"}: ${nonprofits.join(", ")}.`,
      points: base,
      sourceUrl: peers.find((p) => p.sourceUrl)?.sourceUrl,
    });
    const total = peers.reduce((t, p) => t + (p.amountUsd ?? 0), 0);
    if (total >= 250_000) {
      evidence.push({ text: `Those gifts total ${formatUsd(total)} on record.`, points: 10 });
    }
  }

  if (industryPeerCompanies >= 2) {
    evidence.push({
      text: `${industryPeerCompanies} other companies in this industry have documented support for water nonprofits (grants or partnerships).`,
      points: 15,
    });
  } else if (industryPeerCompanies === 1) {
    evidence.push({ text: "One other company in this industry has documented support for a water nonprofit.", points: 8 });
  }

  const checked = nonprofits.length > 0 || Boolean(filing?.detailAvailable);
  let score = clamp(sum(evidence));
  if (nonprofits.length === 0) {
    if (checked) {
      evidence.unshift({
        text: "No grants to known water nonprofits in the latest filing, and none listed in the Peers table.",
        points: 0,
        sourceUrl: filingSource(inputs),
      });
    } else {
      score = Math.max(score, config.baseline.peer_signal);
      evidence.unshift({
        text: `Not yet checked against other water nonprofits' sponsor lists. Held at ${config.baseline.peer_signal}.`,
        points: null,
      });
    }
  }
  return { key: "peer_signal", score, hasData: checked, evidence };
}

function capacityFit(inputs: ScoreInputs): FactorScore {
  const { company, filing, config } = inputs;
  const evidence: Evidence[] = [];
  const stats = filing?.stats ?? null;
  const source = filingSource(inputs);
  let score: number;
  let hasData = true;

  const recent = recentSponsorships(company, inputs.asOfYear);
  if (recent.length > 0) {
    const largest = recent.reduce((best, s) => s.amountUsd > best.amountUsd ? s : best);
    score = largest.amountUsd >= 25_000 ? 85 : largest.amountUsd >= 10_000 ? 70 : largest.amountUsd >= 5_000 ? 55 : 40;
    evidence.push({ text: `Largest documented Thirst Project gala sponsorship in the last three calendar years: ${formatUsd(largest.amountUsd)} (${largest.year}). This is an observed past sponsorship, not an annual giving budget or a promised future amount.`, points: score, sourceUrl: largest.sourceUrl });
  } else if (filing && filing.totalGiving !== null) {
    const band = givingBandScore(filing.totalGiving);
    if (stats && stats.count > 0) {
      const inRange = stats.buckets[2] + stats.buckets[3];
      const fraction = inRange / stats.count;
      const fit = Math.min(100, Math.round((fraction / 0.5) * 100));
      evidence.push({
        text: `Foundation paid ${formatUsd(filing.totalGiving)} in grants in ${filing.taxYear}.`,
        points: Math.round(band * 0.6),
        sourceUrl: source,
      });
      evidence.push({
        text: `${Math.round(fraction * 100)}% of its grants fall between $10,000 and $250,000, the range of a realistic first ask${
          stats.median !== null ? ` (median grant ${formatUsd(stats.median)})` : ""
        }.`,
        points: Math.round(fit * 0.4),
        sourceUrl: source,
      });
      score = clamp(band * 0.6 + fit * 0.4);
    } else {
      evidence.push({
        text: `Foundation paid ${formatUsd(filing.totalGiving)} in grants in ${filing.taxYear}. Grant sizes are not available.`,
        points: band,
        sourceUrl: source,
      });
      score = band;
    }
  } else if (company.research.annualGivingUsd !== null) {
    score = givingBandScore(company.research.annualGivingUsd);
    evidence.push({
      text: `Company reports about ${formatUsd(company.research.annualGivingUsd)} in annual giving.`,
      points: score,
      sourceUrl: company.research.sourceUrl || undefined,
    });
  } else if (company.research.sizeBand !== "unknown") {
    score = SIZE_BAND_SCORE[company.research.sizeBand];
    evidence.push({
      text: `No giving total on file. Estimated from company size (${company.research.sizeBand}).`,
      points: score,
    });
  } else {
    hasData = false;
    score = config.baseline.capacity_fit;
    evidence.push({
      text: `No giving total or company size on file. Held at a neutral ${config.baseline.capacity_fit}.`,
      points: null,
    });
  }
  return { key: "capacity_fit", score, hasData, evidence };
}

function accessibility(inputs: ScoreInputs): FactorScore {
  const { company, filing, config } = inputs;
  const { research } = company;
  const evidence: Evidence[] = [];
  const source = filingSource(inputs);

  if (research.applicationProcess === "open") {
    evidence.push({
      text: "Accepts unsolicited proposals or runs an open application.",
      points: 40,
      sourceUrl: research.sourceUrl || undefined,
    });
  } else if (research.applicationProcess === "invite_only") {
    evidence.push({
      text: "Giving is invitation only.",
      points: 5,
      sourceUrl: research.sourceUrl || undefined,
    });
  } else if (filing?.preselectedOnly === true) {
    evidence.push({
      text: "The 990-PF says the foundation only funds preselected organizations and does not accept unsolicited requests.",
      points: 5,
      sourceUrl: source,
    });
  } else if (filing?.preselectedOnly === false) {
    evidence.push({
      text: `The 990-PF lists how to submit a request${
        filing.applicationContact ? ` (contact: ${filing.applicationContact})` : ""
      }.`,
      points: 35,
      sourceUrl: source,
    });
  } else {
    evidence.push({ text: "Application process not yet confirmed.", points: 15 });
  }

  if (filing && filing.officers.length > 0) {
    evidence.push({
      text: `${filing.officers.length} foundation officers and directors are named in the filing.`,
      points: 20,
      sourceUrl: source,
    });
  }
  const history = sponsorshipHistory(company, inputs.asOfYear);
  if (research.warmIntro) {
    evidence.push({ text: "Thirst Project has a warm introduction available.", points: 30 });
  } else if (history.length > 0) {
    evidence.push({ text: `Prior gala sponsor (${history[0].year}). Ask the relationship owner about renewal; an active contact or warm introduction has not been assumed.`,
      points: recentSponsorships(company, inputs.asOfYear).length ? 20 : 10, sourceUrl: history[0].sourceUrl });
  }
  const local = localPresence(research, inputs.asOfYear);
  evidence.push({ text: local.reason, points: local.points, sourceUrl: research.laSourceUrl || undefined });
  if (company.domain) {
    evidence.push({ text: "Company email domain is known, so work emails can be looked up.", points: 5 });
  }

  const hasAccessData =
    research.applicationProcess !== "unknown" ||
    research.warmIntro ||
    history.length > 0 ||
    (filing !== null && (filing.preselectedOnly !== null || filing.officers.length > 0));
  const rawOther = sum(evidence) - local.points;
  const other = hasAccessData ? Math.min(65, rawOther) : Math.min(65, Math.max(rawOther, config.baseline.accessibility));
  evidence.push({ text: "Contact and application evidence occupies up to 65 accessibility points. Documented local presence occupies the remaining 35, so a strong contact score cannot erase the LA distinction.", points: null });
  if (!hasAccessData) evidence.push({ text: `Contact/application evidence is incomplete; that portion uses the neutral ${config.baseline.accessibility} baseline (capped at 65).`, points: null });
  return { key: "accessibility", score: clamp(other + local.points), hasData: hasAccessData || local.verified, evidence };
}

function confidence(inputs: ScoreInputs): FactorScore {
  const { company, filing, peers, asOfYear } = inputs;
  const { research } = company;
  const history = sponsorshipHistory(company, asOfYear);
  const evidence: Evidence[] = [];
  const add = (ok: boolean, points: number, yes: string, no: string) =>
    evidence.push({ text: ok ? yes : no, points: ok ? points : 0 });

  if (history.length > 0) {
    evidence.push({ text: "Thirst Project sponsorship history is documented in the team's source workbook.", points: 25 });
  } else if (company.foundation.status === "matched" && filing) {
    evidence.push({ text: "Corporate foundation identified and its IRS filing found.", points: 25 });
  } else if (company.foundation.status === "none_found") {
    evidence.push({
      text: "No corporate foundation found, so there is no 990-PF to check giving against.",
      points: 15,
    });
  } else {
    evidence.push({ text: "Foundation match has not been confirmed.", points: 0 });
  }

  add(
    Boolean(filing?.detailAvailable) || history.length > 0,
    20,
    "Itemized grant or sponsorship records are available.",
    "No itemized grant or sponsorship records available.",
  );
  add(
    Boolean(filing?.taxYear && filing.taxYear >= asOfYear - 3) || recentSponsorships(company, asOfYear).length > 0,
    10,
    "Recent filing or sponsorship evidence is available.",
    filing?.taxYear ? `Latest filing is from ${filing.taxYear} and may be stale.` : "No recent filing.",
  );
  add(
    research.waterFocus !== "unknown",
    10,
    "Giving priorities reviewed by a researcher.",
    "Giving priorities not yet reviewed by a researcher.",
  );
  add(research.focusAreas.length > 0, 5, "Focus areas recorded.", "Focus areas not recorded.");
  add(
    research.applicationProcess !== "unknown",
    5,
    "Application process confirmed.",
    "Application process not confirmed.",
  );
  add(Boolean(research.sourceUrl), 10, "Research has a source link.", "No source link for manual research.");
  add(
    (filing?.totalGiving ?? research.annualGivingUsd) != null,
    5,
    "Annual giving total is known.",
    "Annual giving total unknown.",
  );
  add(
    peers.length > 0 || Boolean(filing?.detailAvailable),
    10,
    "Checked for support of other water nonprofits.",
    "Not checked against other water nonprofits.",
  );

  return { key: "confidence", score: clamp(sum(evidence)), hasData: true, evidence };
}

export function tierFor(overall: number, config: ScoringConfig): Tier {
  if (overall >= config.tiers.A) return "A";
  if (overall >= config.tiers.B) return "B";
  if (overall >= config.tiers.C) return "C";
  return "D";
}

export function confidenceLabelFor(score: number, config: ScoringConfig): ConfidenceLabel {
  if (score >= config.confidenceLabels.high) return "High";
  if (score >= config.confidenceLabels.medium) return "Medium";
  return "Low";
}

export function scoreCompany(inputs: ScoreInputs): ScoreResult {
  const factors: Record<FactorKey, FactorScore> = {
    mission_alignment: missionAlignment(inputs),
    peer_signal: peerSignal(inputs),
    capacity_fit: capacityFit(inputs),
    accessibility: accessibility(inputs),
    confidence: confidence(inputs),
  };
  const { weights } = inputs.config;
  const totalWeight = FACTOR_ORDER.reduce((t, k) => t + Math.max(0, weights[k]), 0);
  const weighted = FACTOR_ORDER.reduce((t, k) => t + Math.max(0, weights[k]) * factors[k].score, 0);
  const overall = totalWeight > 0 ? Math.round(weighted / totalWeight) : 0;
  const confidenceLabel = confidenceLabelFor(factors.confidence.score, inputs.config);
  return {
    overall,
    tier: tierFor(overall, inputs.config),
    confidenceLabel,
    provisional: confidenceLabel === "Low",
    factors,
  };
}
