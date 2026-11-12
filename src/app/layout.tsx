import type { Metadata } from "next";
import { IBM_Plex_Sans, Source_Serif_4 } from "next/font/google";
import Link from "next/link";
import NavLinks from "@/components/NavLinks";
import WorkspaceProvider from "@/components/WorkspaceProvider";
import { cookies } from "next/headers";
import { getAppData, DEFAULT_CONFIG } from "@/lib/data";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { sheetConfigured } from "@/lib/sheets";
import type { StoreShape } from "@/lib/store";
import { outreachFromRow } from "@/lib/sheet-data";
import WorkspaceViews from "@/components/WorkspaceViews";
import type { WorkspaceCatalog } from "@/lib/workspace-model";
import { hunterEnabled, isExistingPartner } from "@/lib/data";
import "./globals.css";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans" });
const serif = Source_Serif_4({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: { default: "Sponsor Scout", template: "%s | Sponsor Scout" },
  description: "Corporate sponsor research and scoring for Thirst Project.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let initial: Partial<StoreShape> | null = null;
  let workspaceError = "";
  let catalog: WorkspaceCatalog | null = null;
  const versions: Record<string, string> = {};
  if (sheetConfigured() && verifySession((await cookies()).get(SESSION_COOKIE)?.value)) {
    try {
      const data = await getAppData();
      catalog = { companies: data.companies, summaries: data.summaries, peers: data.peers, config: data.config, hunterEnabled: hunterEnabled(),
        partnerSlugs: data.companies.filter((company) => isExistingPartner(company.name)).map((company) => company.slug) };
      initial = { research: Object.fromEntries(data.companies.map((c) => [c.slug, c.research])), weights: data.config,
        outreach: (data.tables?.["Outreach Tracker"] ?? []).map(outreachFromRow),
        searches: (data.tables?.["Search Log"] ?? []).map((r) => ({ ...r, id: String(r.id), score: r.score === "" || r.score == null ? null : Number(r.score) })) as unknown as StoreShape["searches"] };
      for (const [tab, rows] of Object.entries(data.tables ?? {})) for (const row of rows) {
        const key = row.slug ?? row.id; if (key != null) versions[`${tab}:${key}`] = String(row.version ?? "");
      }
    } catch (error) { workspaceError = error instanceof Error ? error.message : "The team Sheet could not be loaded."; }
  }
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <header className="site-head">
          <div className="wrap site-head-inner">
            <Link href="/" className="wordmark">
              <svg width="15" height="20" viewBox="0 0 15 20" aria-hidden="true">
                <path d="M7.5 0.6S0.8 8.2 0.8 12.7a6.7 6.7 0 0 0 13.4 0C14.2 8.2 7.5 0.6 7.5 0.6z" fill="currentColor" />
              </svg>
              Sponsor Scout
              <span>for Thirst Project</span>
            </Link>
            <NavLinks shared={sheetConfigured()} />
          </div>
        </header>
        <main id="main" className="wrap">
          <WorkspaceProvider initial={initial} versions={versions} defaults={DEFAULT_CONFIG} error={workspaceError}>{catalog ? <WorkspaceViews data={catalog}>{children}</WorkspaceViews> : children}</WorkspaceProvider>
        </main>
        <footer className="site-foot">
          <div className="wrap">
            <p>
              Filing data from ProPublica Nonprofit Explorer and IRS e-file records. Scores are rules-based and every
              point is traceable on the company&apos;s profile.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
