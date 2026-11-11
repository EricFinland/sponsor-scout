"use client";

import Link from "next/link";
import { useMemo } from "react";
import { formatEin, formatUsd, formatUsdExact } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Company, Filing, PeerRow, ScoringConfig } from "@/lib/types";
import { FACTOR_LABELS, FACTOR_ORDER, INDUSTRY_LABELS } from "@/lib/types";
import Contacts from "./Contacts";
import Giving from "./Giving";
import Outreach from "./Outreach";
import ResearchForm from "./ResearchForm";
import { Bar, ConfidenceText, External, Notice, ScoreScale, TIER_MEANING, TierMark } from "./ui";
import { score, useCompanyWithResearch, useConfig } from "./useScore";
import { sponsorshipHistory } from "@/lib/sponsorships";
import { localPresence, LA_LABELS } from "@/lib/local-presence";

interface Props {
  company: Company;
  filing: Filing | null;
  peersTable: PeerRow[];
  defaultConfig: ScoringConfig;
  alreadyPartner: boolean;
  hunterEnabled: boolean;
  /** "lookup" profiles are not part of the bundled dataset and can be saved to this browser. */
  mode: "dataset" | "lookup";
}

export default function ProfileView({
  company: baseCompany,
  filing,
  peersTable,
  defaultConfig,
  alreadyPartner,
  hunterEnabled,
  mode,
}: Props) {
  const company = useCompanyWithResearch(baseCompany);
  const config = useConfig(defaultConfig);
  const [prospects, setProspects] = useStore("prospects");
  const { result, peers, industryPeers } = useMemo(
    () => score(company, filing, peersTable, config),
    [company, filing, peersTable, config],
  );

  const totalWeight = FACTOR_ORDER.reduce((t, k) => t + Math.max(0, config.weights[k]), 0) || 1;
  const saved = prospects.some((p) => p.company.slug === company.slug);
  const place = company.hqState || filing?.state || "";
  const history = sponsorshipHistory(company, new Date().getFullYear());
  const local = localPresence(company.research, new Date().getFullYear());
  const otherIndustryPeers = [
    ...new Set(
      peersTable.filter((p) => p.industry === company.industry && p.company !== company.name).map((p) => p.company),
    ),
  ];

  function toggleSaved() {
    setProspects((current) => {
      if (current.some((p) => p.company.slug === company.slug)) {
        return current.filter((p) => p.company.slug !== company.slug);
      }
      return [...current, { company, filing, savedAt: new Date().toISOString() }];
    });
  }

  return (
    <article className="profile">
      <header className="profile-head">
        <div className="profile-title">
          <p className="crumbs">
            <Link href="/">Companies</Link>
            <span aria-hidden="true"> / </span>
            {company.name}
          </p>
          <h1>{company.name}</h1>
          <p className="meta">
            {[INDUSTRY_LABELS[company.industry], place, company.domain].filter(Boolean).join("  ·  ")}
          </p>
          {filing ? (
            <p className="meta">
              Gives through {filing.name}, EIN {formatEin(filing.ein)}
              {filing.taxYear ? `. Latest filing on record: ${filing.taxYear}.` : "."}
            </p>
          ) : company.foundation.status === "none_found" ? (
            <p className="meta">No corporate foundation found in IRS records.</p>
          ) : (
            <p className="meta">
              Foundation not confirmed.{" "}
              <Link href={`/lookup?q=${encodeURIComponent(company.name)}`}>Check the candidates</Link>
            </p>
          )}
          {mode === "lookup" && (
            <p className="profile-actions">
              <button type="button" className="button" onClick={toggleSaved}>
                {saved ? "Remove from my list" : "Save to my list"}
              </button>
              <span className="quiet">
                {saved ? "Saved in this browser. It now appears on the Companies page." : "Not saved yet."}
              </span>
            </p>
          )}
        </div>

        <div className="scorecard">
          <div className="scorecard-top">
            <span className="scorecard-value">{result.overall}</span>
            <div className="scorecard-detail">
              <span className="scorecard-tier">
                <TierMark tier={result.tier} large />
                {result.provisional ? "Needs research" : TIER_MEANING[result.tier]}
              </span>
              <span className="scorecard-line">Score out of 100</span>
              <span className="scorecard-line">
                Confidence{" "}
                <ConfidenceText label={result.confidenceLabel} score={result.factors.confidence.score} />
              </span>
            </div>
          </div>
          <ScoreScale score={result.overall} tier={result.tier} tiers={config.tiers} />
        </div>
      </header>

      {alreadyPartner && (
        <Notice tone="stop">
          <strong>Already a Thirst Project partner.</strong> Do not send cold outreach. Talk to whoever manages the
          relationship first.
        </Notice>
      )}
      {history.length > 0 && !alreadyPartner && <Notice><strong>Previous gala sponsor.</strong> Coordinate with Thirst Project&apos;s relationship owner before approaching this organization. Historical support does not establish an active partnership today.</Notice>}
      {result.provisional && (
        <Notice tone="warn">
          <strong>Provisional score.</strong> There is not enough on file to rank this company with confidence. About ten
          minutes with its impact report, entered under Research notes, will firm this up.
        </Notice>
      )}
      {filing?.grantsInAttachment && !filing.detailAvailable && (
        <Notice>
          This foundation files its grant list as a PDF attachment instead of itemized data, so individual grants cannot
          be analyzed here. The totals are still accurate. The filing PDF is linked under Sources.
        </Notice>
      )}

      <div className="profile-grid">
        <div className="profile-main">
          <section aria-labelledby="local-presence"><h2 id="local-presence">LA presence</h2>
            <p><strong>{LA_LABELS[company.research.laPresence ?? "unknown"]}</strong>. {local.reason}</p>
            {company.research.laEvidence && <p>{company.research.laEvidence}</p>}
            {company.research.laSourceUrl && <External href={company.research.laSourceUrl}>Location source</External>}
          </section>
          {history.length > 0 && <section aria-labelledby="sponsorship-history"><h2 id="sponsorship-history">Thirst Project sponsorship history</h2>
            <p className="footnote">Gala sponsorship records from the team workbook. These are separate from foundation grants and support for other nonprofits.</p>
            <div className="table-wrap"><table className="data"><thead><tr><th>Year</th><th>Event</th><th>Relationship</th><th className="num">Amount</th><th>Source</th></tr></thead>
              <tbody>{history.map((s) => <tr key={s.id}><td>{s.year}</td><td>{s.event}</td><td>{s.relationship}</td><td className="num">{formatUsdExact(s.amountUsd)}</td><td><External href={s.sourceUrl}>Source row {s.sourceRow}</External></td></tr>)}</tbody></table></div>
          </section>}
          <section aria-labelledby="why">
            <h2 id="why">Why this score</h2>
            <div className="factors">
              {FACTOR_ORDER.map((key) => {
                const factor = result.factors[key];
                const share = Math.round((Math.max(0, config.weights[key]) / totalWeight) * 100);
                return (
                  <div className="factor" key={key}>
                    <div className="factor-head">
                      <h3>{FACTOR_LABELS[key]}</h3>
                      <span className="factor-weight">{share}% of score</span>
                      <Bar value={factor.score} tone={factor.hasData ? "ink" : "muted"} />
                      <span className="factor-score">{factor.score}</span>
                    </div>
                    <ul className="evidence">
                      {factor.evidence.map((item, i) => (
                        <li key={i} className={item.points === 0 ? "evidence-zero" : undefined}>
                          <span className="evidence-points">
                            {item.points === null ? "" : item.points > 0 ? `+${item.points}` : "0"}
                          </span>
                          <span>
                            {item.text}
                            {item.sourceUrl && (
                              <>
                                {" "}
                                <External href={item.sourceUrl}>Source</External>
                              </>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
            <p className="footnote">
              Each factor is capped at 100. The overall score is the weighted average. Rules and weights are on the{" "}
              <Link href="/method">Method</Link> page.
            </p>
          </section>

          <section aria-labelledby="giving">
            <h2 id="giving">Giving history</h2>
            {filing ? (
              <Giving filing={filing} />
            ) : (
              <p className="empty">
                No 990-PF data for this company
                {company.research.annualGivingUsd
                  ? `. Its own reporting puts annual giving at about ${formatUsd(company.research.annualGivingUsd)}.`
                  : ". Giving has to come from its impact or CSR report. Record what you find under Research notes."}
              </p>
            )}
          </section>

          <section aria-labelledby="peers">
            <h2 id="peers">Support for other water nonprofits</h2>
            {peers.length > 0 ? (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Nonprofit</th>
                      <th>Type</th>
                      <th>Year</th>
                      <th className="num">Amount</th>
                      <th>For</th>
                    </tr>
                  </thead>
                  <tbody>
                    {peers.map((row, i) => (
                      <tr key={i}>
                        <td>
                          {row.sourceUrl ? <External href={row.sourceUrl}>{row.peerNonprofit}</External> : row.peerNonprofit}
                        </td>
                        <td className="nowrap">{row.relationship}</td>
                        <td>{row.year ?? ""}</td>
                        <td className="num">{row.amountUsd !== null ? formatUsdExact(row.amountUsd) : ""}</td>
                        <td className="wrap">{row.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty">
                {filing?.detailAvailable
                  ? "No grants to known water nonprofits in the latest filing, and nothing in the Peers table."
                  : "Nothing in the Peers table yet. Sponsor lists in other water nonprofits' annual reports are the place to check."}
              </p>
            )}
            {industryPeers > 0 && (
              <p className="footnote">
                Others in this industry already funding water nonprofits: {otherIndustryPeers.join(", ")}.
              </p>
            )}
          </section>

          <section aria-labelledby="contacts">
            <h2 id="contacts">Who to contact</h2>
            <Contacts company={company} filing={filing} hunterEnabled={hunterEnabled} />
          </section>

          <section aria-labelledby="outreach">
            <h2 id="outreach">Outreach email</h2>
            <Outreach company={company} filing={filing} peers={peers} disabled={alreadyPartner} />
          </section>
        </div>

        <aside className="profile-side">
          <ResearchForm company={company} hasFoundation={Boolean(filing)} />
          {filing && (
            <div className="side-block">
              <h2>Sources</h2>
              <ul className="plain">
                {filing.sources.map((source) => (
                  <li key={source.url}>
                    <External href={source.url}>{source.label}</External>
                  </li>
                ))}
              </ul>
              <p className="footnote">Filing data pulled {new Date(filing.fetchedAt).toLocaleDateString("en-US")}.</p>
            </div>
          )}
        </aside>
      </div>
    </article>
  );
}
