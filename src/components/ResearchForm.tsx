"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";
import { logToSheet, useStore, isSharedWorkspace, isReadOnlyWorkspace } from "@/lib/store";
import { LA_LABELS } from "@/lib/local-presence";
import type { Company, Research } from "@/lib/types";
import { ETHICS_CREDENTIALS, ETHICS_LABELS, FOCUS_AREAS, GIVING_PROGRAMS } from "@/lib/types";
import { laFieldsFrom, type PublicRecord } from "@/lib/public-record";

/**
 * The questions a filing cannot answer. A researcher fills these in from the
 * company's impact or CSR report, and the score updates as soon as they save.
 */
export default function ResearchForm({
  company,
  hasFoundation,
  record = null,
}: {
  company: Company;
  hasFoundation: boolean;
  /** A Wikidata headquarters match, offered as a one-click fill for the LA fields. */
  record?: PublicRecord | null;
}) {
  const [, setStored] = useStore("research");
  const [draft, setDraft] = useState<Research>(company.research);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(company.research);
  }, [company.research]);

  const [partnersText, setPartnersText] = useState((company.research.nonprofitPartners ?? []).join("; "));
  useEffect(() => {
    setPartnersText((company.research.nonprofitPartners ?? []).join("; "));
  }, [company.research.nonprofitPartners]);
  const laFill = record ? laFieldsFrom(record, new Date().toISOString().slice(0, 10)) : null;
  const toggle = (key: "givingPrograms" | "ethicsCredentials", item: string, on: boolean) => {
    const current = draft[key] ?? [];
    change(key, on ? [...current, item] : current.filter((x) => x !== item));
  };

  const change = <K extends keyof Research>(key: K, value: Research[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  function save(event: React.FormEvent) {
    event.preventDefault();
    const partners = [...new Set(partnersText.split(/[;\n]/).map((p) => p.trim()).filter(Boolean))];
    const next = {
      ...draft,
      nonprofitPartners: partners,
      sourceUrl: draft.sourceUrl.trim(),
      ethicsSourceUrl: (draft.ethicsSourceUrl ?? "").trim(),
      updatedAt: new Date().toISOString(),
    };
    setStored((current) => ({ ...current, [company.slug]: next }));
    logToSheet("Profiles", {
      company: company.name,
      water_focus: next.waterFocus,
      focus_areas: next.focusAreas.join("; "),
      application_process: next.applicationProcess,
      annual_giving_usd: next.annualGivingUsd ?? "",
      size_band: next.sizeBand,
      warm_intro: next.warmIntro ? "yes" : "no",
      source_url: next.sourceUrl,
      notes: next.notes,
      updated_at: next.updatedAt,
    });
    setSaved(true);
  }

  return (
    <form className="side-block research" onSubmit={save}>
      <fieldset className="editable-fields" disabled={isReadOnlyWorkspace()} aria-label="Research notes">
      <h2>Research notes</h2>
      <p className="footnote">
        {isReadOnlyWorkspace() ? "Shared research is view-only here. Make changes in the private Google Sheet." : <>What the filings cannot tell us. Fill in from the company&apos;s impact or CSR report and the score updates when you save.</>}
      </p>

      <label className="field">
        <span>Does the company name water as a priority?</span>
        <select
          className="input"
          value={draft.waterFocus}
          onChange={(e) => change("waterFocus", e.target.value as Research["waterFocus"])}
        >
          <option value="unknown">Not checked yet</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>

      <fieldset className="field">
        <legend>Stated focus areas</legend>
        <div className="checks">
          {FOCUS_AREAS.map((area) => (
            <label key={area} className="check">
              <input
                type="checkbox"
                checked={draft.focusAreas.includes(area)}
                onChange={(e) =>
                  change(
                    "focusAreas",
                    e.target.checked ? [...draft.focusAreas, area] : draft.focusAreas.filter((a) => a !== area),
                  )
                }
              />
              {area}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span>How do nonprofits apply?</span>
        <select
          className="input"
          value={draft.applicationProcess}
          onChange={(e) => change("applicationProcess", e.target.value as Research["applicationProcess"])}
        >
          <option value="unknown">Not confirmed</option>
          <option value="open">Open application or accepts proposals</option>
          <option value="invite_only">Invitation only</option>
        </select>
      </label>

      {!hasFoundation && (
        <>
          <label className="field">
            <span>Annual giving, in dollars</span>
            <input
              className="input"
              inputMode="numeric"
              placeholder="From the impact report"
              value={draft.annualGivingUsd ?? ""}
              onChange={(e) => {
                const digits = e.target.value.replace(/[^\d]/g, "");
                change("annualGivingUsd", digits ? Number(digits) : null);
              }}
            />
          </label>
          <label className="field">
            <span>Company size</span>
            <select
              className="input"
              value={draft.sizeBand}
              onChange={(e) => change("sizeBand", e.target.value as Research["sizeBand"])}
            >
              <option value="unknown">Not recorded</option>
              <option value="small">Small, under $50M revenue</option>
              <option value="mid">Mid-size, $50M to $1B</option>
              <option value="large">Large, $1B to $10B</option>
              <option value="enterprise">Enterprise, over $10B</option>
            </select>
          </label>
        </>
      )}

      <label className="check">
        <input type="checkbox" checked={draft.warmIntro} onChange={(e) => change("warmIntro", e.target.checked)} />
        We have a warm introduction
      </label>

      <label className="field">
        <span>Source link</span>
        <input
          className="input"
          type="url"
          placeholder="https://"
          value={draft.sourceUrl}
          onChange={(e) => change("sourceUrl", e.target.value)}
        />
      </label>

      <fieldset className="local-research"><legend>Nonprofit history and CSR</legend>
        <p className="footnote">For companies without a foundation filing, these carry most of the score. Use the company&apos;s impact report, CSR page or press releases.</p>
        <label className="field">
          <span>Nonprofits it has partnered with or sponsored</span>
          <textarea className="input" rows={2} placeholder="One per line, or separated by semicolons" value={partnersText}
            onChange={(e) => { setPartnersText(e.target.value); setSaved(false); }} />
        </label>
        <label className="field">
          <span>Publishes a CSR, impact or sustainability report?</span>
          <select className="input" value={draft.csrReport ?? "unknown"} onChange={(e) => change("csrReport", e.target.value as Research["csrReport"])}>
            <option value="unknown">Not checked yet</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <fieldset className="field">
          <legend>Giving programs it runs</legend>
          <div className="checks">
            {GIVING_PROGRAMS.map((program) => (
              <label key={program} className="check">
                <input type="checkbox" checked={(draft.givingPrograms ?? []).includes(program)} onChange={(e) => toggle("givingPrograms", program, e.target.checked)} />
                {program}
              </label>
            ))}
          </div>
        </fieldset>
      </fieldset>

      <fieldset className="local-research"><legend>Values and ethics</legend>
        <p className="footnote">Flag anything that would embarrass Thirst Project or clash with a student audience: water-use disputes, pollution, labor abuses, or products like alcohol, tobacco, vaping, gambling and firearms. &ldquo;Concern&rdquo; holds the company below Tier A. &ldquo;Not a fit&rdquo; drops it to Tier D and turns off outreach.</p>
        <label className="field">
          <span>Ethics screen</span>
          <select className="input" value={draft.ethicsCheck ?? "unknown"} onChange={(e) => change("ethicsCheck", e.target.value as Research["ethicsCheck"])}>
            {Object.entries(ETHICS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <fieldset className="field">
          <legend>Public commitments</legend>
          <div className="checks checks-single">
            {ETHICS_CREDENTIALS.map((credential) => (
              <label key={credential} className="check">
                <input type="checkbox" checked={(draft.ethicsCredentials ?? []).includes(credential)} onChange={(e) => toggle("ethicsCredentials", credential, e.target.checked)} />
                {credential}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="field"><span>What the screen found</span><textarea className="input" rows={2} value={draft.ethicsNotes ?? ""} onChange={(e) => change("ethicsNotes", e.target.value)} /></label>
        <label className="field"><span>Ethics source URL</span><input className="input" type="url" placeholder="https://" value={draft.ethicsSourceUrl ?? ""} onChange={(e) => change("ethicsSourceUrl", e.target.value)} /></label>
      </fieldset>

      <fieldset className="local-research"><legend>LA accessibility evidence</legend>
        <p className="footnote">Local presence reserves 35 of 100 accessibility points: LA County headquarters +35, office +30, operating facility +20, retail +10. Office/headquarters in Orange, Ventura, Riverside or San Bernardino County +15. Only the strongest location counts. An HTTPS source, supporting evidence, city/county and a review this or last calendar year are required.</p>
        {laFill && record && (
          <p className="fit-suggest">
            Wikidata lists {record.label}&apos;s headquarters as {record.hqCity}, in {record.county} County.{" "}
            <button type="button" className="link-button" onClick={() => setDraft((current) => ({ ...current, ...laFill }))}>
              Use this
            </button>{" "}
            then Save notes to count it.
          </p>
        )}
        <label className="field"><span>Local presence</span><select className="input" value={draft.laPresence ?? "unknown"} onChange={(e) => change("laPresence", e.target.value as Research["laPresence"])}>
          {Object.entries(LA_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label className="field"><span>Local city</span><input className="input" value={draft.laCity ?? ""} onChange={(e) => change("laCity", e.target.value)} /></label>
        <label className="field"><span>County</span><select className="input" value={draft.laCounty ?? ""} onChange={(e) => change("laCounty", e.target.value)}>
          <option value="">Not recorded</option>{["Los Angeles", "Orange", "Ventura", "Riverside", "San Bernardino", "Other"].map((c) => <option key={c}>{c}</option>)}
        </select></label>
        <label className="field"><span>Location source URL</span><input className="input" type="url" value={draft.laSourceUrl ?? ""} onChange={(e) => change("laSourceUrl", e.target.value)} /></label>
        <label className="field"><span>Location reviewed on</span><input className="input" type="date" max={new Date().toISOString().slice(0, 10)} value={draft.laVerifiedAt ?? ""} onChange={(e) => change("laVerifiedAt", e.target.value)} /></label>
        <label className="field"><span>Supporting location evidence</span><textarea className="input" rows={3} value={draft.laEvidence ?? ""} onChange={(e) => change("laEvidence", e.target.value)} /></label>
      </fieldset>

      <label className="field">
        <span>Notes</span>
        <textarea className="input" rows={3} value={draft.notes} onChange={(e) => change("notes", e.target.value)} />
      </label>

      <div className="actions">
        <button type="submit" className="button button-primary">
          Save notes
        </button>
        <span className="status" role="status">
          {saved
            ? isSharedWorkspace() ? "Shared save queued. Check the save status above." : "Saved in this browser."
            : company.research.updatedAt
              ? `Last saved ${formatDate(company.research.updatedAt)}.`
              : ""}
        </span>
      </div>
      </fieldset>
    </form>
  );
}
