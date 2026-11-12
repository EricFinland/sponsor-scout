/** Sponsor Scout private storage. Bind this script to the destination Sheet. Never publish the Sheet itself. */
var READ_TABS = ['Companies', 'Profiles', 'Peers', 'Sponsorships', 'Weights', 'Scores', 'Tier Summary', 'Outreach Tracker', 'Search Log', 'Filings'];
var WRITE_KEYS = { 'Companies': 'slug', 'Profiles': 'slug', 'Weights': 'id', 'Outreach Tracker': 'id', 'Search Log': 'id', 'Filings': 'id' };

function setupSponsorScout() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SECRET')) props.setProperty('SECRET', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  props.setProperty('SPREADSHEET_ID', SpreadsheetApp.getActiveSpreadsheet().getId());
  // A toast avoids leaving the execution suspended behind a dialog in another tab.
  SpreadsheetApp.getActiveSpreadsheet().toast('Storage settings saved. The server secret is in Apps Script Project Settings.', 'Sponsor Scout', 8);
}

function doGet() { return respond({ ok: false, error: 'Authenticated POST requests only.' }); }

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var props = PropertiesService.getScriptProperties();
    var secret = props.getProperty('SECRET');
    if (!secret || typeof payload.secret !== 'string' || payload.secret !== secret) return respond({ ok: false, error: 'Unauthorized.' });
    var id = props.getProperty('SPREADSHEET_ID');
    if (!id) throw new Error('Run setupSponsorScout in the bound spreadsheet first.');
    // Bound active-document helpers are unavailable in web apps. The ID comes only from owner-run setup, never from the request.
    var spreadsheet = SpreadsheetApp.openById(id);
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) throw new Error('The Sheet is busy. Retry the save.');
    try {
      if (payload.action === 'read') {
        var data = {};
        var tabs = payload.tabs === undefined ? READ_TABS : payload.tabs;
        if (!Array.isArray(tabs) || !tabs.length || tabs.some(function (tab) { return READ_TABS.indexOf(tab) < 0; })) throw new Error('Invalid read tabs.');
        tabs.forEach(function (tab) { data[tab] = readTable(spreadsheet, tab).rows; });
        return respond({ ok: true, data: data });
      }
      if (payload.action === 'catalog') {
        var catalog = {};
        ['Companies', 'Profiles', 'Peers', 'Sponsorships', 'Weights', 'Outreach Tracker', 'Search Log'].forEach(function (tab) { catalog[tab] = readTable(spreadsheet, tab).rows; });
        return respond({ ok: true, data: { tables: catalog, summaries: filingSummaries(spreadsheet) } });
      }
      if (payload.action === 'filing') {
        if (typeof payload.ein !== 'string' || !/^\d{9}$/.test(payload.ein)) throw new Error('Invalid EIN.');
        return respond({ ok: true, data: filingObjects(spreadsheet, payload.ein)[payload.ein] || null });
      }
      if (payload.action === 'refresh') {
        CacheService.getScriptCache().remove('filing-summaries');
        return respond({ ok: true, data: { refreshed: true } });
      }
      if (payload.action === 'mutate') return respond({ ok: true, data: mutate(spreadsheet, payload.operations) });
      if (payload.action === 'scores') {
        if (!Array.isArray(payload.rows) || !Array.isArray(payload.summary) || payload.rows.length > 5000) throw new Error('Invalid score rows.');
        replaceDerived(spreadsheet, 'Scores', payload.rows);
        replaceDerived(spreadsheet, 'Tier Summary', payload.summary);
        return respond({ ok: true, data: { count: payload.rows.length } });
      }
      throw new Error('Unknown action.');
    } finally { lock.releaseLock(); }
  } catch (error) { return respond({ ok: false, error: String(error.message || error) }); }
}

