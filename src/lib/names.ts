const CORPORATE_SUFFIXES = new Set([
  "inc",
  "incorporated",
  "corp",
  "corporation",
  "co",
  "company",
  "companies",
  "llc",
  "ltd",
  "plc",
  "lp",
  "the",
  "group",
  "holdings",
  "usa",
  "us",
]);

/** Lowercase, strip punctuation and corporate suffixes. "The Coca-Cola Company" becomes "coca cola". */
export function normalizeName(name: string): string {
  return tokens(name).join(" ");
}

export function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t && !CORPORATE_SUFFIXES.has(t));
}

export function slugify(name: string): string {
  return normalizeName(name).replace(/\s+/g, "-");
}

export function sameCompany(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  return na.length > 0 && na === nb;
}

/** "CARLOS PAGOAGA" becomes "Carlos Pagoaga". Leaves mixed-case names alone. */
export function tidyPersonName(name: string): string {
  const trimmed = name.replace(/\s+/g, " ").trim();
  if (trimmed !== trimmed.toUpperCase()) return trimmed;
  return trimmed
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\bMc([a-z])/g, (_, c: string) => "Mc" + c.toUpperCase())
    .replace(/\b(Ii|Iii|Iv)\b/g, (m) => m.toUpperCase());
}

/** Title-case an all-caps organization name, keeping short connecting words lowercase. */
export function tidyOrgName(name: string): string {
  const trimmed = name.replace(/\s+/g, " ").trim();
  const letters = trimmed.replace(/[^A-Za-z]/g, "");
  const small = new Set(["of", "the", "and", "for", "in", "to", "at", "on"]);
  if (!letters) return trimmed;
  if (trimmed !== trimmed.toUpperCase()) {
    // Already mixed case. Only settle connecting words, as in "Bank Of America".
    return trimmed
      .split(" ")
      .map((word, i) => (i > 0 && small.has(word.toLowerCase()) ? word.toLowerCase() : word))
      .join(" ");
  }
  const keepUpper = new Set(["USA", "US", "YMCA", "YWCA", "UNICEF", "NAACP", "LLC", "II", "III"]);
  return trimmed
    .split(" ")
    .map((word, i) => {
      if (keepUpper.has(word)) return word;
      const lower = word.toLowerCase();
      if (i > 0 && small.has(lower)) return lower;
      return lower.replace(/(^|[-/(.])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase());
    })
    .join(" ");
}

/**
 * Public data sources flatten brand capitalization ("Pepsico", "Rei", "Vf").
 * When the company's own spelling appears in the name, restore it.
 */
export function withCompanyCasing(orgName: string, company: string): string {
  const wanted = company.trim();
  if (!wanted) return orgName;
  const escaped = wanted.replace(/[^A-Za-z0-9 ]/g, (ch) => "\\" + ch);
  return orgName.replace(new RegExp("\\b" + escaped + "\\b", "i"), wanted);
}

export function splitPersonName(name: string): { first: string; last: string } {
  const parts = tidyPersonName(name)
    .replace(/,.*$/, "")
    .replace(/\b(Jr|Sr|II|III|IV|PhD|MD|Esq)\.?$/i, "")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts[parts.length - 1] };
}
