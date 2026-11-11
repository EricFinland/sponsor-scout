"use client";

import { useEffect, useMemo, useState } from "react";
import { splitPersonName } from "@/lib/names";
import { logToSheet, useStore } from "@/lib/store";
import { fillTemplate, hookLine, templateFor, TEMPLATES } from "@/lib/templates";
import type { Company, Filing, PeerRow } from "@/lib/types";

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
  const [templateId, setTemplateId] = useState(() => templateFor(company.industry).id);
  const [contact, setContact] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("");

  const template = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];
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

  return (
    <div className="outreach">
      <div className="field-row">
        <label className="field">
          <span>Template</span>
          <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
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
        <button type="button" className="button" onClick={log}>
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
