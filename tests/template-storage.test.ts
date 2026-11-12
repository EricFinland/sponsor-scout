import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  exportAll,
  hasUnsavedChanges,
  initializeWorkspace,
  setTemplateDraftDirty,
  writeStore,
} from "@/lib/store";
import config from "@data/weights.json";
import type { ScoringConfig } from "@/lib/types";
const template = {
  id: "custom-a",
  label: "My template",
  industries: [],
  subject: "Hello {{company}}",
  body: "Hi {{first}}",
};
let values: Map<string, string>;
let storage: {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};
beforeEach(() => {
  values = new Map();
  storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
  vi.stubGlobal("window", { localStorage: storage });
  vi.stubGlobal("fetch", vi.fn());
  setTemplateDraftDirty(false);
  initializeWorkspace({}, {}, config as ScoringConfig, { readOnly: true });
});
afterEach(() => {
  setTemplateDraftDirty(false);
  vi.unstubAllGlobals();
});
describe("template storage in a view-only workspace", () => {
  it("persists personal templates across workspace initialization without a Sheet write", () => {
    writeStore("templates", [template]);
    expect(values.has("sponsor-scout:templates")).toBe(true);
    initializeWorkspace({}, {}, config as ScoringConfig, { readOnly: true });
    expect(exportAll().templates).toEqual([template]);
    expect(fetch).not.toHaveBeenCalled();
    expect(hasUnsavedChanges()).toBe(false);
  });
  it("continues to reject shared research edits", () => {
    writeStore("research", { acme: { notes: "Forbidden" } as never });
    expect(exportAll().research).toEqual({});
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not claim a save or replace memory when browser storage rejects a write", () => {
    writeStore("templates", [template]);
    storage.setItem = () => {
      throw new DOMException("Full", "QuotaExceededError");
    };
    expect(() =>
      writeStore("templates", [{ ...template, body: "Unsaved draft" }]),
    ).toThrow();
    expect(exportAll().templates[0].body).toBe(template.body);
  });
  it("merges functional updates with the latest library saved by another tab", () => {
    writeStore("templates", [template]);
    values.set(
      "sponsor-scout:templates",
      JSON.stringify([
        template,
        { ...template, id: "custom-b", label: "Another tab" },
      ]),
    );
    writeStore("templates", (current) => [
      ...current,
      { ...template, id: "custom-c", label: "Third" },
    ]);
    expect(exportAll().templates.map((t) => t.id)).toEqual([
      "custom-a",
      "custom-b",
      "custom-c",
    ]);
  });
  it("protects unsaved template drafts from reloads", () => {
    setTemplateDraftDirty(true);
    expect(hasUnsavedChanges()).toBe(true);
    setTemplateDraftDirty(false);
    expect(hasUnsavedChanges()).toBe(false);
  });
});
