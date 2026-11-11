import type { Metadata } from "next";
import { Suspense } from "react";
import LookupClient from "@/components/LookupClient";
import { COMPANIES, DEFAULT_CONFIG, hunterEnabled, PEERS } from "@/lib/data";

export const metadata: Metadata = { title: "Look up a company" };

export default function LookupPage() {
  return (
    <Suspense fallback={<p className="loading">Loading.</p>}>
      <LookupClient
        known={COMPANIES.map((c) => ({ name: c.name, slug: c.slug }))}
        peersTable={PEERS}
        defaultConfig={DEFAULT_CONFIG}
        hunterEnabled={hunterEnabled()}
      />
    </Suspense>
  );
}
