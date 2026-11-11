"use client";

import { useMemo, useState } from "react";
import { formatUsd, formatUsdExact } from "@/lib/format";
import type { Filing } from "@/lib/types";

type Filter = "all" | "water" | "peer";
const PAGE = 25;

export default function Giving({ filing }: { filing: Filing }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);

  const stats = filing.stats;
  const years = filing.history.filter((y) => y.giving !== null);
  const peak = Math.max(1, ...years.map((y) => y.giving ?? 0));

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return filing.grants.filter((g) => {
      if (filter === "water" && !g.water) return false;
      if (filter === "peer" && !g.peer) return false;
      if (needle && !`${g.recipient} ${g.purpose} ${g.place}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [filing.grants, filter, query]);

  const peerCount = filing.grants.filter((g) => g.peer).length;
  const pick = (next: Filter) => {
    setFilter(next);
    setShown(PAGE);
  };

  return (
    <>
      <p className="summary">
        {filing.name} paid <strong>{formatUsd(filing.totalGiving)}</strong> in grants in {filing.taxYear}
        {stats ? (
          <>
            {" "}
            across {stats.count.toLocaleString("en-US")} grant{stats.count === 1 ? "" : "s"}
            {stats.median !== null ? `, with a median of ${formatUsd(stats.median)}` : ""}.{" "}
            {stats.waterCount > 0
              ? `${stats.waterCount} mention water, sanitation or hygiene, worth ${formatUsd(stats.waterAmount)}.`
              : "None mention water, sanitation or hygiene."}
          </>
        ) : (
          "."
        )}
      </p>

      {years.length > 1 && (
        <div className="years" role="img" aria-label="Grants paid by year">
          {years.map((y) => (
            <div className="year" key={y.year}>
              <span className="year-label">{y.year}</span>
              <span className="year-bar">
                <span style={{ width: `${((y.giving ?? 0) / peak) * 100}%` }} />
              </span>
              <span className="year-value">{formatUsd(y.giving)}</span>
            </div>
          ))}
        </div>
      )}

      {filing.grants.length > 0 && (
        <>
          <div className="table-tools">
            <div className="tabs" role="tablist" aria-label="Filter grants">
              <button type="button" role="tab" aria-selected={filter === "all"} onClick={() => pick("all")}>
                All grants <span className="quiet">{filing.grants.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filter === "water"}
                onClick={() => pick("water")}
                disabled={!stats?.waterCount}
              >
                Water-related <span className="quiet">{stats?.waterCount ?? 0}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filter === "peer"}
                onClick={() => pick("peer")}
                disabled={peerCount === 0}
              >
                Known water nonprofits <span className="quiet">{peerCount}</span>
              </button>
            </div>
            <input
              type="search"
              className="input input-small"
              placeholder="Filter by recipient or purpose"
              aria-label="Filter grants by recipient or purpose"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShown(PAGE);
              }}
            />
          </div>

          <div className="table-wrap">
            <table className="data grants">
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Purpose</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, shown).map((g, i) => (
                  <tr key={`${g.recipient}-${g.amount}-${i}`}>
                    <td>
                      <span className="recipient">{g.recipient}</span>
                      <span className="sub">
                        {[g.place, g.peer ? "Known water nonprofit" : g.water ? "Water-related" : ""]
                          .filter(Boolean)
                          .join("  ·  ")}
                      </span>
                    </td>
                    <td className="wrap">{g.purpose}</td>
                    <td className="num">{formatUsdExact(g.amount)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={3} className="empty-cell">
                      No grants match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="table-foot">
            <span>
              Showing {Math.min(shown, rows.length)} of {rows.length}
              {filing.grantsTruncated && filter === "all" && !query
                ? `. The filing lists ${stats?.count.toLocaleString("en-US")} grants. The largest ${filing.grants.length} are loaded here, plus every water-related one.`
                : "."}
            </span>
            {rows.length > shown && (
              <button type="button" className="link-button" onClick={() => setShown((n) => n + PAGE * 2)}>
                Show more
              </button>
            )}
          </p>
        </>
      )}
    </>
  );
}
