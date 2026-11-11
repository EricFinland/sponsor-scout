import CompanyTable, { type TableEntry } from "@/components/CompanyTable";
import { COMPANIES, DEFAULT_CONFIG, getFiling, isExistingPartner, PEERS, summarize } from "@/lib/data";
import { formatUsd } from "@/lib/format";

export default function HomePage() {
  const entries: TableEntry[] = COMPANIES.map((company) => ({
    company,
    filing: summarize(getFiling(company.foundation.ein)),
    alreadyPartner: isExistingPartner(company.name),
  }));

  const filings = entries.flatMap((entry) => (entry.filing ? [entry.filing] : []));
  const giving = filings.reduce((total, f) => total + (f.totalGiving ?? 0), 0);
  const grants = filings.reduce((total, f) => total + (f.stats?.count ?? 0), 0);
  const waterGrants = filings.reduce((total, f) => total + (f.stats?.waterCount ?? 0), 0);

  return (
    <CompanyTable
      entries={entries}
      peersTable={PEERS}
      defaultConfig={DEFAULT_CONFIG}
      intro={
        <>
          <h1>Corporate sponsor research</h1>
          <p className="lede">
            Look up a company to see what it gives, who it already funds in the water sector, who to contact, and how
            it scores as a prospect for Thirst Project.
          </p>
        </>
      }
      stats={
        <dl className="stats">
          <div className="stat">
            <dt>companies on file</dt>
            <dd>{entries.length}</dd>
          </div>
          <div className="stat">
            <dt>in yearly foundation giving analyzed</dt>
            <dd>{formatUsd(giving)}</dd>
          </div>
          <div className="stat">
            <dt>individual grants read</dt>
            <dd>{grants.toLocaleString("en-US")}</dd>
          </div>
          <div className="stat">
            <dt>water-related grants found</dt>
            <dd>{waterGrants.toLocaleString("en-US")}</dd>
          </div>
        </dl>
      }
    />
  );
}
