import CompanyTable, { type TableEntry } from "@/components/CompanyTable";
import { COMPANIES, DEFAULT_CONFIG, getFiling, isExistingPartner, PEERS, summarize } from "@/lib/data";

export default function HomePage() {
  const entries: TableEntry[] = COMPANIES.map((company) => ({
    company,
    filing: summarize(getFiling(company.foundation.ein)),
    alreadyPartner: isExistingPartner(company.name),
  }));

  return (
    <>
      <div className="page-head">
        <h1>Corporate sponsor research</h1>
        <p className="lede">
          Look up a company to see what it gives, who it already funds in the water sector, who to contact, and how it
          scores as a prospect for Thirst Project.
        </p>
      </div>
      <CompanyTable entries={entries} peersTable={PEERS} defaultConfig={DEFAULT_CONFIG} />
    </>
  );
}
