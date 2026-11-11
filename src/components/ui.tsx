import type { ReactNode } from "react";
import type { ConfidenceLabel, Tier } from "@/lib/types";

export function TierMark({ tier, large = false }: { tier: Tier; large?: boolean }) {
  return (
    <span className={`tier tier-${tier.toLowerCase()}${large ? " tier-large" : ""}`} title={`Tier ${tier}`}>
      {tier}
    </span>
  );
}

export type BarTone = "ink" | "muted" | "a" | "b" | "c" | "d";

export function Bar({ value, tone = "ink" }: { value: number; tone?: BarTone }) {
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

export const TIER_MEANING: Record<Tier, string> = {
  A: "Pursue now",
  B: "Strong prospect",
  C: "Worth a closer look",
  D: "Low priority",
};

/** A 0 to 100 track split at the tier cutoffs, with a marker at the score. */
export function ScoreScale({
  score,
  tier,
  tiers,
}: {
  score: number;
  tier: Tier;
  tiers: { A: number; B: number; C: number };
}) {
  const segments: { tier: Tier; span: number }[] = [
    { tier: "D", span: tiers.C },
    { tier: "C", span: tiers.B - tiers.C },
    { tier: "B", span: tiers.A - tiers.B },
    { tier: "A", span: 100 - tiers.A },
  ];
  return (
    <div className="scale" role="img" aria-label={`Score ${score} of 100, in tier ${tier}`}>
      <div className="scale-track">
        {segments.map((segment) => (
          <span
            key={segment.tier}
            className={`scale-seg scale-${segment.tier.toLowerCase()}${segment.tier === tier ? " scale-on" : ""}`}
            style={{ flexGrow: Math.max(1, segment.span) }}
          />
        ))}
        <span className="scale-marker" style={{ left: `${Math.max(1, Math.min(99, score))}%` }} />
      </div>
      <div className="scale-labels" aria-hidden="true">
        {segments.map((segment) => (
          <span key={segment.tier} style={{ flexGrow: Math.max(1, segment.span) }}>
            {segment.tier}
          </span>
        ))}
      </div>
    </div>
  );
}
