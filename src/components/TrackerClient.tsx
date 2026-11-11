"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { formatDate, toCsv } from "@/lib/format";
import { downloadFile, exportAll, importAll, useStore } from "@/lib/store";

const STATUSES = ["Drafted", "Sent", "Replied", "Meeting set", "Declined", "No response"];

export default function TrackerClient({ sheetConnected }: { sheetConnected: boolean }) {
  const [outreach, setOutreach] = useStore("outreach");
  const [searches, setSearches] = useStore("searches");
  const [prospects] = useStore("prospects");
  const [research] = useStore("research");
  const [message, setMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const researchRows = Object.entries(research);

  const update = (id: string, field: "status" | "notes", value: string) =>
    setOutreach((rows) => rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)));

  async function restore(file: File | undefined) {
    if (!file) return;
    try {
      importAll(JSON.parse(await file.text()));
      setMessage("Backup restored.");
    } catch {
      setMessage("That file is not a Sponsor Scout backup.");
    }
  }

  return (
    <div className="tracker">
      <p className="footnote">
        {sheetConnected
          ? "Connected to the team Google Sheet. New lookups, saved notes and logged outreach are also appended there."
          : "Not connected to a Google Sheet. Everything below is kept in this browser only. Setup steps are in docs/SHEET_SYNC.md."}
      </p>

      <section aria-labelledby="t-outreach">
        <div className="section-head">
          <h2 id="t-outreach">Outreach</h2>
          <button
            type="button"
            className="link-button"
            disabled={outreach.length === 0}
            onClick={() =>
              downloadFile(
                "outreach-tracker.csv",
                toCsv(outreach as unknown as Record<string, unknown>[], [
                  "date",
                  "company",
                  "contact",
                  "channel",
                  "template",
                  "status",
                  "notes",
                ]),
              )
            }
          >
            Export CSV
          </button>
        </div>
        {outreach.length > 0 ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Company</th>
                  <th>Contact</th>
                  <th>Template</th>
                  <th>Status</th>
                  <th>Notes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {outreach.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDate(row.date)}</td>
                    <td>{row.company}</td>
                    <td>{row.contact || <span className="quiet">Not named</span>}</td>
                    <td>{row.template}</td>
                    <td>
                      <select
                        className="input input-small"
                        aria-label={`Status for ${row.company}`}
                        value={row.status}
                        onChange={(e) => update(row.id, "status", e.target.value)}
                      >
                        {STATUSES.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="input input-small"
                        aria-label={`Notes for ${row.company}`}
                        value={row.notes}
                        onChange={(e) => update(row.id, "notes", e.target.value)}
                      />
                    </td>
                    <td className="num">
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => setOutreach((rows) => rows.filter((r) => r.id !== row.id))}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">
            Nothing logged yet. Open a company, draft the email at the bottom of its profile, and choose Log to tracker.
          </p>
        )}
      </section>

      <section aria-labelledby="t-saved">
        <div className="section-head">
          <h2 id="t-saved">Saved lookups</h2>
        </div>
        {prospects.length > 0 ? (
          <ul className="rows">
            {prospects.map((p) => (
              <li key={p.company.slug}>
                <div>
                  <Link
                    className="row-title"
                    href={`/lookup?${new URLSearchParams({
                      q: p.company.name,
                      ein: p.filing?.ein ?? "none",
                      industry: p.company.industry,
                      ...(p.company.domain ? { domain: p.company.domain } : {}),
                    })}`}
                  >
                    {p.company.name}
                  </Link>
                  <span className="sub">
                    {p.filing?.name ?? "No foundation"}  ·  saved {formatDate(p.savedAt)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">Companies you look up and save appear here and in the main list.</p>
        )}
      </section>

      <section aria-labelledby="t-research">
        <div className="section-head">
          <h2 id="t-research">Research notes</h2>
          <button
            type="button"
            className="link-button"
            disabled={researchRows.length === 0}
            onClick={() =>
              downloadFile(
                "research-notes.csv",
                toCsv(
                  researchRows.map(([slug, r]) => ({
                    company: slug,
                    water_focus: r.waterFocus,
                    focus_areas: r.focusAreas.join("; "),
                    application_process: r.applicationProcess,
                    annual_giving_usd: r.annualGivingUsd ?? "",
                    size_band: r.sizeBand,
                    warm_intro: r.warmIntro ? "yes" : "no",
                    source_url: r.sourceUrl,
                    notes: r.notes,
                    updated_at: r.updatedAt ?? "",
                  })),
                  [
                    "company",
                    "water_focus",
                    "focus_areas",
                    "application_process",
                    "annual_giving_usd",
                    "size_band",
                    "warm_intro",
                    "source_url",
                    "notes",
                    "updated_at",
                  ],
                ),
              )
            }
          >
            Export CSV
          </button>
        </div>
        <p className="empty">
          {researchRows.length > 0
            ? `Notes saved for ${researchRows.length} compan${researchRows.length === 1 ? "y" : "ies"}: ${researchRows
                .map(([slug]) => slug)
                .join(", ")}.`
            : "No research notes saved in this browser yet."}
        </p>
      </section>

      <section aria-labelledby="t-searches">
        <div className="section-head">
          <h2 id="t-searches">Lookup log</h2>
          <span className="head-actions">
            <button
              type="button"
              className="link-button"
              disabled={searches.length === 0}
              onClick={() =>
                downloadFile(
                  "search-log.csv",
                  toCsv(searches as unknown as Record<string, unknown>[], [
                    "date",
                    "query",
                    "result",
                    "score",
                    "tier",
                    "confidence",
                  ]),
                )
              }
            >
              Export CSV
            </button>
            <button type="button" className="link-button" disabled={searches.length === 0} onClick={() => setSearches([])}>
              Clear
            </button>
          </span>
        </div>
        {searches.length > 0 ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Searched</th>
                  <th>Matched</th>
                  <th className="num">Score</th>
                  <th>Tier</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {searches.slice(0, 50).map((row, i) => (
                  <tr key={`${row.date}-${i}`}>
                    <td>{formatDate(row.date)}</td>
                    <td>{row.query}</td>
                    <td>{row.result}</td>
                    <td className="num">{row.score}</td>
                    <td>{row.tier}</td>
                    <td>{row.confidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">Lookups of companies outside the starter list are recorded here.</p>
        )}
      </section>

      <section aria-labelledby="t-backup">
        <div className="section-head">
          <h2 id="t-backup">Backup</h2>
        </div>
        <p className="actions">
          <button
            type="button"
            className="button"
            onClick={() => downloadFile("sponsor-scout-backup.json", JSON.stringify(exportAll(), null, 2), "application/json")}
          >
            Download everything
          </button>
          <button type="button" className="button" onClick={() => fileInput.current?.click()}>
            Restore from a backup
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => restore(e.target.files?.[0])}
          />
          <span className="status" role="status">
            {message}
          </span>
        </p>
      </section>
    </div>
  );
}
