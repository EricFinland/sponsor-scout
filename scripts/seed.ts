/**
 * Builds the starter dataset from live public filings.
 *
 *   npm run seed
 *
 * Reads scripts/seed-list.json, pulls each matched foundation's latest filing,
 * and writes data/companies.json, data/filings/<ein>.json and data/peers.json.
 * Manual research already saved in data/companies.json is kept.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { formatUsd } from "../src/lib/format";
import { slugify } from "../src/lib/names";
import { fetchFiling } from "../src/lib/propublica";
import type { Company, FoundationStatus, Industry, PeerRow, Research } from "../src/lib/types";
import { EMPTY_RESEARCH } from "../src/lib/types";

interface SeedEntry {
  name: string;
  industry: Industry;
  domain: string;
  hqState: string;
  ein?: string;
  /** Overrides the name on the filing when the IRS record garbles it. */
  foundationName?: string;
  foundationStatus: FoundationStatus;
}

const root = path.join(__dirname, "..");
const dataDir = path.join(root, "data");
const filingsDir = path.join(dataDir, "filings");

function readJson<T>(file: string, fallback: T): T {
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : fallback;
}

async function main() {
  mkdirSync(filingsDir, { recursive: true });
  const list = readJson<SeedEntry[]>(path.join(__dirname, "seed-list.json"), []);
  const existing = readJson<Company[]>(path.join(dataDir, "companies.json"), []);
  const savedResearch = new Map<string, Research>(existing.map((c) => [c.slug, c.research]));
  const manualPeers = readJson<PeerRow[]>(path.join(dataDir, "peers.json"), []).filter(
    (p) => p.relationship !== "Foundation grant",
  );

  const companies: Company[] = [];
  const derivedPeers: PeerRow[] = [];

  for (const entry of list) {
    const slug = slugify(entry.name);
    let foundationName: string | null = null;
    let status = entry.foundationStatus;

    if (entry.ein) {
      try {
        const filing = await fetchFiling(entry.ein, entry.name);
        if (filing) {
          if (entry.foundationName) filing.name = entry.foundationName;
          foundationName = filing.name;
          writeFileSync(path.join(filingsDir, `${filing.ein}.json`), JSON.stringify(filing, null, 1) + "\n");
          for (const match of filing.stats?.peerMatches ?? []) {
            derivedPeers.push({
              company: entry.name,
              industry: entry.industry,
              peerNonprofit: match.nonprofit,
              relationship: "Foundation grant",
              year: filing.taxYear,
              amountUsd: match.amount,
              sourceUrl: filing.sources[1]?.url ?? filing.sources[0].url,
              note: match.purpose,
            });
          }
          console.log(
            `${entry.name.padEnd(20)} ${filing.name} | ${filing.formType || "totals only"} ${filing.taxYear} | ${formatUsd(
              filing.totalGiving,
            )} | ${filing.stats?.count ?? 0} grants, ${filing.stats?.waterCount ?? 0} water, ${
              filing.stats?.peerMatches.length ?? 0
            } peer | ${filing.officers.length} officers`,
          );
        } else {
          status = "unverified";
          console.log(`${entry.name.padEnd(20)} EIN ${entry.ein} not found on ProPublica`);
        }
      } catch (error) {
        status = "unverified";
        console.log(`${entry.name.padEnd(20)} failed: ${(error as Error).message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    } else {
      console.log(`${entry.name.padEnd(20)} ${status === "none_found" ? "no foundation found" : "match unconfirmed"}`);
    }

    companies.push({
      slug,
      name: entry.name,
      industry: entry.industry,
      domain: entry.domain,
      hqState: entry.hqState,
      foundation: { status, ein: foundationName ? (entry.ein ?? null) : null, name: foundationName },
      research: savedResearch.get(slug) ?? { ...EMPTY_RESEARCH },
    });
  }

  writeFileSync(path.join(dataDir, "companies.json"), JSON.stringify(companies, null, 2) + "\n");
  writeFileSync(path.join(dataDir, "peers.json"), JSON.stringify([...manualPeers, ...derivedPeers], null, 2) + "\n");
  console.log(`\n${companies.length} companies, ${derivedPeers.length} peer rows from filings.`);
}

main();
