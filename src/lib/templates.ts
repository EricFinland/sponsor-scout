import { formatUsd } from "./format";
import type { Company, FilingSummary, Industry, PeerRow } from "./types";

export interface OutreachTemplate {
  id: string;
  label: string;
  industries: Industry[];
  subject: string;
  body: string;
}

/**
 * Starting drafts, picked by industry. Text in [brackets] is for the sender to
 * fill in. Claims about Thirst Project should be checked against current
 * numbers before anything is sent.
 */
export const TEMPLATES: OutreachTemplate[] = [
  {
    id: "beverage_cpg",
    label: "Beverage and CPG",
    industries: ["beverage_cpg"],
    subject: "Water access partnership with Thirst Project",
    body: `Hi {{first}},

I work with Thirst Project, a youth-led nonprofit that funds freshwater wells and water projects in communities without safe drinking water.

{{hook}}

Water sits at the center of what {{company}} makes, so I think there is a real fit here. Students in our school programs raise money for wells, and corporate partners let us fund entire communities instead of one project at a time. [One line on a current project, its location and its cost.]

Would you be open to a 20-minute call in the next few weeks to see whether this lines up with {{company}}'s giving priorities? I can send a one-page overview first if that is easier.

Thank you,
{{sender}}`,
  },
  {
    id: "outdoor_apparel",
    label: "Outdoor and apparel",
    industries: ["outdoor_apparel"],
    subject: "Thirst Project and {{company}}",
    body: `Hi {{first}},

I work with Thirst Project, a youth-led nonprofit that funds freshwater wells and water projects in communities without safe drinking water.

{{hook}}

{{company}}'s customers care about where their water comes from and who has access to it. We work with brands on campaigns where a product, a trip or an event funds a named well, and students in our school programs carry the story to their own communities. [One line on a recent brand campaign or a project that needs a sponsor.]

Could we set up a short call this month? I would like to hear what {{company}} looks for in a nonprofit partner and share a couple of ways this could work.

Thank you,
{{sender}}`,
  },
  {
    id: "tech",
    label: "Technology",
    industries: ["tech"],
    subject: "Student-led water projects: a partnership idea for {{company}}",
    body: `Hi {{first}},

I work with Thirst Project, a youth-led nonprofit that funds freshwater wells and water projects in communities without safe drinking water.

{{hook}}

Most of our fundraising is done by high school and college students, which makes us a good match for companies that invest in young people and in employee giving. Partners support us through grants, matching gift campaigns and team volunteer events, and each one is tied to a specific water project they can follow. [One line on a current project and what a grant of a given size would fund.]

Would you have 20 minutes in the coming weeks to talk about whether this fits {{company}}'s social impact work? Happy to send a short overview ahead of time.

Thank you,
{{sender}}`,
  },
  {
    id: "general",
    label: "General",
    industries: ["water_industrial", "financial", "retail", "entertainment", "other"],
    subject: "Introducing Thirst Project to {{company}}",
    body: `Hi {{first}},

I work with Thirst Project, a youth-led nonprofit that funds freshwater wells and water projects in communities without safe drinking water.

{{hook}}

We partner with companies through grants, employee giving and sponsored projects, and every gift is tied to a specific community water project. [One line on a current project and its cost.]

Would you be open to a 20-minute call in the next few weeks to see whether this fits {{company}}'s giving priorities? I can send a one-page overview first if that is easier.

Thank you,
{{sender}}`,
  },
];

export function templateFor(industry: Industry): OutreachTemplate {
  return TEMPLATES.find((t) => t.industries.includes(industry)) ?? TEMPLATES[TEMPLATES.length - 1];
}

/** One sentence that shows the sender did their homework, drawn from the evidence on file. */
export function hookLine(company: Company, filing: FilingSummary | null, peers: PeerRow[]): string {
  const giver = filing?.name ?? company.name;
  if (peers.length > 0) {
    const names = [...new Set(peers.map((p) => p.peerNonprofit))];
    const listed = names.length > 2 ? `${names.slice(0, 2).join(", ")} and others` : names.join(" and ");
    const year = peers.find((p) => p.year)?.year;
    return `I noticed that ${giver} has supported ${listed}${year ? ` (${year} filing)` : ""}, so I know water access is something you already fund.`;
  }
  if (filing?.stats && filing.stats.waterCount > 0) {
    return `I saw that ${giver} made ${filing.stats.waterCount} water-related grant${
      filing.stats.waterCount === 1 ? "" : "s"
    } in ${filing.taxYear}, totaling ${formatUsd(filing.stats.waterAmount)}.`;
  }
  if (company.research.waterFocus === "yes") {
    return `I have been reading about ${company.name}'s water commitments and wanted to introduce our work.`;
  }
  if (company.research.focusAreas.length > 0) {
    return `I know ${company.name} invests in ${company.research.focusAreas
      .slice(0, 2)
      .join(" and ")
      .toLowerCase()}, which is where our work with students overlaps with yours.`;
  }
  return `[One sentence on why ${company.name} specifically: a program, a statement or a recent gift you found.]`;
}

export function fillTemplate(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => values[key] ?? whole);
}
