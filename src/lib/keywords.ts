import peerOrgs from "@data/peer-orgs.json";

interface PeerOrg {
  name: string;
  aliases: string[];
}

const PEER_ORGS = peerOrgs as PeerOrg[];

// Whole-word matches only, so "Waterloo", "waterfront" and "Clearwater" do not count.
// River and watershed conservation is treated as a neighboring cause, not as water access.
const WATER_PATTERN =
  /\b(water|freshwater|sanitation|hygiene|borehole|boreholes|aquifer)\b/i;
// "WASH" only counts in capitals, as the sector acronym.
const WASH_ACRONYM = /\bWASH\b/;
// Street addresses and place names that contain the word but are not about water.
const WATER_FALSE_POSITIVES = /\bwater (st|street|tower place|works park)\b|\bwaters edge\b/i;

const ADJACENT_PATTERN =
  /\b(youth|students?|schools?|education|educational|global health|public health|international development|humanitarian|sustainab\w*|climate|environment\w*|conservation|watersheds?|riverkeeper|waterkeeper|poverty|hunger)\b/i;

const THIRST_PROJECT = /\bthirst project\b/i;

function flatten(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isWaterRelated(recipient: string, purpose: string): boolean {
  const text = `${recipient} ${purpose}`;
  // Known water nonprofits count even when the name is one word, like "WaterAid".
  if (matchPeerNonprofit(recipient) !== null) return true;
  if (WASH_ACRONYM.test(text)) return true;
  if (!WATER_PATTERN.test(text)) return false;
  const withoutFalsePositives = text.replace(new RegExp(WATER_FALSE_POSITIVES, "gi"), " ");
  return WATER_PATTERN.test(withoutFalsePositives);
}

export function isAdjacentCause(recipient: string, purpose: string): boolean {
  return ADJACENT_PATTERN.test(`${recipient} ${purpose}`);
}

export function isThirstProject(recipient: string): boolean {
  return THIRST_PROJECT.test(recipient);
}

/** Returns the display name of the known water nonprofit a recipient matches, or null. */
export function matchPeerNonprofit(recipient: string): string | null {
  const flat = ` ${flatten(recipient)} `;
  for (const org of PEER_ORGS) {
    for (const alias of org.aliases) {
      if (flat.includes(` ${alias} `)) return org.name;
    }
  }
  return null;
}

export function peerNonprofitNames(): string[] {
  return PEER_ORGS.map((o) => o.name);
}