function filingObjects(spreadsheet, requestedEin) {
  var groups = {}, result = {};
  readTable(spreadsheet, 'Filings').rows.forEach(function (row) {
    var ein = String(row.ein).padStart(9, '0');
    if (requestedEin && requestedEin !== ein) return;
    (groups[ein] || (groups[ein] = [])).push(row);
  });
  Object.keys(groups).forEach(function (ein) {
    var rows = groups[ein].sort(function (a, b) { return Number(a.part) - Number(b.part); });
    if (!rows.every(function (row, i) { return Number(row.part) === i; })) throw new Error('Missing or duplicate filing chunks: ' + ein);
    var filing = JSON.parse(rows.map(function (row) { return row.payload; }).join(''));
    if (filing.ein !== ein || !Array.isArray(filing.grants)) throw new Error('Invalid filing: ' + ein);
    result[ein] = filing;
  });
  return result;
}

function filingSummaries(spreadsheet) {
  var cache = CacheService.getScriptCache(), cached = cache.get('filing-summaries');
  if (cached) return JSON.parse(cached);
  var filings = filingObjects(spreadsheet), summaries = {};
  Object.keys(filings).forEach(function (ein) {
    var summary = Object.assign({}, filings[ein]);
    delete summary.grants; delete summary.grantsTruncated;
    summaries[ein] = summary;
  });
  var text = JSON.stringify(summaries);
  // CacheService has a 100 KB value limit. Larger datasets still work uncached.
  if (Utilities.newBlob(text).getBytes().length < 90000) cache.put('filing-summaries', text, 60);
  return summaries;
}

function readTable(spreadsheet, tab) {
  var sheet = spreadsheet.getSheetByName(tab);
  if (!sheet) throw new Error('Required tab is missing: ' + tab);
  var values = sheet.getDataRange().getValues();
  var headers = (values.shift() || []).map(String);
  if (!headers[0]) throw new Error('Missing headers: ' + tab);
  var rows = [], rowNumbers = [], emptyRows = [];
  var keyIndex = headers.indexOf(WRITE_KEYS[tab] || headers[0]);
  values.forEach(function (values, index) {
    // Checkbox validation may populate FALSE through the reserved table area.
    // These are available rows, not research records. Preserve orphan text.
    if (values[keyIndex] === '') {
      if (values.every(function (v) { return v === '' || v === false; })) emptyRows.push(index + 2);
      return;
    }
    if (values.every(function (v) { return v === ''; })) return;
    var row = {};
    headers.forEach(function (header, i) { if (header) row[header] = values[i] instanceof Date ? values[i].toISOString() : values[i] === undefined ? '' : values[i]; });
    rows.push(row); rowNumbers.push(index + 2);
  });
  return { sheet: sheet, headers: headers, rows: rows, rowNumbers: rowNumbers, emptyRows: emptyRows, nextRow: values.length + 2 };
}

function sameValues(row, patch) {
  return Object.keys(patch).every(function (key) { return key === 'version' || String(row[key] == null ? '' : row[key]) === String(patch[key] == null ? '' : patch[key]); });
}

