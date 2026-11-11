"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Company, FilingSummary, Research, ScoringConfig } from "./types";
import { companyToRow, configToRows, filingRows, researchToRow } from "./sheet-data";
import type { SheetOperation } from "./mutations";
import type { Filing } from "./types";

/**
 * Shared mode queues acknowledged, versioned Sheet writes and keeps private
 * records in memory. Local demo mode uses localStorage. Tracker exports backups.
 */

export interface SavedProspect {
  company: Company;
  filing: FilingSummary | null;
  savedAt: string;
}

export interface OutreachEntry {
  id: string;
  date: string;
  company: string;
  contact: string;
  channel: string;
  template: string;
  status: string;
  notes: string;
}

export interface SearchEntry {
  id?: string;
  date: string;
  query: string;
  result: string;
  score: number | null;
  tier: string;
  confidence: string;
}

export interface StoreShape {
  research: Record<string, Research>;
  prospects: SavedProspect[];
  outreach: OutreachEntry[];
  searches: SearchEntry[];
  weights: ScoringConfig | null;
  sender: string;
}

const DEFAULTS: StoreShape = {
  research: {},
  prospects: [],
  outreach: [],
  searches: [],
  weights: null,
  sender: "",
};

const PREFIX = "sponsor-scout:";
const cache = new Map<string, unknown>();
const listeners = new Set<() => void>();
let shared = false;
let versions: Record<string, string> = {};
let fallbackConfig: ScoringConfig | null = null;
let syncState = { state: "local", message: "Changes are saved in this browser." };
const pending = new Map<string, SheetOperation>();
let saving = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
const notify = () => listeners.forEach((listener) => listener());

export function initializeWorkspace(initial: Partial<StoreShape>, initialVersions: Record<string, string>, defaults: ScoringConfig) {
  shared = true; versions = initialVersions; fallbackConfig = defaults;
  for (const key of Object.keys(DEFAULTS) as (keyof StoreShape)[]) cache.set(key, initial[key] ?? DEFAULTS[key]);
  syncState = { state: "saved", message: "Connected to the team Google Sheet." }; notify();
}

function enqueue(op: SheetOperation) {
  pending.set(`${op.tab}:${op.key}`, op);
  syncState = { state: "saving", message: "Saving to Google Sheet…" }; notify();
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flushShared(), 450);
}

export async function flushShared(): Promise<void> {
  if (!shared || saving || !pending.size) return;
  saving = true;
  const batch = [...pending.entries()].slice(0, 40);
  const operations = batch.map(([id, op]) => ({ ...op, expectedVersion: versions[id] ?? null }));
  try {
      const response = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operations }), signal: AbortSignal.timeout(30000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "The shared save failed.");
    Object.assign(versions, result.versions);
    for (const [id, op] of batch) if (pending.get(id) === op) pending.delete(id);
    syncState = { state: pending.size ? "saving" : "saved", message: pending.size ? "Saving to Google Sheet…" : "All changes saved to Google Sheet." };
  } catch (e) {
    syncState = { state: "error", message: `${e instanceof Error ? e.message : "The shared save failed."} Your unsaved changes are still here. Download a backup before reloading.` };
  } finally { saving = false; notify(); }
  if (pending.size && syncState.state !== "error") await flushShared();
}

export function hasUnsavedChanges() { return pending.size > 0 || saving; }
export function isSharedWorkspace() { return shared; }
export function useSyncStatus() { return useSyncExternalStore(subscribe, () => syncState, () => syncState); }

