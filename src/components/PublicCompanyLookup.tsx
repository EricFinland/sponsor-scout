"use client";
import { useEffect, useRef, useState } from "react";
import {
  PROVIDERS,
  PROVIDER_NAMES,
  parseCompanyEvidence,
  type CompanyCandidate,
  type CompanyProvider,
  type CompanyRecord,
} from "@/lib/company-evidence";
import { formatUsd } from "@/lib/format";
import { External } from "./ui";

type SourceState = {
  query: string;
  status: "searching" | "ready" | "reading" | "error";
  candidates: CompanyCandidate[];
  selected: string;
  record?: CompanyRecord;
  error?: string;
};
export default function PublicCompanyLookup({
  query,
  onChange,
}: {
  query: string;
  onChange: (records: CompanyRecord[], pending: boolean) => void;
}) {
  const [sources, setSources] = useState<
    Partial<Record<CompanyProvider, SourceState>>
  >({});
  const controllers = useRef(new Map<CompanyProvider, AbortController>());
  function search(provider: CompanyProvider, q: string) {
    controllers.current.get(provider)?.abort();
    const controller = new AbortController();
    controllers.current.set(provider, controller);
    setSources((old) => ({
      ...old,
      [provider]: {
        query: q,
        status: "searching",
        candidates: [],
        selected: "",
      },
    }));
    fetch(`/api/company-data?provider=${provider}&q=${encodeURIComponent(q)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Source unavailable.");
        if (!controller.signal.aborted)
          setSources((old) => ({
            ...old,
            [provider]: {
              query: q,
              status: "ready",
              candidates: data.candidates,
              selected: "",
            },
          }));
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setSources((old) => ({
            ...old,
            [provider]: {
              query: q,
              status: "error",
              candidates: [],
              selected: "",
              error: e.message,
            },
          }));
      });
  }
  useEffect(() => {
    for (const provider of PROVIDERS) search(provider, query);
    const active = controllers.current;
    return () => active.forEach((controller) => controller.abort());
  }, [query]);
  useEffect(() => {
    const current = Object.values(sources).filter((s) => s.query === query);
    onChange(
      current.flatMap((s) => (s.record ? [s.record] : [])),
      current.some((s) => s.status === "reading"),
    );
  }, [sources, query, onChange]);
  function select(provider: CompanyProvider, id: string) {
    controllers.current.get(provider)?.abort();
    const controller = new AbortController();
    controllers.current.set(provider, controller);
    setSources((old) => ({
      ...old,
      [provider]: {
        ...old[provider]!,
        selected: id,
        record: undefined,
        error: undefined,
        status: id ? "reading" : "ready",
      },
    }));
    if (!id) return;
    fetch(`/api/company-data?provider=${provider}&id=${id}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "Could not read this record.");
        const parsed = parseCompanyEvidence({
          version: 1,
          confirmedAt: new Date().toISOString(),
          records: [data.record],
        });
        if (
          !parsed ||
          parsed.records[0].id !== id ||
          parsed.records[0].provider !== provider
        )
          throw new Error("The source returned an invalid company record.");
        if (!controller.signal.aborted)
          setSources((old) => ({
            ...old,
            [provider]: {
              ...old[provider]!,
              status: "ready",
              record: parsed.records[0],
            },
          }));
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setSources((old) => ({
            ...old,
            [provider]: {
              ...old[provider]!,
              status: "error",
              record: undefined,
              error: e.message,
            },
          }));
      });
  }
  return (
    <section
      className="public-company-lookup"
      aria-labelledby="public-company-title"
    >
      <h2 id="public-company-title">Company data</h2>
      <p>
        Choose records for the same company. Check the legal name and location;
        subsidiaries and parent companies can appear separately. Only selected
        records are used when you build the profile.
      </p>
      <div className="public-source-grid">
        {PROVIDERS.map((provider) => {
          const source =
            sources[provider]?.query === query ? sources[provider] : undefined;
          return (
            <div className="public-source" key={provider}>
              <h3>{PROVIDER_NAMES[provider]}</h3>
              {!source || source.status === "searching" ? (
                <p role="status">Searching {PROVIDER_NAMES[provider]}…</p>
              ) : (
                <>
                  <label className="field">
                    <span>{PROVIDER_NAMES[provider]} company</span>
                    <select
                      className="input"
                      value={source.selected}
                      onChange={(e) => select(provider, e.target.value)}
                    >
                      <option value="">Skip this source</option>
                      {source.candidates.map((c) => (
                        <option value={c.id} key={c.id}>
                          {c.name} — {c.description}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!source.candidates.length && !source.error && (
                    <p className="footnote">
                      No matching records. This does not establish that the
                      company lacks funding or an LA office.
                    </p>
                  )}
                  {source.status === "reading" && (
                    <p role="status">Reading selected company…</p>
                  )}
                  {source.error && (
                    <p role="alert">
                      {source.error}{" "}
                      <button
                        type="button"
                        className="link-button"
                        onClick={() =>
                          source.selected
                            ? select(provider, source.selected)
                            : search(provider, query)
                        }
                      >
                        Retry {PROVIDER_NAMES[provider]}
                      </button>
                    </p>
                  )}
                  {source.record && (
                    <>
                      <p>
                        <External href={source.record.url}>
                          {source.record.name}
                        </External>
                      </p>
                      <p className="footnote">{source.record.description}</p>
                      <dl className="public-facts">
                        {source.record.domain && (
                          <>
                            <dt>Website</dt>
                            <dd>{source.record.domain}</dd>
                          </>
                        )}
                        {source.record.headquarters && (
                          <>
                            <dt>Headquarters</dt>
                            <dd>
                              {[
                                source.record.headquarters.city,
                                source.record.headquarters.region,
                                source.record.headquarters.country,
                              ]
                                .filter(Boolean)
                                .join(", ")}
                              {source.record.headquarters.county
                                ? ` · ${source.record.headquarters.county} County`
                                : " · county unconfirmed"}
                            </dd>
                          </>
                        )}
                        {!!source.record.industries?.length && (
                          <>
                            <dt>Industry</dt>
                            <dd>{source.record.industries.join(", ")}</dd>
                          </>
                        )}
                        {source.record.revenue && (
                          <>
                            <dt>Annual revenue</dt>
                            <dd>
                              <External href={source.record.revenue.url}>
                                {formatUsd(source.record.revenue.usd)} · year
                                ended {source.record.revenue.end}
                              </External>
                            </dd>
                          </>
                        )}
                      </dl>
                      {source.record.warnings?.map((w) => (
                        <p className="footnote" key={w}>
                          {w}
                        </p>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      <p className="footnote">
        Free public APIs; no AI processing. Revenue indicates company size, not
        sponsorship spending. Business and registered addresses are not assumed
        to be headquarters. Selected data stays a preview until you save it.
      </p>
    </section>
  );
}
