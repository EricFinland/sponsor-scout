# Sponsor Scout

A research tool for Thirst Project's corporate sponsorship work. Enter any company and get its giving history, the water nonprofits it already funds, who to contact, a starting outreach email, and a score that says whether it is worth pursuing.

The scoring is rules-based. Every point on a profile links back to an IRS filing, the Peers table or a research note, so anyone can check where a number came from.

## What it costs to run

Nothing. There are no paid services, no API keys and no database.

- **Filing data** comes from two free, keyless public sources: the ProPublica Nonprofit Explorer API (foundation search and yearly totals) and the GivingTuesday 990 Data Lake (the IRS e-file XML that holds grant lists and officers).
- **The 33 starter companies** ship inside the app as JSON, so their profiles load with no outside calls at all.
- **Team data** (research notes, saved lookups, the outreach log) is stored in the browser and exported from the Tracker page.
- **Hosting** fits Vercel's free plan. The only server work is a small function that fetches and parses a filing when someone looks up a new company, and responses are cached for a day.

Two optional extras stay off until you configure them: Hunter.io work email lookup (free tier, 50 credits a month) and appending rows to a Google Sheet.

## Run it locally

Requires Node 20 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

```bash
npm test         # scoring engine, filing parser and matching rules
npm run build    # production build
npm run seed     # re-pull the latest filings for the starter list
```

## Deploy to Vercel

1. Push this repository to GitHub.
2. In Vercel, choose Add New Project and import the repository. The defaults work. No build settings to change.
3. Optional environment variables are listed in `.env.example`.

Vercel's free Hobby plan is for non-commercial use. If Thirst Project will run this as an organization, check that plan's terms or use a nonprofit plan.

## How it works

1. **Search.** Typing a name on the home page filters the companies on file. Pressing Enter opens the profile, or starts a lookup for a company that is not on file.
2. **Confirm the foundation.** The app searches IRS-registered nonprofits for the company's name and ranks the candidates. A person confirms which one is right, because family foundations, scholarship funds and employee trusts often carry a company's name.
3. **Read the filing.** The foundation's latest 990-PF (or 990 with Schedule I) is parsed for total giving, every grant, officers and whether it accepts unsolicited requests.
4. **Score.** Five factors, each 0 to 100: mission alignment, peer signal, capacity fit, accessibility and confidence. The overall score is their weighted average. The Method page in the app documents every rule.
5. **Fill the gaps.** Filings cannot say what a company states as its priorities or how it takes applications. The Research notes panel on each profile captures that, and the score updates on save.
6. **Reach out.** Each profile suggests roles to look for with LinkedIn search links, lists the foundation's officers, and drafts an email from a template chosen by industry.

Companies without a foundation have no 990-PF. Their profiles start as provisional and depend on about ten minutes of manual research from the company's impact or CSR report.

## Changing how companies are scored

- **Weights and tier cutoffs** live in `data/weights.json`. The Method page lets you try different weights in the browser before committing a change.
- **Point values for each rule** are in `src/lib/scoring.ts`. Each rule is a few lines and has a test in `tests/scoring.test.ts`.
- **Water keywords** and the list of recognized water nonprofits are in `src/lib/keywords.ts` and `data/peer-orgs.json`.

## The data files

| File | What it holds |
| --- | --- |
| `data/companies.json` | The starter companies: industry, web domain, matched foundation, research notes |
| `data/filings/<ein>.json` | A snapshot of each matched foundation's latest filing |
| `data/peers.json` | The Peers table: companies that have funded other water nonprofits |
| `data/peer-orgs.json` | Water nonprofits recognized in filings, with name variants |
| `data/weights.json` | Factor weights, tier cutoffs and neutral baselines |
| `scripts/seed-list.json` | The list `npm run seed` builds from |

**Adding a company to the starter set:** add it to `scripts/seed-list.json` (run `npx tsx scripts/find-foundations.ts` to see foundation candidates and their EINs), then `npm run seed`. Research notes already saved in `data/companies.json` are kept.

**Adding a peer sponsorship found in an annual report:** add a row to `data/peers.json` with any `relationship` other than `Foundation grant`. Rows with that exact value are regenerated from filings on each seed.

**Making research notes permanent:** export them from the Tracker page and copy the values into the `research` block for that company in `data/companies.json`.

## State of the starter data

All 33 companies have real, sourced filing data where a foundation was matched (21 of them). None have manual research filled in yet, so:

- The 12 companies without a confirmed foundation show as provisional.
- Three matches are marked unconfirmed (Procter & Gamble, Microsoft, YETI) because the search results were ambiguous. Use Look up to confirm them.
- Foundation matches were chosen by name and city. Verify any match before relying on it for outreach.

## Existing partners

Thirst Project's partner list is private and is not in this repository. Set the `PARTNER_COMPANIES` environment variable to a comma-separated list of names. Matching companies show a notice on their profile and the outreach draft is turned off.

## Privacy

The app reads public IRS filings. It does not scrape LinkedIn, does not use paid contact databases, and does not collect personal emails or phone numbers. LinkedIn links open a search in the user's own browser. Hunter lookups, if enabled, return work emails only and run one at a time when a person asks.

## Outreach templates

The four templates in `src/lib/templates.ts` are starting drafts. Text in [brackets] is for the sender to fill in. Have someone at Thirst Project review the wording and add current impact numbers before the team uses them.

## Project layout

```
src/app            Pages and the API routes
src/components     Interface components
src/lib            Scoring, filing parser, data sources, templates
data               The bundled dataset and scoring configuration
scripts            Seeding scripts
tests              Unit tests, including one against a real 990-PF
docs               Google Sheet sync setup
```
