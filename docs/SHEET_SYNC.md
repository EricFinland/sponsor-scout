# Shared Google Sheets storage

Sponsor Scout can use a private Google Sheet as its team data store. The same Sheet supplies company profiles, research, peer support, sponsorship history, weights and cached filings. Research and outreach are updated in place, with version checks to prevent stale browser edits from overwriting newer changes.

Without storage settings, the app uses its public bundled dataset and browser-local storage. Shared-mode connection failures are shown as errors; the app never silently substitutes its demo data or claims that an unconfirmed save succeeded.

## Workbook

The workspace uses these exact tab names and headers from `src/lib/sheet-schema.ts`:

- Companies: stable company slugs, names, aliases, industry, foundation match and relationship status.
- Profiles: research fields and documented LA presence.
- Sponsorships: source-row-level Thirst Project gala history, separate from foundation grants.
- Peers: support for other water nonprofits.
- Weights: editable weights, cutoffs and neutral baselines.
- Scores and Tier Summary: dated, app-generated snapshots.
- Outreach Tracker and Search Log: shared workflow records.
- Filings: filing JSON split into 25,000-character chunks to stay below Sheets cell limits.
- Source History and Import Review: original source records and import decisions. These private tabs are never returned by the storage read endpoint.

Keep stable slugs and IDs intact. Do not edit Filings payload chunks by hand. Do not rename backend tabs or their column headers. The Companies and Profiles tables reserve space through row 1000.

## Connect a workspace

1. Open the private destination Sheet on the account that should own it. Select Extensions → Apps Script.
2. Install `docs/apps-script/Code.gs` in its bound script project.
3. Run `setupSponsorScout` once. Review and authorize Google's Sheets permission. Google requires the broad Sheets scope for `openById` in a web app; the code accepts only the fixed workbook ID saved by setup, never an ID from incoming requests. It does not use Drive, Gmail or external-network scopes.
4. In Project Settings → Script Properties, copy the generated `SECRET`. Keep it private.
5. Deploy → New deployment → Web app. Execute as the workbook owner. Allow server access with Anyone. The endpoint returns data only for POST requests containing the server secret. The Sheet itself stays restricted; do not publish it to the web.
6. In the Vercel project, set server-only production environment variables:
   - `SHEET_WEBHOOK_URL`: deployed `/exec` URL.
   - `SHEET_WEBHOOK_SECRET`: generated Script Properties `SECRET`.
   - `TEAM_ACCESS_KEY`: a separate random team access key with at least 24 characters. This is not the Google password or the Sheet server secret.
7. Redeploy. In shared mode, pages and APIs require an eight-hour signed, HTTP-only team session. The owner distributes the team key privately. Vercel's own deployment protection can remain enabled.
8. Sign in, save a research note, and verify the matching Profiles row. Reload the site to confirm the note is read from the Sheet. Check the save status before closing a tab.

If the script code changes, deploy a new Apps Script version under the existing deployment and retain its `/exec` URL. A new Vercel deployment alone does not update Apps Script.

## Research and scoring

Sheet edits are reflected on a full page reload. Use **Reload Sheet data** in the app after editing cells. Use **Update Sheet scores** to recompute Scores and Tier Summary from the current shared inputs. These output tabs are snapshots with `scoredAt` and an input hash, not live spreadsheet formulas.

The app queues changes and confirms the endpoint response before reporting a shared save. Failed changes remain in browser memory, with retry and backup options. If another editor changed the same record, download your unsaved backup, reload, and reconcile rather than overwriting blindly. Restore-from-backup is disabled in shared mode.

New-company lookups are logged. Saving a lookup adds its company and filing to the shared store. Removing a personal bookmark does not delete the shared company. Outreach status and note edits update their existing rows. Clear on the lookup log clears only the local view; it does not erase shared audit history. Sender name is a personal browser-session preference.

## LA accessibility

Local presence reserves 35 of 100 accessibility points. Contact/application evidence is capped at 65. One strongest verified location earns:

| Presence | Points |
| --- | ---: |
| LA County headquarters | 35 |
| LA County corporate office | 30 |
| LA County operating facility | 20 |
| LA County retail location | 10 |
| Office/headquarters in Orange, Ventura, Riverside or San Bernardino County | 15 |

The record needs a city, county, HTTPS source, supporting evidence, and a valid review date in this or the previous calendar year. Missing, stale or invalid evidence earns no local bonus. A California address alone earns none. Local presence does not prove local sponsorship authority. With the default 20% accessibility weight, verified LA headquarters adds up to seven overall points.

## Import decisions

The gala workbook contains 37 organization sponsorships totaling $303,500 and four personal/family gifts totaling $30,500. Personal gifts remain in the private source/review tabs and do not create company profiles. Twenty-two organizations are represented in the history; 21 are new to the 33-company starter list, producing 54 profiles.

Clear aliases such as UTA/United Talent Agency are normalized. Ambiguous Paramount shorthand remains separate from Paramount Pictures. Parent companies, brands and legacy entities are not automatically merged. Unknown foundation matches remain unverified. Past sponsorship is not assumed to be a current partnership or a warm introduction.
