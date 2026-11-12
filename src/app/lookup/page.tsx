import type { Metadata } from "next";
import { Suspense } from "react";
import LookupClient from "@/components/LookupClient";
import { getAppData, hunterEnabled } from "@/lib/data";
import { sheetConfigured } from "@/lib/sheets";

export const metadata: Metadata = { title: "Look up a company" };

export const dynamic = "force-dynamic";
export default async function LookupPage() {
  if (sheetConfigured()) return null;
  const data = await getAppData();
  return (
    <Suspense fallback={<p className="loading">Loading.</p>}>
      <LookupClient
        known={data.companies}
        peersTable={data.peers}
        defaultConfig={data.config}
        hunterEnabled={hunterEnabled()}
      />
    </Suspense>
  );
}
