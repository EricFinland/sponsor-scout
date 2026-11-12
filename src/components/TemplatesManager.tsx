"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTemplateLibrary } from "./useTemplates";
import { downloadFile, setTemplateDraftDirty } from "@/lib/store";
import {
  fillTemplate,
  hookLine,
  mergeTemplates,
  parseTemplateBackup,
  templateBackup,
  TEMPLATES,
  TEMPLATE_TOKENS,
  validateTemplate,
  type OutreachTemplate,
} from "@/lib/templates";
import { peersForCompany } from "@/lib/peers";
import {
  INDUSTRY_LABELS,
  type Company,
  type FilingSummary,
  type Industry,
  type PeerRow,
} from "@/lib/types";

const fingerprint = (t: OutreachTemplate) =>
  JSON.stringify([t.id, t.label, t.subject, t.body, [...t.industries].sort()]);
const copy = (t: OutreachTemplate): OutreachTemplate => ({
  ...t,
  industries: [...t.industries],
});
export default function TemplatesManager({
  companies,
  summaries,
  peers,
}: {
  companies: Company[];
  summaries: Record<string, FilingSummary>;
  peers: PeerRow[];
}) {
  const { templates, personal, setPersonal } = useTemplateLibrary();
  const [draft, setDraft] = useState(() => copy(templates[0]));
  const [baseline, setBaseline] = useState(() => copy(templates[0]));
  const [newDraft, setNewDraft] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [undo, setUndo] = useState<OutreachTemplate | null>(null);
  const [previewSlug, setPreviewSlug] = useState(companies[0]?.slug ?? "");
  const [recipient, setRecipient] = useState("Alex");
  const [sender, setSender] = useState("Your name\nThirst Project");
  const fileInput = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const dirty = newDraft || fingerprint(draft) !== fingerprint(baseline);
  const personalVersion = personal.find((t) => t.id === draft.id);
  useEffect(() => {
    setTemplateDraftDirty(dirty);
    return () => setTemplateDraftDirty(false);
  }, [dirty]);
  useEffect(() => {
    if (dirty) return;
    const latest = templates.find((t) => t.id === draft.id);
    if (latest && fingerprint(latest) !== fingerprint(baseline)) {
      setDraft(copy(latest));
      setBaseline(copy(latest));
    }
  }, [templates, draft.id, baseline, dirty]);
  function select(template: OutreachTemplate) {
    setDraft(copy(template));
    setBaseline(copy(template));
    setNewDraft(false);
    setError("");
    setMessage("");
    setUndo(null);
    setTemplateDraftDirty(false);
  }
  function change<K extends keyof OutreachTemplate>(
    key: K,
    value: OutreachTemplate[K],
  ) {
    setDraft((t) => ({ ...t, [key]: value }));
    setMessage("");
    setError("");
    setTemplateDraftDirty(true);
  }
  function create() {
    const t: OutreachTemplate = {
      id: `custom-${crypto.randomUUID()}`,
      label: "",
      industries: [],
      subject: "",
      body: "",
    };
    setDraft(t);
    setBaseline(copy(t));
    setNewDraft(true);
    setMessage("");
    setError("");
    setTemplateDraftDirty(true);
    requestAnimationFrame(() => nameInput.current?.focus());
  }
  function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const saved = validateTemplate({
        ...draft,
        updatedAt: new Date().toISOString(),
      });
      setPersonal((current) => {
        const latest = mergeTemplates(current);
        const original = latest.find((t) => t.id === draft.id);
        if (
          !newDraft &&
          (!original || fingerprint(original) !== fingerprint(baseline))
        )
          throw new Error(
            "This template changed in another tab. Copy your draft, then discard changes to load the newer version.",
          );
        if (
          [...TEMPLATES, ...latest].some(
            (t) =>
              t.id !== saved.id &&
              t.label.toLowerCase() === saved.label.toLowerCase(),
          )
        )
          throw new Error(
            "That template name is already in use. Choose another name.",
          );
        return current.some((t) => t.id === saved.id)
          ? current.map((t) => (t.id === saved.id ? saved : t))
          : [...current, saved];
      });
      select(saved);
      setMessage(
        "Saved in this browser. Available in the outreach template menu.",
      );
    } catch (e) {
      setError(
        e instanceof Error && !(e instanceof DOMException)
          ? e.message
          : "Could not save in this browser. Your draft is still here; copy it before leaving.",
      );
    }
  }
  function discard() {
    const latest = templates.find((t) => t.id === draft.id) ?? templates[0];
    select(latest);
  }
  function remove() {
    if (!personalVersion) return;
    try {
      let removed = personalVersion;
      let remaining = personal;
      setPersonal((current) => {
        removed = current.find((t) => t.id === draft.id) ?? personalVersion;
        remaining = current.filter((t) => t.id !== draft.id);
        return remaining;
      });
      const next = mergeTemplates(remaining);
      select(next.find((t) => t.id === draft.id) ?? next[0]);
      setUndo(removed);
      setMessage("Personal version removed from this browser.");
    } catch {
      setError(
        "Could not update browser storage. Your saved version has been kept.",
      );
    }
  }
  function restore() {
    if (!undo) return;
    try {
      setPersonal((current) => {
        if (current.some((t) => t.id === undo.id))
          throw new Error("A newer version already exists.");
        return [...current, undo];
      });
      select(undo);
      setUndo(null);
      setMessage("Personal template restored.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not restore the template.",
      );
    }
  }
  async function importFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setMessage("");
    try {
      if (file.size > 3_000_000)
        throw new Error("Choose a template backup smaller than 3 MB.");
      const incoming = parseTemplateBackup(await file.text());
      if (!incoming.length)
        throw new Error("This backup contains no templates.");
      let added: OutreachTemplate[] = [];
      setPersonal((current) => {
        const names = new Set(
          [...TEMPLATES, ...mergeTemplates(current)].map((t) =>
            t.label.toLowerCase(),
          ),
        );
        added = incoming.map((t) => {
          let label = t.label;
          let n = 2;
          while (names.has(label.toLowerCase()))
            label = `${t.label.slice(0, 70)} (${n++})`;
          names.add(label.toLowerCase());
          return {
            ...t,
            id: `custom-${crypto.randomUUID()}`,
            label,
            updatedAt: new Date().toISOString(),
          };
        });
        return [...current, ...added];
      });
      select(added[0]);
      setMessage(
        `Imported ${added.length} personal template${added.length === 1 ? "" : "s"} as copies. Existing templates were kept.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not import this file.");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  const preview = useMemo(() => {
    const company =
      companies.find((c) => c.slug === previewSlug) ?? companies[0];
    const filing = company?.foundation.ein
      ? (summaries[company.foundation.ein] ?? null)
      : null;
    const hook = company
      ? hookLine(company, filing, peersForCompany(company, peers, filing))
      : "[Company research hook]";
    const values = {
      first: recipient.trim() || "[first name]",
      company: company?.name ?? "[company]",
      hook,
      sender: sender.trim() || "[your name]",
    };
    return {
      subject: fillTemplate(draft.subject, values),
      body: fillTemplate(draft.body, values),
    };
  }, [
    companies,
    summaries,
    peers,
    previewSlug,
    recipient,
    sender,
    draft.subject,
    draft.body,
  ]);
  return (
    <>
      <div className="page-head">
        <h1>Email templates</h1>
        <p className="lede">
          Create and customize reusable outreach emails. Your versions are saved
          in this browser; export a backup to share them or move to another
          device.
        </p>
      </div>
      <div className="template-tools actions">
        <button
          className="button button-primary"
          disabled={dirty}
          onClick={create}
        >
          New template
        </button>
        <button
          className="button"
          disabled={!personal.length}
          onClick={() =>
            downloadFile(
              "sponsor-scout-templates.json",
              templateBackup(personal),
              "application/json",
            )
          }
        >
          Export saved templates
        </button>
        <button
          className="button"
          disabled={dirty}
          onClick={() => fileInput.current?.click()}
        >
          Import templates
        </button>
        <input
          ref={fileInput}
          hidden
          type="file"
          accept=".json,application/json"
          aria-label="Import template backup"
          onChange={(e) => void importFile(e.target.files?.[0])}
        />
      </div>
      {dirty && (
        <p className="template-unsaved" role="status">
          Unsaved changes. Save or discard before choosing another template.
        </p>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="template-message">
          {message}{" "}
          {undo && !dirty && (
            <button className="link-button" onClick={restore}>
              Undo removal
            </button>
          )}
        </p>
      )}
      <div className="template-layout">
        <aside aria-label="Template library">
          <h2>Library</h2>
          <p className="footnote">
            {TEMPLATES.length} starter templates · {personal.length} personal
            {personal.length === 1 ? " version" : " versions"}
          </p>
          <div className="template-list">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                className="template-item"
                aria-pressed={draft.id === t.id}
                disabled={dirty}
                onClick={() => select(t)}
              >
                <strong>{t.label}</strong>
                <span className="sub">
                  {personal.some((p) => p.id === t.id)
                    ? "Personal version"
                    : "Starter template"}
                </span>
              </button>
            ))}
          </div>
        </aside>
        <div>
          <form className="template-editor" onSubmit={save}>
            <h2>{newDraft ? "New template" : "Edit template"}</h2>
            <label className="field">
              <span>Template name</span>
              <input
                ref={nameInput}
                className="input"
                required
                maxLength={80}
                value={draft.label}
                onChange={(e) => change("label", e.target.value)}
              />
            </label>
            <fieldset className="template-industries">
              <legend>Relevant industries</legend>
              <p className="footnote">
                Leave all unchecked for a general-purpose template. Every saved
                template is available in the composer.
              </p>
              <div className="checks">
                {Object.entries(INDUSTRY_LABELS).map(([key, label]) => (
                  <label className="check" key={key}>
                    <input
                      type="checkbox"
                      checked={draft.industries.includes(key as Industry)}
                      onChange={(e) =>
                        change(
                          "industries",
                          e.target.checked
                            ? [...draft.industries, key as Industry]
                            : draft.industries.filter((i) => i !== key),
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="field">
              <span>Email subject</span>
              <input
                className="input"
                required
                maxLength={200}
                value={draft.subject}
                onChange={(e) => change("subject", e.target.value)}
              />
            </label>
            <label className="field">
              <span>Email message</span>
              <textarea
                className="input template-body"
                required
                maxLength={5000}
                rows={13}
                value={draft.body}
                onChange={(e) => change("body", e.target.value)}
              />
            </label>
            <p className="footnote">
              Placeholders:{" "}
              {TEMPLATE_TOKENS.map((t) => (
                <code key={t}>{`{{${t}}} `}</code>
              ))}{" "}
              · {draft.body.length.toLocaleString()} / 5,000 characters.
              Bracketed notes such as [project details] stay for you to fill in.
            </p>
            <div className="actions">
              <button
                className="button button-primary"
                disabled={!dirty}
                type="submit"
              >
                Save my template
              </button>
              {dirty && (
                <button className="button" type="button" onClick={discard}>
                  Discard changes
                </button>
              )}
              {personalVersion && !dirty && (
                <button className="link-button" type="button" onClick={remove}>
                  {TEMPLATES.some((t) => t.id === draft.id)
                    ? "Restore starter version"
                    : "Remove personal template"}
                </button>
              )}
            </div>
          </form>
          <section
            className="template-preview"
            aria-labelledby="template-preview-title"
          >
            <h2 id="template-preview-title">Preview</h2>
            <p className="footnote">
              Check the personalized text before using it in outreach.
            </p>
            <div className="field-row">
              <label className="field">
                <span>Preview company</span>
                <select
                  className="input"
                  value={previewSlug}
                  onChange={(e) => setPreviewSlug(e.target.value)}
                >
                  {companies.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Preview recipient</span>
                <input
                  className="input"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                />
              </label>
            </div>
            <label className="field">
              <span>Preview sender</span>
              <textarea
                className="input"
                rows={2}
                value={sender}
                onChange={(e) => setSender(e.target.value)}
              />
            </label>
            <div className="template-preview-email">
              <p>
                <strong>Subject:</strong> {preview.subject || "[Email subject]"}
              </p>
              <div className="template-preview-body">
                {preview.body || "Your email preview will appear here."}
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
