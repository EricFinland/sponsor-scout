import type { Metadata } from "next";
import TemplatesManager from "@/components/TemplatesManager";
import { getAppData, datasetFiling } from "@/lib/data";
import { sheetConfigured } from "@/lib/sheets";
export const metadata: Metadata = { title: "Email templates" };
export default async function TemplatesPage() {
  if (sheetConfigured()) return null;
  const data = await getAppData();
  const summaries = Object.fromEntries(
    data.companies.flatMap((company) => {
      const filing = datasetFiling(data, company.foundation.ein);
      return filing ? [[filing.ein, filing]] : [];
    }),
  );
  return (
    <TemplatesManager
      companies={data.companies}
      peers={data.peers}
      summaries={summaries}
    />
  );
}
