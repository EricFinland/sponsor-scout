"use client";
import { useEffect, useState } from "react";
import { initializeWorkspace, hasUnsavedChanges, useSyncStatus, flushShared, type StoreShape } from "@/lib/store";
import type { ScoringConfig } from "@/lib/types";

export default function WorkspaceProvider({ initial, versions, defaults, error, children, readOnly = false, showSignOut = true }: {
  initial: Partial<StoreShape> | null; versions: Record<string, string>; defaults: ScoringConfig; error: string; children: React.ReactNode;
  readOnly?: boolean; showSignOut?: boolean;
}) {
  const [ready, setReady] = useState(!initial);
  useEffect(() => {
    if (initial) { initializeWorkspace(initial, versions, defaults, {readOnly}); setReady(true); }
    const preventLoss = (e: BeforeUnloadEvent) => { if (hasUnsavedChanges()) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
    // Initial shared state is request-scoped. Navigation does not overwrite unsaved work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const status = useSyncStatus();
  const [refreshing, setRefreshing] = useState(false);
  async function refreshScores() {
    setRefreshing(true);
    try {
      await flushShared(); if (hasUnsavedChanges()) { setRefreshMessage("Finish saving pending changes before updating scores."); return; }
      const response = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refreshScores" }), signal: AbortSignal.timeout(60000) });
      const result = await response.json();
      setRefreshMessage(response.ok ? `Scores updated for ${result.count} companies. Reload to pull the latest Sheet edits.` : result.error ?? "Score refresh failed.");
    } catch { setRefreshMessage("The score update was not confirmed. Check your connection and retry."); }
    finally { setRefreshing(false); }
  }
  const [refreshMessage, setRefreshMessage] = useState("");
  const [reloading, setReloading] = useState(false);
  async function reloadData() {
    if (hasUnsavedChanges()) { setRefreshMessage("Finish saving pending changes before reloading."); return; }
    setReloading(true);
    try {
      const response = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refreshData" }), signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error();
      window.location.reload();
    } catch { setRefreshMessage("Refresh was not confirmed. Your current workspace is still available; retry when connected."); setReloading(false); }
  }
  if (error) return <div role="alert" className="notice"><h1>Team Sheet unavailable</h1><p>{error}</p><button className="button" onClick={() => window.location.reload()}>Retry connection</button></div>;
  if (!ready) return <p className="loading">Loading the team workspace…</p>;
  return <>{initial && <div className={`workspace-status ${status.state === "error" ? "workspace-error" : ""}`} role="status">
    <span>{status.message}</span>
    <span className="row-actions">{status.state === "error" && <button className="link-button" onClick={() => void flushShared()}>Retry save</button>}
      {!readOnly && <button className="link-button" disabled={refreshing} onClick={() => void refreshScores()}>{refreshing ? "Updating scores…" : "Update Sheet scores"}</button>}
      <button className="link-button" disabled={reloading} onClick={() => void reloadData()}>{reloading ? "Reloading…" : "Reload Sheet data"}</button>
      {showSignOut && <button className="link-button" onClick={async () => { if (hasUnsavedChanges()) return; await fetch("/api/auth/logout", { method: "POST" }); window.location.assign("/login"); }}>Sign out</button>}</span>
      {refreshMessage && <span>{refreshMessage}</span>}</div>}{initial ? <div className="workspace-content">{children}</div> : children}</>;
}
