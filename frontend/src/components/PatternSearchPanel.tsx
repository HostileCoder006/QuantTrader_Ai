import { History, Info, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, formatNumber, trendColor } from "../lib/api";
import type { HorizonStats, PatternSearchResult } from "../lib/types";

type Props = { symbol: string };

function HorizonCard({
  label,
  stats,
}: {
  label: string;
  stats: HorizonStats | undefined;
}) {
  if (!stats || !stats.data_available) {
    return (
      <div className="rounded-md border border-line bg-ink p-3">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <p className="mt-2 text-xs text-slate-600">DATA UNAVAILABLE</p>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-line bg-ink p-3">
      <p className="text-xs font-semibold text-slate-400">{label}</p>
      <div className="mt-2 space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">Win Rate</span>
          <span
            className={`font-semibold ${
              (stats.win_rate ?? 0) >= 55
                ? "text-mint"
                : (stats.win_rate ?? 0) >= 45
                ? "text-amber-300"
                : "text-red-300"
            }`}
          >
            {formatNumber(stats.win_rate ?? 0, 1)}%
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">Avg Return</span>
          <span className={`font-semibold ${trendColor(stats.avg_return ?? 0)}`}>
            {stats.avg_return != null
              ? `${stats.avg_return >= 0 ? "+" : ""}${formatNumber(stats.avg_return, 2)}%`
              : "—"}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">Median</span>
          <span className={`font-semibold ${trendColor(stats.median_return ?? 0)}`}>
            {stats.median_return != null
              ? `${stats.median_return >= 0 ? "+" : ""}${formatNumber(stats.median_return, 2)}%`
              : "—"}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">Best / Worst</span>
          <span className="font-mono text-xs text-slate-300">
            <span className="text-mint">+{formatNumber(stats.best_return ?? 0, 1)}%</span>
            {" / "}
            <span className="text-red-300">{formatNumber(stats.worst_return ?? 0, 1)}%</span>
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">Samples</span>
          <span className="text-slate-300">{stats.sample_size}</span>
        </div>
      </div>
    </div>
  );
}

export function PatternSearchPanel({ symbol }: Props) {
  const [data, setData] = useState<PatternSearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    api
      .patternSearch(symbol)
      .then(setData)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Pattern search failed")
      )
      .finally(() => setLoading(false));
  }, [symbol]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-line bg-ink/60 p-4 text-sm text-slate-400">
        <Loader2 size={16} className="animate-spin text-cyan" />
        Searching ~10 years of history for similar setups…
      </div>
    );
  }

  if (error) {
    return <p className="text-xs text-red-300">{error}</p>;
  }

  if (!data || !data.data_available) {
    return (
      <div className="rounded-md border border-line bg-ink/60 p-4 text-xs text-slate-500">
        {data?.message ?? "Historical pattern data unavailable."}
      </div>
    );
  }

  // Build return distribution chart from 20D matches
  const dist = data.matches
    .filter((m) => m.return_20d != null)
    .map((m) => ({
      date: m.date.slice(0, 7),
      return: m.return_20d!,
    }))
    .sort((a, b) => a.return - b.return);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <History size={15} className="text-cyan" />
        <h4 className="text-sm font-semibold text-slate-200">
          Historical Pattern Analysis
        </h4>
        <span className="rounded border border-cyan/30 bg-cyan/10 px-2 py-0.5 text-xs text-cyan">
          {data.similar_count} similar setups
        </span>
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-2 rounded-md border border-amber-900/50 bg-amber-950/20 p-3 text-xs text-amber-300">
        <Info size={13} className="mt-0.5 shrink-0" />
        <p>
          Historical statistics are evidence from past data —{" "}
          <strong>not guaranteed predictions</strong>. Past similar setups in{" "}
          {data.history_start?.slice(0, 4)}–{data.history_end?.slice(0, 4)}.
        </p>
      </div>

      {/* Horizon stats */}
      <div className="grid grid-cols-3 gap-3">
        <HorizonCard label="5-Day Horizon" stats={data.horizon_stats["5d"]} />
        <HorizonCard label="20-Day Horizon" stats={data.horizon_stats["20d"]} />
        <HorizonCard label="60-Day Horizon" stats={data.horizon_stats["60d"]} />
      </div>

      {/* Return distribution chart */}
      {dist.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold text-slate-400">
            20D Return Distribution (past similar setups)
          </p>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dist} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
                <CartesianGrid stroke="#263941" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 9 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} unit="%" />
                <Tooltip
                  formatter={(v: number) => [`${v.toFixed(2)}%`, "20D Return"]}
                  contentStyle={{ background: "#0f1923", border: "1px solid #1e3040", fontSize: 11 }}
                />
                <Bar dataKey="return" radius={[2, 2, 0, 0]}>
                  {dist.map((entry, i) => (
                    <Cell key={i} fill={entry.return >= 0 ? "#38d99a" : "#f87171"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Current features */}
      {Object.keys(data.current_features).length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold text-slate-400">
            Current Setup Fingerprint
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.entries(data.current_features).map(([k, v]) => (
              <div key={k} className="rounded-md border border-line bg-ink px-3 py-2">
                <p className="text-xs text-slate-500">{k.replace(/_/g, " ")}</p>
                <p className="number mt-0.5 text-sm font-semibold text-white">
                  {typeof v === "number" ? formatNumber(v, 2) : String(v)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-slate-600">{data.message}</p>
    </div>
  );
}
