"use client";

import { LA_LABELS, localPresence } from "@/lib/local-presence";
import type { PublicRecord } from "@/lib/public-record";
import { fitSignals } from "@/lib/scoring";
import type { Company, PeerRow, Sponsorship } from "@/lib/types";
import { ETHICS_LABELS } from "@/lib/types";
import { External } from "./ui";

type Status = "good" | "flag" | "none" | "open";

function Row({ label, status, children }: { label: string; status: Status; children: React.ReactNode }) {
  return (
    <div className={`fit-row fit-${status}`}>
      <dt>
        <span className="fit-dot" aria-hidden="true" />
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * The four questions that decide whether a company is worth approaching when
 * there is no foundation filing to lean on: is it local, has it backed
 * nonprofits before, does it report on its giving, and is it a values fit.
 */
export default function SponsorFit({
  company,
  peers,
  history,
  record,
}: {
  company: Company;
  peers: PeerRow[];
  history: Sponsorship[];
  record: PublicRecord | null;
}) {
  const { research } = company;
  const fit = fitSignals(research);
  const local = localPresence(research, new Date().getFullYear());
  const laKind = research.laPresence ?? "unknown";
  const waterPeers = [...new Set(peers.map((p) => p.peerNonprofit))];

  const laStatus: Status = local.points > 0 ? "good" : laKind === "unknown" ? "open" : "none";
  const pastStatus: Status = history.length > 0 || waterPeers.length > 0 || fit.partners.length > 0 ? "good" : "open";
  const csrStatus: Status = fit.csr === "yes" ? "good" : fit.csr === "no" ? "none" : "open";
  const ethicsStatus: Status =
    fit.ethics === "clear" ? "good" : fit.ethics === "review" || fit.ethics === "conflict" ? "flag" : "open";

  return (
    <dl className="fit">
      <Row label="LA presence" status={laStatus}>
        <p>
          <strong>{LA_LABELS[laKind]}.</strong> {local.reason}
        </p>
        {research.laSourceUrl && <External href={research.laSourceUrl}>Location source</External>}
        {laKind === "unknown" && record?.hqCity && (
          <p className="fit-suggest">
            Public record{record.matchedBy === "name" ? ` (closest name match: ${record.label}${record.description ? `, ${record.description}` : ""})` : ""}: Wikidata lists {record.label}&apos;s headquarters as {record.hqCity}
            {record.county ? `, in ${record.county} County` : ", outside the LA area"}.{" "}
            {record.county
              ? "Confirm it under Research notes to count it toward the score."
              : "Check for an LA office before ruling local presence out."}{" "}
            <External href={record.url}>Wikidata record</External>
          </p>
        )}
      </Row>

      <Row label="Past nonprofit work" status={pastStatus}>
        {pastStatus === "open" ? (
          <p>No nonprofit partnerships on record yet. Check the company&apos;s impact report and press releases.</p>
        ) : (
          <ul className="fit-list">
            {history.length > 0 && (
              <li>
                Sponsored Thirst Project&apos;s gala ({[...new Set(history.map((h) => h.year))].join(", ")}).
              </li>
            )}
            {waterPeers.length > 0 && <li>Funded water nonprofits: {waterPeers.join(", ")}.</li>}
            {fit.partners.length > 0 && <li>Partnered with: {fit.partners.join(", ")}.</li>}
          </ul>
        )}
      </Row>

      <Row label="CSR and giving" status={csrStatus === "open" && fit.programs.length > 0 ? "good" : csrStatus}>
        <p>
          {fit.csr === "yes"
            ? "Publishes a CSR, impact or sustainability report."
            : fit.csr === "no"
              ? "No CSR, impact or sustainability report found."
              : "CSR reporting not checked yet."}
          {fit.programs.length > 0 && ` Giving programs: ${fit.programs.join(", ")}.`}
        </p>
      </Row>

      <Row label="Values and ethics" status={ethicsStatus}>
        <p>
          <strong>{ETHICS_LABELS[fit.ethics]}.</strong>
          {research.ethicsNotes ? ` ${research.ethicsNotes}` : ""}
          {fit.credentials.length > 0 && ` Commitments: ${fit.credentials.join(", ")}.`}
        </p>
        {research.ethicsSourceUrl && <External href={research.ethicsSourceUrl}>Ethics source</External>}
      </Row>
    </dl>
  );
}
