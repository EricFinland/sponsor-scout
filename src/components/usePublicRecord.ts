"use client";

import { useEffect, useState } from "react";
import type { PublicRecord } from "@/lib/public-record";

/**
 * Looks up the company's headquarters on Wikidata through the server route.
 * Runs only while LA presence is unresearched, and quietly gives up on failure:
 * the lookup is a convenience, never a requirement.
 */
export function usePublicRecord(name: string, domain: string, enabled: boolean): PublicRecord | null {
  const [record, setRecord] = useState<PublicRecord | null>(null);
  useEffect(() => {
    if (!enabled || name.trim().length < 2) {
      setRecord(null);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({ name, domain });
    fetch(`/api/public-record?${params}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { record?: PublicRecord | null } | null) => {
        if (!cancelled) setRecord(body?.record ?? null);
      })
      .catch(() => {
        if (!cancelled) setRecord(null);
      });
    return () => {
      cancelled = true;
    };
  }, [name, domain, enabled]);
  return record;
}