function mutate(spreadsheet, operations) {
  if (!Array.isArray(operations) || !operations.length || operations.length > 50) throw new Error('Invalid changes.');
  var tables = {}, seen = {}, plans = [];
  // Preflight the entire batch before changing any cell.
  operations.forEach(function (op) {
    var keyColumn = WRITE_KEYS[op.tab];
    if (!keyColumn || typeof op.key !== 'string' || !op.key || op.key.length > 200) throw new Error('Invalid change.');
    var compound = op.tab + ':' + op.key;
    if (seen[compound]) throw new Error('Duplicate change key.');
    seen[compound] = true;
    var table = tables[op.tab] || (tables[op.tab] = readTable(spreadsheet, op.tab));
    var matches = table.rows.map(function (row, i) { return String(row[keyColumn]) === op.key ? i : -1; }).filter(function (i) { return i >= 0; });
    if (matches.length > 1) throw new Error('Duplicate key in ' + op.tab + ': ' + op.key);
    var index = matches.length ? matches[0] : -1;
    var old = index >= 0 ? table.rows[index] : null;
    if (op.delete && ['Companies', 'Profiles', 'Outreach Tracker'].indexOf(op.tab) === -1) throw new Error('This table cannot be deleted.');
    if (!op.delete && (!op.row || typeof op.row !== 'object' || String(op.row[keyColumn]) !== op.key)) throw new Error('Invalid row.');
    if (!op.delete) Object.keys(op.row).forEach(function (key) {
      var value = op.row[key];
      if (table.headers.indexOf(key) < 0 || key === 'version') throw new Error('Unknown or protected column: ' + key);
      if (value !== null && ['string', 'number', 'boolean'].indexOf(typeof value) < 0) throw new Error('Invalid cell value.');
      if (typeof value === 'string' && value.length > (op.tab === 'Filings' ? 25000 : 5000)) throw new Error('Cell value is too long.');
    });
    var versioned = table.headers.indexOf('version') >= 0;
    var unchanged = old && !op.delete && sameValues(old, op.row);
    if (versioned && old && !unchanged && String(old.version || '') !== String(op.expectedVersion || '')) throw new Error('Conflict: ' + op.tab + ' ' + op.key + ' changed by another editor. Download your unsaved backup and reload before reconciling.');
    plans.push({ op: op, table: table, old: old, index: index, unchanged: unchanged, versioned: versioned });
  });
  var versions = {};
  plans.forEach(function (plan) {
    var op = plan.op, table = plan.table, compound = op.tab + ':' + op.key;
    if (plan.unchanged) { versions[compound] = String(plan.old.version || ''); return; }
    if (op.delete) {
      if (plan.index >= 0) table.sheet.getRange(table.rowNumbers[plan.index], 1, 1, table.headers.length).clearContent();
      versions[compound] = ''; return;
    }
    var row = Object.assign({}, plan.old || {}, op.row);
    if (plan.versioned) row.version = Utilities.getUuid();
    var values = table.headers.map(function (header) { return safeCell(row[header]); });
    var rowNumber = plan.index >= 0 ? table.rowNumbers[plan.index] : table.emptyRows.length ? table.emptyRows.shift() : table.nextRow++;
    var maxRows = table.sheet.getMaxRows();
    if (rowNumber > maxRows) table.sheet.insertRowsAfter(maxRows, rowNumber - maxRows);
    table.sheet.getRange(rowNumber, 1, 1, values.length).setValues([values]);
    versions[compound] = row.version || '';
  });
  SpreadsheetApp.flush();
  if (operations.some(function (op) { return op.tab === 'Filings'; })) CacheService.getScriptCache().remove('filing-summaries');
  return { versions: versions };
}

function safeCell(value) {
  if (value === undefined || value === null) return '';
  // Treat all user text as text, including values that could otherwise become formulas.
  if (typeof value === 'string' && /^[=+\-@]/.test(value)) return "'" + value;
  return value;
}

function replaceDerived(spreadsheet, tab, rows) {
  var table = readTable(spreadsheet, tab);
  if (table.sheet.getLastRow() > 1) table.sheet.getRange(2, 1, table.sheet.getLastRow() - 1, table.headers.length).clearContent();
  if (rows.length) table.sheet.getRange(2, 1, rows.length, table.headers.length).setValues(rows.map(function (row) { return table.headers.map(function (header) { return safeCell(row[header]); }); }));
}

/** Manual Sheet edits also bump record versions so stale browser saves cannot silently overwrite them. */
function onEdit(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  if (sheet.getName() === 'Filings') CacheService.getScriptCache().remove('filing-summaries');
  if (!WRITE_KEYS[sheet.getName()] || e.range.getRow() === 1) return;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var versionColumn = headers.indexOf('version') + 1;
  if (!versionColumn) return;
  for (var row = e.range.getRow(); row <= e.range.getLastRow(); row++) sheet.getRange(row, versionColumn).setValue(Utilities.getUuid());
}

function respond(body) { return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON); }
