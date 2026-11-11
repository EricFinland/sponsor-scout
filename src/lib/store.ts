"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Company, FilingSummary, Research, ScoringConfig } from "./types";

/**
 * Small browser-side store. Research notes, saved lookups, the outreach log and
 * weight overrides live in localStorage, so the app needs no database.
 * Everything can be exported from the Tracker page.
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

function read<K extends keyof StoreShape>(key: K): StoreShape[K] {
  if (cache.has(key)) return cache.get(key) as StoreShape[K];
  let value: StoreShape[K] = DEFAULTS[key];
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
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
  const value = typeof next === "function" ? (next as (c: StoreShape[K]) => StoreShape[K])(read(key)) : next;
  cache.set(key, value);
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage full or blocked. The value still holds for this session.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key && event.key.startsWith(PREFIX)) {
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
export function logToSheet(tab: string, row: Record<string, unknown>): void {
  try {
    void fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tab, row }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Logging must never interrupt the person using the app.
  }
}

export function downloadFile(filename: string, content: string, type = "text/csv"): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
