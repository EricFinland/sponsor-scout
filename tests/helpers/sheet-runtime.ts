import fs from "node:fs";
import vm from "node:vm";
import { randomUUID } from "node:crypto";
import { SHEET_COLUMNS, type SheetTables } from "../../src/lib/sheet-schema";

class FakeRange {
  constructor(private sheet: FakeSheet, private row: number, private col: number, private height: number, private width: number) {}
  getValues() { return Array.from({ length: this.height }, (_, y) => Array.from({ length: this.width }, (_, x) => this.sheet.values[this.row - 1 + y]?.[this.col - 1 + x] ?? "")); }
  setValues(rows: unknown[][]) { rows.forEach((row, y) => row.forEach((value, x) => { const index = this.row - 1 + y; this.sheet.values[index] ??= []; this.sheet.values[index][this.col - 1 + x] = value; })); return this; }
  setValue(value: unknown) { return this.setValues([[value]]); }
  clearContent() { return this.setValues(Array.from({length: this.height}, () => Array(this.width).fill(""))); }
  getSheet() { return this.sheet; } getRow() { return this.row; } getLastRow() { return this.row + this.height - 1; }
}
class FakeSheet {
  values: unknown[][];
  constructor(public name: string, values: unknown[][]) { this.values = values; }
  getName() { return this.name; }
  getLastRow() { let last = this.values.length; while (last > 1 && this.values[last - 1].every((v) => v == null || v === "")) last--; return last; }
  getLastColumn() { return this.values[0].length; }
  getRange(row: number, col: number, height = 1, width = 1) { return new FakeRange(this, row, col, height, width); }
  getDataRange() { return this.getRange(1, 1, this.getLastRow(), this.getLastColumn()); }
}
export function createSheetRuntime(seed: SheetTables = {}) {
  const sheets = Object.fromEntries(Object.entries(SHEET_COLUMNS).map(([name, columns]) => [name, new FakeSheet(name, [[...columns], ...(seed[name as keyof SheetTables] ?? []).map((row) => columns.map((col) => row[col] ?? ""))])]));
  const properties: Record<string, string> = { SECRET: "fixture-only-secret", SPREADSHEET_ID: "fixture" };
  const spreadsheet = { getId: () => "fixture", getSheetByName: (name: string) => sheets[name], toast() {} };
  const context = vm.createContext({
    SpreadsheetApp: { getActiveSpreadsheet: () => null, openById: (id: string) => { if (id !== "fixture") throw new Error("Unexpected spreadsheet ID"); return spreadsheet; }, flush() {}, getUi: () => ({alert() {}}) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key: string) => properties[key], setProperty(key: string, value: string) { properties[key] = value; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { getUuid: randomUUID }, ContentService: { MimeType: { JSON: "application/json" }, createTextOutput: (value: string) => ({ setMimeType: () => value }) },
    console,
  });
  vm.runInContext(fs.readFileSync(new URL("../../docs/apps-script/Code.gs", import.meta.url), "utf8"), context);
  return { sheets, context, call: (payload: object) => JSON.parse(context.doPost({postData: {contents: JSON.stringify(payload)}})) };
}
