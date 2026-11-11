"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { sameCompany } from "@/lib/names";
import { useStore } from "@/lib/store";
import type { Company, FactorKey, FilingSummary, Industry, PeerRow, ScoreResult, ScoringConfig, Tier } from "@/lib/types";
import { INDUSTRY_LABELS } from "@/lib/types";
import { ConfidenceText, TierMark } from "./ui";
import { score, useConfig } from "./useScore";

export interface TableEntry {
  company: Company;
  filing: FilingSummary | null;
  alreadyPartner: boolean;
}

interface Row extends TableEntry {
  result: ScoreResult;
  href: string;
  savedLookup: boolean;
}

type SortKey = "name" | "overall" | FactorKey;

const COLUMNS: { key: SortKey; label: string; title?: string }[] = [
  { key: "overall", label: "Score" },
  { key: "mission_alignment", label: "Mission", title: "Mission alignment" },
  { key: "peer_signal", label: "Peers", title: "Peer signal" },
  { key: "capacity_fit", label: "Capacity", title: "Capacity fit" },
  { key: "accessibility", label: "Access", title: "Accessibility" },
  { key: "confidence", label: "Confidence" },
];

const TIERS: Tier[] = ["A", "B", "C", "D"];

export default function CompanyTable({
  entries,
  peersTable,
  defaultConfig,
}: {
  entries: TableEntry[];
  peersTable: PeerRow[];
  defaultConfig: ScoringConfig;
}) {
  const router = useRouter();
  const config = useConfig(defaultConfig);
  const [research] = useStore("research");
  const [prospects] = useStore("prospects");
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState<Tier | "all">("all");
  const [industry, setIndustry] = useState<Industry | "all">("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "overall", dir: -1 });

  const rows = useMemo<Row[]>(() => {
    const bundled = entries.map((entry) => ({ ...entry, savedLookup: false }));
    const saved = prospects
      .filter((p) => !entries.some((e) => e.company.slug === p.company.slug))
      .map((p) => ({ company: p.company, filing: p.filing, alreadyPartner: false, savedLookup: true }));
    return [...bundled, ...saved].map((entry) => {
      const company = research[entry.company.slug]
        ? { ...entry.company, research: research[entry.company.slug] }
        : entry.company;
      const params = new URLSearchParams({
        q: company.name,
        ein: entry.filing?.ein ?? "none",
        industry: company.industry,
      });
      return {
        ...entry,
        company,
        result: score(company, entry.filing, peersTable, config).result,
        href: entry.savedLookup ? `/lookup?${params}` : `/company/${company.slug}`,
      };
    });
  }, [entries, prospects, research, peersTable, config]);

  const counts = useMemo(() => {
    const tally: Record<Tier, number> = { A: 0, B: 0, C: 0, D: 0 };
    rows.forEach((r) => (tally[r.result.tier] += 1));
    return tally;
  }, [rows]);
  const provisional = rows.filter((r) => r.result.provisional).length;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const value = (r: Row) =>
      sort.key === "name" ? r.company.name.toLowerCase() : sort.key === "overall" ? r.result.overall : r.result.factors[sort.key].score;
    return rows
      .filter((r) => tier === "all" || r.result.tier === tier)
      .filter((r) => industry === "all" || r.company.industry === industry)
      .filter((r) => !needle || `${r.company.name} ${r.filing?.name ?? ""}`.toLowerCase().includes(needle))
      .sort((a, b) => {
        const av = value(a);
        const bv = value(b);
        if (av < bv) return -1 * sort.dir;
        if (av > bv) return 1 * sort.dir;
        return a.company.name.localeCompare(b.company.name);
      });
  }, [rows, tier, industry, query, sort]);

  const industries = [...new Set(rows.map((r) => r.company.industry))];

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const name = query.trim();
    if (!name) return;
    const exact = rows.find((r) => sameCompany(r.company.name, name));
    router.push(exact ? exact.href : `/lookup?q=${encodeURIComponent(name)}`);
  }

  function sortBy(key: SortKey) {
    setSort((current) => (current.key === key ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: key === "name" ? 1 : -1 }));
  }

  const aria = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none");

  return (
    <>
      <form className="search" onSubmit={submit} role="search">
        <label htmlFor="company-search">Company name</label>
        <div className="search-row">
          <input
            id="company-search"
            className="input input-large"
            placeholder="Type any company, for example Costco"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="button button-primary button-large">
            Look up
          </button>
        </div>
        <p className="footnote">
          Typing filters the list below. Press Enter to open a company, or to research one that is not on the list yet.
        </p>
      </form>

      <section aria-labelledby="on-file" className="on-file">
        <div className="section-head">
          <h2 id="on-file">On file</h2>
          <p className="tier-summary">
            {rows.length} companies.{" "}
            {TIERS.map((t) => (
              <span key={t} className="tier-count">
                <TierMark tier={t} /> {counts[t]}
              </span>
            ))}
            {provisional > 0 && <span className="tier-note">{provisional} are provisional, awaiting research.</span>}
          </p>
        </div>

        <div className="table-tools">
          <div className="tabs" role="tablist" aria-label="Filter by tier">
            <button type="button" role="tab" aria-selected={tier === "all"} onClick={() => setTier("all")}>
              All tiers
            </button>
            {TIERS.map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tier === t} onClick={() => setTier(t)}>
                Tier {t}
              </button>
            ))}
          </div>
          <select
            className="input input-small"
            aria-label="Filter by industry"
            value={industry}
            onChange={(e) => setIndustry(e.target.value as Industry | "all")}
          >
            <option value="all">All industries</option>
            {industries.map((i) => (
              <option key={i} value={i}>
                {INDUSTRY_LABELS[i]}
              </option>
            ))}
          </select>
        </div>

        <div className="table-wrap">
          <table className="data companies">
            <thead>
              <tr>
                <th aria-sort={aria("name")}>
                  <button type="button" onClick={() => sortBy("name")}>
                    Company
                  </button>
                </th>
                <th>Tier</th>
                {COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    className={`num${column.key === "overall" || column.key === "confidence" ? "" : " optional"}`}
                    aria-sort={aria(column.key)}
                    title={column.title}
                  >
                    <button type="button" onClick={() => sortBy(column.key)}>
                      {column.label}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.company.slug}>
                  <td>
                    <Link href={row.href} className="company-link">
                      {row.company.name}
                    </Link>
                    <span className="sub">
                      {[
                        INDUSTRY_LABELS[row.company.industry],
                        row.filing?.name ??
                          (row.company.foundation.status === "none_found" ? "No foundation found" : "Foundation not confirmed"),
                        row.alreadyPartner ? "Existing partner" : "",
                        row.savedLookup ? "Saved lookup" : "",
                      ]
                        .filter(Boolean)
                        .join("  ·  ")}
                    </span>
                  </td>
                  <td>
                    <TierMark tier={row.result.tier} />
                  </td>
                  <td className="num strong">
                    {row.result.overall}
                    {row.result.provisional && (
                      <span className="provisional" title="Provisional: limited research on file">
                        *
                      </span>
                    )}
                  </td>
                  <td className="num optional">{row.result.factors.mission_alignment.score}</td>
                  <td className="num optional">{row.result.factors.peer_signal.score}</td>
                  <td className="num optional">{row.result.factors.capacity_fit.score}</td>
                  <td className="num optional">{row.result.factors.accessibility.score}</td>
                  <td className="num">
                    <ConfidenceText label={row.result.confidenceLabel} score={row.result.factors.confidence.score} />
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty-cell">
                    {query.trim()
                      ? `Nothing on file matches "${query.trim()}". Press Enter to research it.`
                      : "No companies match these filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {provisional > 0 && <p className="footnote">* Provisional. Not enough research on file to rank with confidence.</p>}
      </section>
    </>
  );
}
