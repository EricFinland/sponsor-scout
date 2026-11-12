"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import CompanyTable from "./CompanyTable";
import LookupClient from "./LookupClient";
import TrackerClient from "./TrackerClient";
import MethodContent from "./MethodContent";
import TemplatesManager from "./TemplatesManager";
import { formatUsd } from "@/lib/format";
import { WORKSPACE_PATHS, type WorkspaceCatalog } from "@/lib/workspace-model";

/** Main views stay mounted with the authenticated workspace, including filters and drafts. */
export default function WorkspaceViews({ data, children }: { data: WorkspaceCatalog; children: React.ReactNode }) {
  const path = usePathname();
  const entries = data.companies.map((company) => ({ company, filing: company.foundation.ein ? data.summaries[company.foundation.ein] ?? null : null,
    alreadyPartner: company.relationshipStatus === "current_partner" || data.partnerSlugs.includes(company.slug) }));
  const filings = entries.flatMap((entry) => entry.filing ? [entry.filing] : []);
  useEffect(() => {
    const titles: Record<string, string> = { "/": "Sponsor Scout", "/lookup": "Look up a company | Sponsor Scout", "/tracker": "Tracker | Sponsor Scout", "/templates": "Email templates | Sponsor Scout", "/method": "Method | Sponsor Scout" };
    if (titles[path]) document.title = titles[path];
    else {
      const company = data.companies.find((item) => path === `/company/${item.slug}`);
      if (company) document.title = `${company.name} | Sponsor Scout`;
    }
  }, [path, data.companies]);
  return <>
    <div hidden={path !== "/"} data-workspace-page="companies">
      <CompanyTable entries={entries} peersTable={data.peers} defaultConfig={data.config}
        intro={<><h1>Corporate sponsor research</h1><p className="lede">Look up a company to see what it gives, who it already funds in the water sector, who to contact, and how it scores as a prospect for Thirst Project.</p></>}
        stats={<dl className="stats">
          <div className="stat"><dt>companies on file</dt><dd>{entries.length}</dd></div>
          <div className="stat"><dt>in yearly foundation giving analyzed</dt><dd>{formatUsd(filings.reduce((n, f) => n + (f.totalGiving ?? 0), 0))}</dd></div>
          <div className="stat"><dt>individual grants read</dt><dd>{filings.reduce((n, f) => n + (f.stats?.count ?? 0), 0).toLocaleString("en-US")}</dd></div>
          <div className="stat"><dt>water-related grants found</dt><dd>{filings.reduce((n, f) => n + (f.stats?.waterCount ?? 0), 0)}</dd></div>
        </dl>} />
    </div>
    <div hidden={path !== "/lookup"} data-workspace-page="lookup"><LookupClient known={data.companies} peersTable={data.peers} defaultConfig={data.config} hunterEnabled={data.hunterEnabled} /></div>
    <div hidden={path !== "/tracker"} data-workspace-page="tracker"><div className="page-head"><h1>Tracker</h1><p className="lede">Outreach, company lookups and research notes. Changes are shared across the workspace.</p></div><TrackerClient sheetConnected /></div>
    <div hidden={path !== "/method"} data-workspace-page="method"><MethodContent config={data.config} shared /></div>
    <div hidden={path !== "/templates"} data-workspace-page="templates"><TemplatesManager companies={data.companies} peers={data.peers} summaries={data.summaries} /></div>
    {!WORKSPACE_PATHS.some((p) => p === path) && children}
  </>;
}
