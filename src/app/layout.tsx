import type { Metadata } from "next";
import { IBM_Plex_Sans, Source_Serif_4 } from "next/font/google";
import Link from "next/link";
import NavLinks from "@/components/NavLinks";
import "./globals.css";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans" });
const serif = Source_Serif_4({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: { default: "Sponsor Scout", template: "%s | Sponsor Scout" },
  description: "Corporate sponsor research and scoring for Thirst Project.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
            <NavLinks />
          </div>
        </header>
        <main id="main" className="wrap">
          {children}
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