function persistChange<K extends keyof StoreShape>(key: K, previous: StoreShape[K], value: StoreShape[K]) {
  if (key === "research") {
    for (const [slug, r] of Object.entries(value as StoreShape["research"])) {
      if (JSON.stringify((previous as StoreShape["research"])[slug]) !== JSON.stringify(r)) enqueue({ tab: "Profiles", key: slug, row: researchToRow(slug, r) });
    }
  } else if (key === "weights") {
    const config = value as StoreShape["weights"] ?? fallbackConfig;
    if (config) for (const row of configToRows(config)) enqueue({ tab: "Weights", key: String(row.id), row });
  } else if (key === "outreach") {
    const before = previous as StoreShape["outreach"], after = value as StoreShape["outreach"];
    for (const row of after) if (JSON.stringify(before.find((r) => r.id === row.id)) !== JSON.stringify(row)) enqueue({ tab: "Outreach Tracker", key: row.id, row: { ...row } });
    for (const row of before) if (!after.some((r) => r.id === row.id)) enqueue({ tab: "Outreach Tracker", key: row.id, delete: true });
  } else if (key === "searches") {
    const before = previous as StoreShape["searches"];
    for (const row of value as StoreShape["searches"]) {
      if (before.some((r) => r.date === row.date && r.query === row.query && r.result === row.result)) continue;
      const id = row.id ?? `${row.date}-${row.query}`;
      enqueue({ tab: "Search Log", key: id, row: { ...row, id } });
    }
  } else if (key === "prospects") {
    const before = previous as StoreShape["prospects"], after = value as StoreShape["prospects"];
    for (const p of after) {
      if (before.some((old) => old.company.slug === p.company.slug)) continue;
      enqueue({ tab: "Companies", key: p.company.slug, row: companyToRow(p.company) });
      enqueue({ tab: "Profiles", key: p.company.slug, row: researchToRow(p.company.slug, read("research")[p.company.slug] ?? p.company.research) });
      if (p.filing && "grants" in p.filing) for (const row of filingRows(p.filing as Filing)) enqueue({ tab: "Filings", key: String(row.id), row });
    }
    // Shared company records are retained when someone removes a personal bookmark.
  }
}

function read<K extends keyof StoreShape>(key: K): StoreShape[K] {
  if (cache.has(key)) return cache.get(key) as StoreShape[K];
  let value: StoreShape[K] = DEFAULTS[key];
  try {
    const raw = shared ? null : window.localStorage.getItem(PREFIX + key);
    if (raw !== null) value = JSON.parse(raw) as StoreShape[K];
  } catch {
    // Private mode or a corrupt entry. Fall back to the default.
  }
  cache.set(key, value);
  return value;
}

export function writeStore<K extends keyof StoreShape>(
  key: K,
  next: StoreShape[K] | ((current: StoreShape[K]) => StoreShape[K]),
): void {
  const previous = read(key);
  const value = typeof next === "function" ? (next as (c: StoreShape[K]) => StoreShape[K])(previous) : next;
  cache.set(key, value);
  try {
    if (!shared) window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage full or blocked. The value still holds for this session.
  }
  listeners.forEach((listener) => listener());
  if (shared) persistChange(key, previous, value);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (!shared && event.key && event.key.startsWith(PREFIX)) {
      cache.delete(event.key.slice(PREFIX.length));
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useStore<K extends keyof StoreShape>(
  key: K,
): [StoreShape[K], (next: StoreShape[K] | ((current: StoreShape[K]) => StoreShape[K])) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => DEFAULTS[key],
  );
  const set = useCallback(
    (next: StoreShape[K] | ((current: StoreShape[K]) => StoreShape[K])) => writeStore(key, next),
    [key],
  );
  return [value, set];
}

export function exportAll(): StoreShape {
  return {
    research: read("research"),
    prospects: read("prospects"),
    outreach: read("outreach"),
    searches: read("searches"),
    weights: read("weights"),
    sender: read("sender"),
  };
}

export function importAll(data: Partial<StoreShape>): void {
  (Object.keys(DEFAULTS) as (keyof StoreShape)[]).forEach((key) => {
    if (data[key] !== undefined) writeStore(key, data[key] as never);
  });
}

/** Sends a row to the team's Google Sheet when a webhook is configured. Silent otherwise. */
export function logToSheet(_tab: string, _row: Record<string, unknown>): void { /* Persisted by writeStore with acknowledgements. */ }

export function downloadFile(filename: string, content: string, type = "text/csv"): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
