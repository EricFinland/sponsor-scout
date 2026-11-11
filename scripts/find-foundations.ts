/**
 * Prints foundation candidates for each company in scripts/seed-list.json so a
 * person can confirm the right EIN before seeding.
 *
 *   npx tsx scripts/find-foundations.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { searchFoundations } from "../src/lib/propublica";

interface SeedEntry {
  name: string;
  query?: string;
}

async function main() {
  const list = JSON.parse(readFileSync(path.join(__dirname, "seed-list.json"), "utf8")) as SeedEntry[];
  for (const entry of list) {
    try {
      const candidates = await searchFoundations(entry.query ?? entry.name);
      console.log(`\n${entry.name}`);
      for (const c of candidates.slice(0, 5)) {
        console.log(`  ${c.match.toString().padStart(3)}  ${c.ein}  ${c.name} (${c.city}, ${c.state})`);
      }
      if (candidates.length === 0) console.log("  no candidates");
    } catch (error) {
      console.log(`\n${entry.name}\n  search failed: ${(error as Error).message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

main();
