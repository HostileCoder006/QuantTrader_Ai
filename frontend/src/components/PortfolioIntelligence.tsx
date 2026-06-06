import { Brain, CheckCircle, Loader2, RefreshCw, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { PortfolioIntelligence as PortfolioIntelligenceType } from "../lib/types";

function HealthRing({ score }: { score: number }) {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 70 ? "#38d99a" : score >= 45 ? "#f7c35f" : "#f87171";

  return (
    <div className="relative flex items-center justify-center" style={{ width: 120, height: 120 }}>
      <svg width={120} height={120} viewBox="0 0 120 120" aria-hidden="true">
        <circle cx={60} cy={60} r={radius} fill="none" stroke="#1e313a" strokeWidth={10} />
        <circle
          cx={60}
          cy={60}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="number text-2xl font-bold text-white">{score}</span>
        <span className="text-xs text-slate-400">/100</span>
      </div>
    </div>
  );
}

export function PortfolioIntelligence() {
  const [data, setData] = useState<PortfolioIntelligenceType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.portfolioIntelligence();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load portfolio intelligence");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="panel p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-md border border-line bg-panel2 p-2 text-cyan">
            <Brain size={18} />
          </div>
          <div>
            <h3 className="font-semibold text-white">Portfolio Intelligence</h3>
            <p className="text-xs text-slate-400">AI-powered portfolio analysis</p>
          </div>
        </div>
        <button
          className="button-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs"
          onClick={load}
          disabled={loading}
          aria-label="Refresh portfolio intelligence"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {loading && !data && (
        <div className="mt-5 flex items-center gap-2 text-sm text-slate-400">
          <Loader2 size={16} className="animate-spin" />
          Analysing portfolio...
        </div>
      )}
      {error && <p className="mt-5 text-sm text-red-300">{error}</p>}

      {data && (
        <div className="mt-5 space-y-5">
          {/* Health + Scores */}
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
            <div className="flex flex-col items-center gap-2">
              <HealthRing score={data.health_score} />
              <p className="text-xs text-slate-400">Health Score</p>
            </div>

            <div className="grid flex-1 grid-cols-2 gap-3">
              {[
                { label: "Diversification", value: data.diversification_score, max: 100 },
                { label: "Cash Available", value: data.cash_utilization, max: 100, unit: "%" },
                { label: "Holdings", value: data.holdings.length, max: 20, unit: " stocks" },
                { label: "Max Position", value: data.max_single_allocation, max: 100, unit: "%" },
              ].map((metric) => (
                <div key={metric.label} className="rounded-md border border-line bg-ink p-3">
                  <p className="text-xs text-slate-500">{metric.label}</p>
                  <p className="number mt-1 text-base font-semibold text-white">
                    {typeof metric.value === "number"
                      ? Number.isInteger(metric.value)
                        ? metric.value
                        : metric.value.toFixed(1)
                      : metric.value}
                    {metric.unit ?? ""}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Sector Concentration */}
          {Object.keys(data.sector_concentration).length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Sector Allocation
              </p>
              <div className="space-y-2">
                {Object.entries(data.sector_concentration).map(([sector, pct]) => (
                  <div key={sector}>
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>{sector}</span>
                      <span className="number">{pct.toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-panel2">
                      <div
                        className={`h-full rounded-full ${pct > 50 ? "bg-red-400" : pct > 35 ? "bg-amber-400" : "bg-cyan"}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Analysis */}
          {data.ai_analysis && (
            <div className="space-y-4 rounded-md border border-line bg-ink/50 p-4">
              <p className="text-sm leading-6 text-slate-300">{data.ai_analysis.analysis}</p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-mint">
                    <CheckCircle size={13} />
                    Strengths
                  </div>
                  <ul className="space-y-1.5">
                    {data.ai_analysis.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-mint" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-red-300">
                    <XCircle size={13} />
                    Weaknesses
                  </div>
                  <ul className="space-y-1.5">
                    {data.ai_analysis.weaknesses.map((w, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-cyan">
                  Recommendations
                </div>
                <ol className="space-y-1.5 list-none">
                  {data.ai_analysis.recommendations.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                      <span className="shrink-0 rounded bg-cyan/20 px-1.5 text-xs font-bold text-cyan">
                        {i + 1}
                      </span>
                      {r}
                    </li>
                  ))}
                </ol>
              </div>

              <p className="text-right text-xs text-slate-600">Model: {data.ai_analysis.model}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
