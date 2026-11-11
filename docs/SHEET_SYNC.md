# Logging to the Google Sheet

Optional. Without this, lookups, research notes and outreach stay in each person's browser and are exported as CSV from the Tracker page.

With it, the app appends a row to the team Sheet each time someone looks up a new company, saves research notes or logs outreach. It uses a small Google Apps Script attached to the Sheet, which is free and needs no service account.

This path has been built but not yet tested against a live Sheet. Test it with one lookup before relying on it.

## Setup

1. Open the Sheet. Choose Extensions, then Apps Script.
2. Replace the editor contents with `docs/apps-script/Code.gs` from this repository.
3. In the Apps Script editor, open Project Settings, then Script Properties. Add a property named `SECRET` with a long random value.
4. Choose Deploy, then New deployment. Type: Web app. Execute as: Me. Who has access: Anyone. Copy the web app URL.
5. In Vercel, open the project's Settings, then Environment Variables. Add:
   - `SHEET_WEBHOOK_URL`: the web app URL
   - `SHEET_WEBHOOK_SECRET`: the same value as the `SECRET` property
6. Redeploy.

"Anyone" access is what lets Vercel reach the script. The secret is what stops anyone else from writing to the Sheet, so keep it out of the repository.

## What gets written

| Tab | When | Columns |
| --- | --- | --- |
| Search Log | A lookup of a company outside the starter set completes | date, query, result, score, tier, confidence |
| Profiles | Research notes are saved | company, water_focus, focus_areas, application_process, annual_giving_usd, size_band, warm_intro, source_url, notes, updated_at |
| Outreach Tracker | Log to tracker is pressed on a draft | id, date, company, contact, channel, template, status, notes |

The script creates a tab if it does not exist and writes a header row the first time. If a tab already has headers, values are placed under the matching header and any new column is added at the end. Existing rows are never changed or removed.

## The other direction

The app does not read from the Sheet. The dataset it scores lives in the `data` folder of the repository. To move research from the Sheet into the app, copy it into `data/companies.json` and `data/peers.json` as described in the README.
