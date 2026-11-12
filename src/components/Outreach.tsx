"use client";

import { useEffect, useMemo, useState } from "react";
import { splitPersonName } from "@/lib/names";
import { logToSheet, useStore, isReadOnlyWorkspace, isSharedWorkspace } from "@/lib/store";
import { fillTemplate, hookLine, templateFor } from "@/lib/templates";
import { useTemplateLibrary } from "./useTemplates";
import Link from "next/link";
import type { Company, Filing, PeerRow } from "@/lib/types";
import { sponsorshipHistory } from "@/lib/sponsorships";

export default function Outreach({
  company,
  filing,
  peers,
  disabled,
}: {
  company: Company;
  filing: Filing | null;
  peers: PeerRow[];
  disabled: boolean;
}) {
  const [sender, setSender] = useStore("sender");
  const [, setOutreach] = useStore("outreach");
  const {templates, personal} = useTemplateLibrary();
  const [templateId, setTemplateId] = useState(() => templateFor(company.industry, templates).id);
  const [contact, setContact] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("");

  const template = templates.find((t) => t.id === templateId) ?? templateFor(company.industry, templates);
  useEffect(() => {
    if (!templates.some((t) => t.id === templateId)) setTemplateId(templateFor(company.industry, templates).id);
  }, [templates, templateId, company.industry]);
  const hook = useMemo(() => hookLine(company, filing, peers), [company, filing, peers]);

  // Rebuild the draft when the template, recipient or sender changes. Edits made
  // in the text box hold until one of those changes.
  useEffect(() => {
    const values = {
      first: contact ? splitPersonName(contact).first : "[first name]",
      company: company.name,
      hook,
      sender: sender.trim() || "[your name]\nThirst Project",
    };
    setSubject(fillTemplate(template.subject, values));
    setBody(fillTemplate(template.body, values));
    setStatus("");
  }, [template, contact, sender, hook, company.name]);

  const blanks = (body.match(/\[[^\]]+\]/g) ?? []).length;
  const officers = filing?.officers ?? [];

  async function copy() {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      setStatus("Copied.");
    } catch {
      setStatus("Copy was blocked by the browser. Select the text and copy it by hand.");
    }
  }

  function log() {
    const entry = {
      id: `${Date.now()}`,
      date: new Date().toISOString().slice(0, 10),
      company: company.name,
      contact,
      channel: "Email",
      template: template.label,
      status: "Drafted",
      notes: "",
    };
    setOutreach((current) => [entry, ...current]);
    logToSheet("Outreach Tracker", entry);
    setStatus("Added to the tracker.");
  }

  if (disabled) {
    return <p className="empty">Outreach drafts are off for existing partners.</p>;
  }
  if (sponsorshipHistory(company, new Date().getFullYear()).length > 0) {
    return <p className="empty">This organization has sponsored Thirst Project before. Coordinate a renewal with the relationship owner before creating outreach; cold email drafts are disabled.</p>;
  }

  return (
    <div className="outreach">
      <div className="field-row">
        <label className="field">
          <span>Template</span>
          <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}{personal.some((p) => p.id === t.id) ? " (Personal)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>To</span>
          <input
            className="input"
            list="outreach-contacts"
            placeholder="Contact's name"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
          />
          <datalist id="outreach-contacts">
            {officers.map((o) => (
              <option key={o.name} value={o.name}>
                {o.title}
              </option>
            ))}
          </datalist>
        </label>
        <label className="field">
          <span>From</span>
          <input
            className="input"
            placeholder="Your name"
            value={sender}
            onChange={(e) => setSender(e.target.value)}
          />
        </label>
      </div>
      <p className="footnote"><Link href="/templates" prefetch={false} onClick={(event) => {
        if (!isSharedWorkspace() || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); window.history.pushState(null, "", "/templates"); window.scrollTo(0, 0);
      }}>Add or edit email templates</Link>. Personal versions are saved in this browser.</p>

      <label className="field">
        <span>Subject</span>
        <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </label>
      <label className="field">
        <span>Message</span>
        <textarea className="input draft" rows={16} value={body} onChange={(e) => setBody(e.target.value)} />
      </label>

      <div className="actions">
        <button type="button" className="button button-primary" onClick={copy}>
          Copy email
        </button>
        <a
          className="button"
          href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
        >
          Open in mail app
        </a>
        <button type="button" className="button" disabled={isReadOnlyWorkspace()} onClick={log}>
          Log to tracker
        </button>
        <span className="status" role="status">
          {status ||
            (blanks > 0
              ? `${blanks} bracketed blank${blanks === 1 ? "" : "s"} left to fill in before sending.`
              : "")}
        </span>
      </div>
    </div>
  );
}
