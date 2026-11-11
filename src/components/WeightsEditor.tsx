"use client";

import { useStore, isSharedWorkspace } from "@/lib/store";
import type { FactorKey, ScoringConfig } from "@/lib/types";
import { FACTOR_LABELS, FACTOR_ORDER } from "@/lib/types";
import { TierMark } from "./ui";

export default function WeightsEditor({ defaults }: { defaults: ScoringConfig }) {
  const [override, setOverride] = useStore("weights");
  const config = override ?? defaults;
  const total = FACTOR_ORDER.reduce((t, k) => t + Math.max(0, config.weights[k]), 0);

  const setWeight = (key: FactorKey, value: number) =>
    setOverride({ ...config, weights: { ...config.weights, [key]: Math.max(0, Math.min(100, value || 0)) } });
  const setTier = (key: "A" | "B" | "C", value: number) =>
    setOverride({ ...config, tiers: { ...config.tiers, [key]: Math.max(0, Math.min(100, value || 0)) } });

  return (
    <div className="weights">
      <table className="data">
        <thead>
          <tr>
            <th>Factor</th>
            <th className="num">Weight</th>
            <th className="num">Share of score</th>
          </tr>
        </thead>
        <tbody>
          {FACTOR_ORDER.map((key) => (
            <tr key={key}>
              <td>
                <label htmlFor={`weight-${key}`}>{FACTOR_LABELS[key]}</label>
              </td>
              <td className="num">
                <input
                  id={`weight-${key}`}
                  className="input input-number"
                  type="number"
                  min={0}
                  max={100}
                  value={config.weights[key]}
                  onChange={(e) => setWeight(key, Number(e.target.value))}
                />
              </td>
              <td className="num">{total > 0 ? Math.round((Math.max(0, config.weights[key]) / total) * 100) : 0}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table className="data">
        <thead>
          <tr>
            <th>Tier</th>
            <th className="num">Minimum score</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          {(["A", "B", "C"] as const).map((tier) => (
            <tr key={tier}>
              <td>
                <TierMark tier={tier} />
              </td>
              <td className="num">
                <input
                  className="input input-number"
                  type="number"
                  min={0}
                  max={100}
                  aria-label={`Minimum score for tier ${tier}`}
                  value={config.tiers[tier]}
                  onChange={(e) => setTier(tier, Number(e.target.value))}
                />
              </td>
              <td>{{ A: "Pursue now", B: "Strong prospect, worth a tailored pitch", C: "Possible, needs more research" }[tier]}</td>
            </tr>
          ))}
          <tr>
            <td>
              <TierMark tier="D" />
            </td>
            <td className="num">Below {config.tiers.C}</td>
            <td>Low priority</td>
          </tr>
        </tbody>
      </table>

      <p className="actions">
        <button type="button" className="button" onClick={() => setOverride(null)} disabled={!override}>
          Reset to defaults
        </button>
        <span className="status">
          {override
            ? isSharedWorkspace() ? "Using shared weights. Changes are queued for the team Sheet; check the save status above." : "Using adjusted weights in this browser. Scores across the app reflect them."
            : "Using the default weights from data/weights.json."}
        </span>
      </p>
    </div>
  );
}
