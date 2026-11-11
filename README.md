# Sponsor Scout

Corporate sponsor research for Thirst Project. Type in any company and get its giving history, the water nonprofits it already funds, who to contact, a starting outreach email, and a score that says whether it is worth pursuing.

**Live site:** https://sponsor-scout-lime.vercel.app

The scoring is rules-based. Every point on a profile links back to an IRS filing, the Peers table or a research note, so anyone can check where a number came from.

## What a profile shows

- **Score and tier**, with the evidence behind each of the five factors
- **Giving history**: grants paid by year, the spread of grant sizes, and a searchable list of every grant
- **Support for other water nonprofits**, pulled from the foundation's own filing
- **Who to contact**: roles to look for, foundation officers, and LinkedIn search links
- **Outreach email**: a draft chosen by industry, ready to edit and log

## How it works

```mermaid
flowchart TD
    A([Company name]) --> B{Already on file?}
    B -- No --> C[Search IRS-registered nonprofits]
    C --> D[A person confirms the right foundation]
    D --> E["Read its latest 990-PF: grants, officers, totals"]
    B -- Yes --> F
    E --> F[["Scoring engine: five factors, fixed rules"]]
    N[Research notes from impact reports] --> F
    P["Peers table: who funds other water nonprofits"] --> F
    W[Weights and tier cutoffs] --> F
    F --> G[Company profile]
    G --> H[Score with evidence]
    G --> I[Giving history with sources]
    G --> J[Who to contact]
    G --> K[Outreach email draft]
```

The confirmation step matters. Family foundations, scholarship funds and employee trusts often carry a company's name, so a person picks the right match before anything is scored.

Filings cannot say what a company states as its priorities or how it takes applications. The Research notes panel on each profile captures that, and the score updates on save. Companies without a foundation file no 990-PF, so their profiles stay provisional until someone spends about ten minutes with the company's impact report.

## Scoring at a glance

Each factor is scored 0 to 100. The overall score is the weighted average.

| Factor | Weight | The question it answers |
| --- | --- | --- |
| Mission alignment | 30% | Does the company already care about water access? |
| Peer signal | 20% | Has it funded organizations like Thirst Project? |
| Capacity fit | 20% | Can it give at the level Thirst Project would ask for? |
| Accessibility | 20% | How reachable is the decision maker? |
| Confidence | 10% | How much of the above rests on evidence? |

| Tier | Score | Meaning |
| --- | --- | --- |
| A | 65 and up | Pursue now |
| B | 50 to 64 | Strong prospect |
| C | 35 to 49 | Worth a closer look |
| D | Under 35 | Low priority |

A factor with no evidence is held at a neutral value and the company is marked provisional, so a thin profile never looks as settled as a researched one. The Method page in the app lists every rule and its point value.

## What it costs to run

Nothing. There are no paid services, no API keys and no database.

| Piece | How it stays free |
| --- | --- |
| Filing data | Two keyless public sources: the ProPublica Nonprofit Explorer API for foundation search and yearly totals, and the GivingTuesday 990 Data Lake for the IRS e-file records that hold grant lists and officers |
| Starter companies | Bundled with the app as JSON, so their profiles need no outside calls |
| Team data | Research notes, saved lookups and the outreach log live in the browser and export from the Tracker page |
| Hosting | Vercel's free plan. The only server work is fetching and parsing a filing on a new lookup, cached for a day |

## Run it locally

Requires Node 20 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

| Command | What it does |
| --- | --- |
| `npm test` | Runs 41 tests on the scoring engine, filing parser and matching rules |
| `npm run build` | Production build |
| `npm run seed` | Re-pulls the latest filings for the starter list |

## Deploying

The Vercel project is linked to this repository. Every push to `main` builds and publishes the live site. There are no build settings or required environment variables.

Vercel's free Hobby plan is for non-commercial use. If Thirst Project takes this over as an organization, check that plan's terms or apply for a nonprofit plan.

## Optional settings

The app runs with none of these set. They are listed in `.env.example`.

| Variable | What it turns on |
| --- | --- |
| `PARTNER_COMPANIES` | A comma-separated list of existing Thirst Project partners. Matching companies get a notice on their profile and the outreach draft is turned off. Kept out of the repository because the list is private |
| `HUNTER_API_KEY` | Work email lookup for foundation officers through Hunter.io (free tier, 50 credits a month). One credit per lookup, only when someone asks |
| `SHEET_WEBHOOK_URL`, `SHEET_WEBHOOK_SECRET` | Appends lookups, research notes and logged outreach to a Google Sheet. Setup is in [docs/SHEET_SYNC.md](docs/SHEET_SYNC.md) |

Hunter lookup and Sheet logging are built but have not been tested against the live services yet.

## Working with the data

| File | What it holds |
| --- | --- |
| `data/companies.json` | The starter companies: industry, web domain, matched foundation, research notes |
| `data/filings/<ein>.json` | A snapshot of each matched foundation's latest filing |
| `data/peers.json` | The Peers table: companies that have funded other water nonprofits |
| `data/peer-orgs.json` | Water nonprofits recognized in filings, with name variants |
| `data/weights.json` | Factor weights, tier cutoffs and neutral baselines |
| `scripts/seed-list.json` | The list `npm run seed` builds from |

**Add a company to the starter set.** Add it to `scripts/seed-list.json`, then run `npm run seed`. To find the right foundation and its EIN first, run `npx tsx scripts/find-foundations.ts`. Research notes already saved in `data/companies.json` are kept.

**Add a sponsorship found in an annual report.** Add a row to `data/peers.json` with any `relationship` other than `Foundation grant`. Rows with that exact value are regenerated from filings on each seed.

**Make research notes permanent.** Export them from the Tracker page and copy the values into that company's `research` block in `data/companies.json`.

**Change how companies are scored.** Weights and tier cutoffs are in `data/weights.json`, and the Method page lets you try new weights in the browser first. Point values for each rule are in `src/lib/scoring.ts`, each with a test in `tests/scoring.test.ts`. Water keywords are in `src/lib/keywords.ts`.

## State of the starter data

There are 33 companies on file. The filing data is real and sourced. The manual research has not been done yet.

- **21 have a matched foundation**, with grants, officers and totals read from its latest filing.
- **9 have no foundation in IRS records** and show as provisional until research is entered.
- **3 matches are unconfirmed** (Procter & Gamble, Microsoft, YETI) because the search results were ambiguous. Use Look up to settle them.
- **Foundation matches were chosen by name and city.** Verify a match before relying on it for outreach.
- **Outreach templates are starting drafts.** Text in [brackets] is for the sender to fill in, and the wording should be reviewed by Thirst Project before the team uses it.

## Privacy

The app reads public IRS filings. It does not scrape LinkedIn, does not use paid contact databases, and does not collect personal emails or phone numbers. LinkedIn links open a search in the user's own browser.

## Project layout

```
src/app            Pages and API routes
src/components     Interface components
src/lib            Scoring, filing parser, data sources, templates
data               The bundled dataset and scoring configuration
scripts            Seeding scripts
tests              Unit tests, including one against a real 990-PF
docs               Google Sheet logging setup
```
