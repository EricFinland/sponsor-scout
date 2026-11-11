import type { Industry } from "./types";

export interface SuggestedRole {
  title: string;
  why: string;
}

const COMMON: SuggestedRole[] = [
  {
    title: "Corporate Social Responsibility",
    why: "Owns the giving budget and decides which nonprofit partners get a meeting.",
  },
  {
    title: "Community Impact",
    why: "Runs employee giving and volunteer programs, often the first yes.",
  },
];

const BY_INDUSTRY: Record<Industry, SuggestedRole[]> = {
  beverage_cpg: [
    { title: "Sustainability", why: "Water stewardship targets usually sit with this team." },
    { title: "Brand Partnerships", why: "Funds cause campaigns tied to a product line." },
  ],
  outdoor_apparel: [
    { title: "Environmental Impact", why: "Manages grants to environmental and outdoor access groups." },
    { title: "Brand Marketing", why: "Runs cause collaborations and limited product tie-ins." },
  ],
  tech: [
    { title: "Social Impact", why: "Tech companies often run giving through a social impact or .org team." },
    { title: "Employee Engagement", why: "Controls matching gifts and volunteer grants." },
  ],
  water_industrial: [
    { title: "Sustainability", why: "Water is the core business, so this team owns water access programs." },
    { title: "Corporate Communications", why: "Often manages the company's signature water charity." },
  ],
  financial: [
    { title: "Philanthropy", why: "Banks usually run giving through a named philanthropy team." },
    { title: "Community Relations", why: "Handles regional sponsorships and local grants." },
  ],
  retail: [
    { title: "Corporate Responsibility", why: "Sets the giving pillars the foundation funds against." },
    { title: "Cause Marketing", why: "Runs register round-up and product campaigns." },
  ],
  other: [
    { title: "Sustainability", why: "Likely owner of any water or environment commitment." },
    { title: "Corporate Communications", why: "Fields sponsorship requests when there is no giving team." },
  ],
};

export function suggestedRoles(industry: Industry): SuggestedRole[] {
  return [...COMMON, ...BY_INDUSTRY[industry]];
}

/** A LinkedIn people search. Opens LinkedIn for the user. Nothing is scraped. */
export function linkedInSearchUrl(company: string, keywords: string): string {
  const query = `${keywords} ${company}`.trim();
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`;
}
