import { describe, it, expect } from "vitest";
import { createSheetRuntime } from "./helpers/sheet-runtime";
import { filingRows, decodeDataset } from "@/lib/sheet-data";
import { scoreCompany } from "@/lib/scoring";
import { peersForCompany, industryPeerCompanies } from "@/lib/peers";
import companies from "@data/companies.json";
import config from "@data/weights.json";
import peers from "@data/peers.json";
import filing from "@data/filings/581574705.json";
import type { Company, Filing, ScoringConfig, PeerRow } from "@/lib/types";
import { companyToRow, researchToRow, configToRows } from "@/lib/sheet-data";

const secret = "fixture-only-secret";
function runtime() {
  const company = companies.find(c => c.slug === "coca-cola")! as Company;
  return createSheetRuntime({Companies:[companyToRow(company)],Profiles:[researchToRow(company.slug,company.research)],
    Weights:configToRows(config as ScoringConfig),Peers:peers as unknown as import("@/lib/sheet-schema").SheetRow[],Filings:filingRows(filing as Filing)});
}
describe("lightweight navigation data", () => {
  it("reads only requested tabs, and rejects private or unknown tabs", () => {
    const r=runtime(); const response=r.call({action:"read",secret,tabs:["Weights"]});
    expect(Object.keys(response.data)).toEqual(["Weights"]);
    expect(r.sheets.Filings.reads).toBe(0);
    expect(r.call({action:"read",secret,tabs:["Source History"]}).ok).toBe(false);
  });
  it("returns summaries without grant payloads, preserves scores, and reuses the summary cache", () => {
    const r=runtime(); const result=r.call({action:"catalog",secret});
    expect(result.ok).toBe(true);
    expect(result.data.tables).not.toHaveProperty("Filings");
    expect(result.data.tables).not.toHaveProperty("Scores");
    expect(result.data.summaries[filing.ein]).not.toHaveProperty("grants");
    const data=decodeDataset(result.data.tables,config as ScoringConfig),company=data.companies[0];
    const fullScore=scoreCompany({company,filing:filing as Filing,peers:peersForCompany(company,data.peers,filing as Filing),industryPeerCompanies:industryPeerCompanies(company,data.peers),config:data.config,asOfYear:2026});
    const summary=result.data.summaries[filing.ein];
    expect(scoreCompany({company,filing:summary,peers:peersForCompany(company,data.peers,summary),industryPeerCompanies:industryPeerCompanies(company,data.peers),config:data.config,asOfYear:2026})).toEqual(fullScore);
    expect(r.sheets.Filings.reads).toBe(1);
    r.call({action:"catalog",secret}); expect(r.sheets.Filings.reads).toBe(1);
  });
  it("loads full details on demand and explicit refresh clears the summary cache", () => {
    const r=runtime(); r.call({action:"catalog",secret});
    expect(r.call({action:"filing",secret,ein:filing.ein}).data.grants.length).toBe(filing.grants.length);
    expect(r.call({action:"filing",secret,ein:"bad"}).ok).toBe(false);
    r.call({action:"refresh",secret});r.call({action:"catalog",secret});expect(r.sheets.Filings.reads).toBe(3);
  });
  it("invalidates summaries after a filing save or a direct Sheet edit", () => {
    const r=runtime();r.call({action:"catalog",secret});
    const updated={...filing,totalGiving:123} as Filing;
    expect(r.call({action:"mutate",secret,operations:filingRows(updated).map(row=>({tab:"Filings",key:row.id,row}))}).ok).toBe(true);
    expect(r.call({action:"catalog",secret}).data.summaries[filing.ein].totalGiving).toBe(123);
    const reads=r.sheets.Filings.reads;r.context.onEdit({range:r.sheets.Filings.getRange(2,4)});r.call({action:"catalog",secret});
    expect(r.sheets.Filings.reads).toBe(reads+1);
  });
});
