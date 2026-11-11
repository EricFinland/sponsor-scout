"use client";
import { useState } from "react";

export default function LoginPage() {
  const [key, setKey] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      const next = new URLSearchParams(window.location.search).get("next") ?? "/";
      window.location.assign(next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not sign in."); setBusy(false); }
  }
  return <div className="narrow"><div className="page-head"><h1>Team workspace</h1><p className="lede">Sign in to access the shared company research, sponsorship history and outreach tracker.</p></div>
    <form onSubmit={submit} className="side-block"><label className="field"><span>Team access key</span><input className="input" type="password" autoComplete="current-password" value={key} onChange={(e) => setKey(e.target.value)} required /></label>
      <button className="button button-primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>{error && <p role="alert" className="error">{error}</p>}
      <p className="footnote">Ask the workspace owner for access. This key is separate from your Google password.</p></form></div>;
}
