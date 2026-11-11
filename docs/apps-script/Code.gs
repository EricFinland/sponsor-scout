/**
 * Appends rows sent by Sponsor Scout to the matching tab of this spreadsheet.
 * Setup steps are in docs/SHEET_SYNC.md.
 */

var ALLOWED_TABS = ['Search Log', 'Profiles', 'Outreach Tracker', 'Scores'];

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty('SECRET');
    if (!secret || payload.secret !== secret) return respond({ ok: false, error: 'unauthorized' });
    if (ALLOWED_TABS.indexOf(payload.tab) === -1) return respond({ ok: false, error: 'unknown tab' });

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      appendRow(payload.tab, payload.row || {});
    } finally {
      lock.releaseLock();
    }
    return respond({ ok: true });
  } catch (error) {
    return respond({ ok: false, error: String(error) });
  }
}

function appendRow(tabName, row) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(tabName) || spreadsheet.insertSheet(tabName);
  var keys = Object.keys(row);

  var headers = [];
  if (sheet.getLastRow() > 0 && sheet.getLastColumn() > 0) {
    headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  }
  var missing = keys.filter(function (key) {
    return headers.indexOf(key) === -1;
  });
  if (missing.length > 0) {
    headers = headers.concat(missing);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  var values = headers.map(function (header) {
    var value = row[header];
    if (value === undefined || value === null) return '';
    // A leading apostrophe stops Sheets from treating the text as a formula.
    if (typeof value === 'string' && /^[=+\-@]/.test(value)) return "'" + value;
    return value;
  });
  sheet.appendRow(values);
}

function respond(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
