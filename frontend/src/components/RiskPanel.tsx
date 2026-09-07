import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { formatNumber } from "../lib/api";
import type { RiskMetrics } from "../lib/types";

type RiskPanelProps = {
  fetchFn: () => Promise<RiskMetrics>;
  title?: string;
};

function MetricRow({
  label,
  value,
  description,
  colorFn,
}: {
  label: string;
  value: string;
  description: string;
  colorFn?: (v: string) => string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-3 border-b border-line last:border-0">
      <div>
        <p className="text-sm font-medium text-slate-200">{label}</p>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
      <p className={`number text-sm font-semibold shrink-0 ${colorFn ? colorFn(value) : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}

function RiskScoreBar({ score }: { score: number }) {
  const color = score >= 65 ? "#38d99a" : score >= 40 ? "#f7c35f" : "#f87171";
  const label = score >= 65 ? "Low Risk" : score >= 40 ? "Moderate Risk" : "High Risk";
  return (
    <div className="rounded-md border border-line bg-ink p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-slate-200">Risk Score</p>
        <p className="number text-lg font-bold" style={{ color }}>{score}/100</p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-panel2">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
      <p className="mt-2 text-xs font-medium" style={{ color }}>{label}</p>
    </div>
  );
}

export function RiskPanel({ fetchFn, title = "Risk Analytics" }: RiskPanelProps) {
  const [risk, setRisk] = useState<RiskMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchFn();
      setRisk(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load risk metrics");
    } finally {
      setLoading(false);
    }
  }, [fetchFn]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="panel p-5">
      <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 size={16} className="animate-spin" />
          Computing risk metrics...
        </div>
      )}
      {error && <p className="text-sm text-red-300">{error}</p>}

      {risk && (
        <div className="space-y-4">
          <RiskScoreBar score={risk.risk_score} />

          <div>
            <MetricRow
              label="Volatility (Ann.)"
              value={`${formatNumber(risk.volatility, 1)}%`}
              description="Annualised standard deviation of daily returns"
              colorFn={(v) =>
                parseFloat(v) > 35 ? "text-red-300" : parseFloat(v) > 22 ? "text-amber-300" : "text-mint"
              }
            />
            <MetricRow
              label="Sharpe Ratio"
              value={formatNumber(risk.sharpe_ratio, 3)}
              description="Risk-adjusted return above 6.5% risk-free rate"
              colorFn={(v) =>
                parseFloat(v) > 1.5 ? "text-mint" : parseFloat(v) > 0.5 ? "text-amber-300" : "text-red-300"
              }
            />
            <MetricRow
              label="Sortino Ratio"
              value={formatNumber(risk.sortino_ratio, 3)}
              description="Return adjusted for downside deviation only"
              colorFn={(v) =>
                parseFloat(v) > 1.5 ? "text-mint" : parseFloat(v) > 0.5 ? "text-amber-300" : "text-red-300"
              }
            />
            <MetricRow
              label="Max Drawdown"
              value={`${formatNumber(risk.max_drawdown, 1)}%`}
              description="Largest peak-to-trough decline in the period"
              colorFn={(v) =>
                Math.abs(parseFloat(v)) > 30 ? "text-red-300" : Math.abs(parseFloat(v)) > 15 ? "text-amber-300" : "text-mint"
              }
            />
            <MetricRow
              label="Beta (vs NIFTY)"
              value={formatNumber(risk.beta, 3)}
              description="Sensitivity relative to NIFTY 50 index movements"
              colorFn={(v) =>
                parseFloat(v) > 1.5 ? "text-red-300" : parseFloat(v) < 0.5 ? "text-amber-300" : "text-white"
              }
            />
          </div>

          {risk.source && (
            <p className="text-right text-xs text-slate-600">Source: {risk.source}</p>
          )}
        </div>
      )}
    </section>
  );
}
