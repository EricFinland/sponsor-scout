"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatEin } from "@/lib/format";
import { sameCompany, slugify } from "@/lib/names";
import { logToSheet, useStore } from "@/lib/store";
import type { Company, Filing, FoundationCandidate, Industry, PeerRow, ScoringConfig } from "@/lib/types";
import { EMPTY_RESEARCH, INDUSTRY_LABELS } from "@/lib/types";
import ProfileView from "./ProfileView";
import { External, Notice } from "./ui";
import { score, useConfig } from "./useScore";

interface Props {
  known: Company[];
  peersTable: PeerRow[];
  defaultConfig: ScoringConfig;
  hunterEnabled: boolean;
}

type Search =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; candidates: FoundationCandidate[]; alreadyPartner: boolean }
  | { state: "error"; message: string };

type Loaded = { state: "idle" } | { state: "loading" } | { state: "ready"; filing: Filing | null } | { state: "error"; message: string };

const INDUSTRIES = Object.keys(INDUSTRY_LABELS) as Industry[];

export default function LookupClient({ known, peersTable, defaultConfig, hunterEnabled }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const q = params.get("q")?.trim() ?? "";
  const ein = params.get("ein") ?? "";
  const industryParam = params.get("industry") as Industry | null;
  const industry: Industry = industryParam && INDUSTRIES.includes(industryParam) ? industryParam : "other";
  const domain = params.get("domain") ?? "";

  const [name, setName] = useState(q);
  const [search, setSearch] = useState<Search>({ state: "idle" });
  const [choice, setChoice] = useState("");
  const [pickedIndustry, setPickedIndustry] = useState<Industry>(industry);
  const [pickedDomain, setPickedDomain] = useState(domain);
  const [loaded, setLoaded] = useState<Loaded>({ state: "idle" });
  const [partner, setPartner] = useState(false);
  const config = useConfig(defaultConfig);
  const [, setSearches] = useStore("searches");
  const logged = useRef("");

  const existing = known.find((k) => sameCompany(k.name, q) || k.aliases?.some((alias) => sameCompany(alias, q)));
  const confirming = Boolean(q) && !ein;
  const showingProfile = Boolean(q) && Boolean(ein);

  useEffect(() => setName(q), [q]);

  // Step 2: find foundation candidates for the company name.
  useEffect(() => {
    if (!q) {
      setSearch({ state: "idle" });
      return;
    }
    let cancelled = false;
    setSearch({ state: "loading" });
    fetch(`/api/foundations?q=${encodeURIComponent(q)}`)
      .then(async (response) => {
        const body = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setSearch({ state: "error", message: body.error ?? "Search failed." });
          return;
        }
        setSearch({ state: "ready", candidates: body.candidates, alreadyPartner: body.alreadyPartner });
        setPartner(Boolean(body.alreadyPartner));
        setChoice((current) => current || (body.candidates[0]?.match >= 90 ? body.candidates[0].ein : ""));
      })
      .catch(() => !cancelled && setSearch({ state: "error", message: "Search failed. Check your connection." }));
    return () => {
      cancelled = true;
    };
  }, [q]);

  // Step 3: load the confirmed foundation's filing.
  useEffect(() => {
    if (!showingProfile) {
      setLoaded({ state: "idle" });
      return;
    }
    if (ein === "none") {
      setLoaded({ state: "ready", filing: null });
      return;
    }
    let cancelled = false;
    setLoaded({ state: "loading" });
    fetch(`/api/filing/${ein}?company=${encodeURIComponent(q)}`)
      .then(async (response) => {
        const body = await response.json();
        if (cancelled) return;
        setLoaded(response.ok ? { state: "ready", filing: body.filing } : { state: "error", message: body.error ?? "Could not load the filing." });
      })
      .catch(() => !cancelled && setLoaded({ state: "error", message: "Could not load the filing. Check your connection." }));
    return () => {
      cancelled = true;
    };
  }, [showingProfile, ein, q]);

  const company = useMemo<Company | null>(() => {
    if (!showingProfile || loaded.state !== "ready") return null;
    return {
      ...existing,
      slug: existing?.slug ?? slugify(q),
      name: existing?.name ?? q,
      industry: industryParam ? industry : existing?.industry ?? industry,
      domain: domain || existing?.domain || "",
      hqState: existing?.hqState ?? "",
      foundation: loaded.filing
        ? { status: "matched", ein: loaded.filing.ein, name: loaded.filing.name }
        : { status: "none_found", ein: null, name: null },
      research: existing?.research ?? { ...EMPTY_RESEARCH },
    };
  }, [showingProfile, loaded, q, industry, industryParam, domain, existing]);

  // Record each completed lookup once.
  useEffect(() => {
    if (!company || loaded.state !== "ready") return;
    const key = `${company.slug}|${ein}`;
    if (logged.current === key) return;
    logged.current = key;
    const { result } = score(company, loaded.filing, peersTable, config);
    const entry = {
      date: new Date().toISOString(),
      query: q,
      result: loaded.filing ? `${loaded.filing.name} (${formatEin(loaded.filing.ein)})` : "No foundation",
      score: result.overall,
      tier: result.tier,
      confidence: result.confidenceLabel,
    };
    setSearches((current) => [entry, ...current].slice(0, 500));
    logToSheet("Search Log", entry);
  }, [company, loaded, ein, q, peersTable, config, setSearches]);

  function go(next: Record<string, string>) {
    const query = new URLSearchParams(next);
    router.push(`/lookup?${query}`);
  }

  function submitName(event: React.FormEvent) {
    event.preventDefault();
    const value = name.trim();
    if (value.length < 2) return;
    setChoice("");
    go({ q: value });
  }

  function confirm(event: React.FormEvent) {
    event.preventDefault();
    if (!choice) return;
    const cleanDomain = pickedDomain.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    go({ q, ein: choice, industry: pickedIndustry, ...(cleanDomain ? { domain: cleanDomain } : {}) });
  }

  if (showingProfile) {
    if (loaded.state === "error") {
      return (
        <div className="narrow">
          <Notice tone="stop">{loaded.message}</Notice>
          <p>
            <Link href={`/lookup?q=${encodeURIComponent(q)}`}>Back to the foundation list</Link>
          </p>
        </div>
      );
    }
    if (!company || loaded.state !== "ready") {
      return <p className="loading">Reading the latest IRS filing. Large foundations take a few seconds.</p>;
    }
    return (
      <ProfileView
        company={company}
        filing={loaded.filing}
        peersTable={peersTable}
        defaultConfig={defaultConfig}
        alreadyPartner={partner}
        hunterEnabled={hunterEnabled}
        mode="lookup"
      />
    );
  }

  return (
    <>
      <div className="page-head">
        <h1>Look up a company</h1>
        <p className="lede">
          Enter a company and confirm which foundation is theirs. Giving history, officers and a score follow from
          its latest IRS filing.
        </p>
      </div>
      <div className="narrow">

      <form className="search" onSubmit={submitName} role="search">
        <label htmlFor="lookup-name">Company name</label>
        <div className="search-row">
          <input
            id="lookup-name"
            className="input input-large"
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="button button-primary button-large">
            Find foundations
          </button>
        </div>
      </form>

      {confirming && existing && (
        <Notice>
          {existing.name} is already on file. <Link href={`/company/${existing.slug}`}>Open its profile</Link>
        </Notice>
      )}
      {confirming && search.state === "loading" && <p className="loading">Searching IRS-registered nonprofits.</p>}
      {confirming && search.state === "error" && <Notice tone="stop">{search.message}</Notice>}

      {confirming && search.state === "ready" && (
        <form className="confirm" onSubmit={confirm}>
          <h2>Which of these is {q}&apos;s foundation?</h2>
          <p className="footnote">
            Names can mislead. Family foundations, scholarship funds and employee trusts often carry a company&apos;s
            name. Check the city, and open the record if unsure.
          </p>
          <ul className="candidates">
            {search.candidates.map((candidate) => (
              <li key={candidate.ein}>
                <label>
                  <input
                    type="radio"
                    name="foundation"
                    value={candidate.ein}
                    checked={choice === candidate.ein}
                    onChange={() => setChoice(candidate.ein)}
                  />
                  <span>
                    <span className="row-title">{candidate.name}</span>
                    <span className="sub">
                      {[candidate.city, candidate.state].filter(Boolean).join(", ")}  ·  EIN {formatEin(candidate.ein)}
                    </span>
                  </span>
                </label>
                <External href={`https://projects.propublica.org/nonprofits/organizations/${Number(candidate.ein)}`}>
                  View record
                </External>
              </li>
            ))}
            <li>
              <label>
                <input
                  type="radio"
                  name="foundation"
                  value="none"
                  checked={choice === "none"}
                  onChange={() => setChoice("none")}
                />
                <span>
                  <span className="row-title">
                    {search.candidates.length === 0 ? "No foundation found. Continue without one." : "None of these"}
                  </span>
                  <span className="sub">
                    The profile will rely on manual research and be marked provisional until it is filled in.
                  </span>
                </span>
              </label>
            </li>
          </ul>

          <div className="field-row">
            <label className="field">
              <span>Industry</span>
              <select
                className="input"
                value={pickedIndustry}
                onChange={(e) => setPickedIndustry(e.target.value as Industry)}
              >
                {INDUSTRIES.map((i) => (
                  <option key={i} value={i}>
                    {INDUSTRY_LABELS[i]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Company web domain (optional)</span>
              <input
                className="input"
                placeholder="example.com"
                value={pickedDomain}
                onChange={(e) => setPickedDomain(e.target.value)}
              />
            </label>
          </div>

          <div className="actions">
            <button type="submit" className="button button-primary" disabled={!choice}>
              Build profile
            </button>
            {!choice && <span className="status">Choose one to continue.</span>}
          </div>
        </form>
      )}
      </div>
    </>
  );
}
