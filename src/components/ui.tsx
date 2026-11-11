import type { ReactNode } from "react";
import type { ConfidenceLabel, Tier } from "@/lib/types";

export function TierMark({ tier, large = false }: { tier: Tier; large?: boolean }) {
  return (
    <span className={`tier tier-${tier.toLowerCase()}${large ? " tier-large" : ""}`} title={`Tier ${tier}`}>
      {tier}
    </span>
  );
}

export function Bar({ value, tone = "ink" }: { value: number; tone?: "ink" | "muted" }) {
  return (
    <span className={`bar bar-${tone}`} role="img" aria-label={`${value} out of 100`}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </span>
  );
}

export function ConfidenceText({ label, score }: { label: ConfidenceLabel; score: number }) {
  return (
    <span className={`confidence confidence-${label.toLowerCase()}`}>
      {label} <span className="quiet">{score}</span>
    </span>
  );
}

export function Notice({ tone = "note", children }: { tone?: "note" | "warn" | "stop"; children: ReactNode }) {
  return <p className={`notice notice-${tone}`}>{children}</p>;
}

export function External({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}
