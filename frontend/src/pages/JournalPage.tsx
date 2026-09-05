import { BookOpen, Info, Loader2, RefreshCw, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, formatNumber, formatPercent, signalColor, trendColor } from "../lib/api";
import type { JournalEntry, JournalStats } from "../lib/types";

function StatCard({
  label,
  value,
  sub,
  colorClass = "text-white",
}: {
  label: string;
  value: string;
  sub?: string;
  colorClass?: string;
}) {
  return (
    <div className="panel p-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`number mt-2 text-2xl font-semibold ${colorClass}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function OutcomeCell({ ret }: { ret?: { return_pct: number } }) {
  if (!ret) return <span className="text-slate-600">—</span>;
  return (
    <span className={`font-semibold ${trendColor(ret.return_pct)}`}>
      {ret.return_pct >= 0 ? "+" : ""}
      {formatNumber(ret.return_pct, 2)}%
    </span>
  );
}

const HORIZON_LABELS = ["1d", "5d", "20d", "60d"] as const;

export function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [stats, setStats] = useState<JournalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [entriesData, statsData] = await Promise.all([
        api.journal(300),
        api.journalStats(),
      ]);
      setEntries(entriesData);
      setStats(statsData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load journal");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredEntries =
    filter === "all"
      ? entries
      : entries.filter((e) => e.signal === filter);

  const uniqueSignals = [...new Set(entries.map((e) => e.signal))];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan">Performance Tracking</p>
          <h2 className="mt-1 text-2xl font-semibold text-white">Recommendation Journal</h2>
          <p className="mt-1 text-sm text-slate-400">
            Every signal logged with full context — outcomes tracked 1D/5D/20D/60D
          </p>
        </div>
        <button
          className="button-primary flex items-center gap-2"
          onClick={load}
          disabled={loading}
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          Refresh & Resolve
        </button>
      </div>

      {error && <div className="panel p-4 text-sm text-red-300">{error}</div>}

      {/* Stats */}
      {stats && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total Recommendations"
              value={String(stats.total_recommendations)}
            />
            <StatCard
              label="5D Win Rate"
              value={
                stats.horizon_stats["5d"].data_available
                  ? `${formatNumber(stats.horizon_stats["5d"].win_rate ?? 0, 1)}%`
                  : "—"
              }
              sub={`${stats.horizon_stats["5d"].sample_size} resolved`}
              colorClass={
                (stats.horizon_stats["5d"].win_rate ?? 0) >= 55
                  ? "text-mint"
                  : "text-amber-300"
              }
            />
            <StatCard
              label="20D Avg Return"
              value={
                stats.horizon_stats["20d"].data_available
                  ? `${(stats.horizon_stats["20d"].avg_return ?? 0) >= 0 ? "+" : ""}${formatNumber(stats.horizon_stats["20d"].avg_return ?? 0, 2)}%`
                  : "—"
              }
              colorClass={trendColor(stats.horizon_stats["20d"].avg_return ?? 0)}
            />
            <StatCard
              label="Max Drawdown (5D)"
              value={`${formatNumber(stats.max_drawdown_5d, 1)}%`}
              colorClass={
                Math.abs(stats.max_drawdown_5d) > 15
                  ? "text-red-300"
                  : "text-amber-300"
              }
            />
          </div>

          {/* Horizon detail */}
          <section className="panel p-5">
            <h3 className="mb-4 text-base font-semibold text-white">
              Performance by Horizon
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-xs text-slate-500">
                    <th className="pb-2 text-left">Horizon</th>
                    <th className="pb-2 text-right">Samples</th>
                    <th className="pb-2 text-right">Win Rate</th>
                    <th className="pb-2 text-right">Avg Return</th>
                    <th className="pb-2 text-right">Median</th>
                    <th className="pb-2 text-right">Best</th>
                    <th className="pb-2 text-right">Worst</th>
                    <th className="pb-2 text-right">Avg Alpha</th>
                  </tr>
                </thead>
                <tbody>
                  {HORIZON_LABELS.map((h) => {
                    const hs = stats.horizon_stats[h];
                    if (!hs.data_available) {
                      return (
                        <tr key={h} className="border-b border-line/50">
                          <td className="py-2 font-semibold text-white">{h.toUpperCase()}</td>
                          <td colSpan={7} className="py-2 text-right text-slate-600">
                            DATA UNAVAILABLE — outcomes pending
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={h} className="border-b border-line/50">
                        <td className="py-2 font-semibold text-white">{h.toUpperCase()}</td>
                        <td className="number py-2 text-right text-slate-300">{hs.sample_size}</td>
                        <td className={`number py-2 text-right font-semibold ${(hs.win_rate ?? 0) >= 55 ? "text-mint" : "text-amber-300"}`}>
                          {formatNumber(hs.win_rate ?? 0, 1)}%
                        </td>
                        <td className={`number py-2 text-right font-semibold ${trendColor(hs.avg_return ?? 0)}`}>
                          {(hs.avg_return ?? 0) >= 0 ? "+" : ""}{formatNumber(hs.avg_return ?? 0, 2)}%
                        </td>
                        <td className={`number py-2 text-right ${trendColor(hs.median_return ?? 0)}`}>
                          {(hs.median_return ?? 0) >= 0 ? "+" : ""}{formatNumber(hs.median_return ?? 0, 2)}%
                        </td>
                        <td className="number py-2 text-right text-mint">
                          +{formatNumber(hs.best_return ?? 0, 2)}%
                        </td>
                        <td className="number py-2 text-right text-red-300">
                          {formatNumber(hs.worst_return ?? 0, 2)}%
                        </td>
                        <td className={`number py-2 text-right ${trendColor(hs.avg_alpha ?? 0)}`}>
                          {(hs.avg_alpha ?? 0) >= 0 ? "+" : ""}{formatNumber(hs.avg_alpha ?? 0, 2)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* By signal breakdown */}
          {stats.horizon_stats["5d"].data_available &&
            Object.keys(stats.horizon_stats["5d"].by_signal ?? {}).length > 0 && (
              <section className="panel p-5">
                <h3 className="mb-4 text-base font-semibold text-white">
                  5D Win Rate by Signal Type
                </h3>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(stats.horizon_stats["5d"].by_signal ?? {}).map(
                    ([sig, s]) => (
                      <div
                        key={sig}
                        className="flex items-center gap-2 rounded-md border border-line bg-ink px-3 py-2"
                      >
                        <span
                          className={`rounded border px-2 py-0.5 text-xs font-semibold ${signalColor(sig)}`}
                        >
                          {sig}
                        </span>
                        <span className="text-xs text-slate-400">
                          {formatNumber(s.win_rate, 1)}% win · n={s.count}
                        </span>
                      </div>
                    )
                  )}
                </div>
              </section>
            )}
        </>
      )}

      {/* Disclaimer */}
      <div className="flex items-start gap-2 rounded-md border border-line bg-panel2 p-3 text-xs text-slate-400">
        <Info size={13} className="mt-0.5 shrink-0 text-amber-400" />
        <p>
          Outcomes are resolved using real market prices after the required holding period.
          Statistics are historical evidence only — not guaranteed future performance.
          Outcomes show "—" until sufficient time has elapsed.
        </p>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-slate-500">Filter:</span>
        {["all", ...uniqueSignals].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
              filter === s
                ? signalColor(s === "all" ? "Hold" : s) + " border-opacity-100"
                : "border-line text-slate-400 hover:text-white"
            }`}
          >
            {s === "all" ? "All" : s}
            {s !== "all" && stats?.by_signal[s] != null && (
              <span className="ml-1 text-slate-500">({stats.by_signal[s]})</span>
            )}
          </button>
        ))}
      </div>

      {/* Entries table */}
      {loading && !entries.length ? (
        <div className="panel p-8 flex items-center gap-3 text-slate-400">
          <Loader2 size={24} className="animate-spin text-cyan" />
          Loading journal entries...
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="panel p-8 text-center">
          <BookOpen size={32} className="mx-auto mb-3 text-slate-600" />
          <p className="text-sm text-slate-400">
            No journal entries yet.{" "}
            {filter !== "all"
              ? "Try clearing the filter."
              : "Run the Scanner or view signal explanations to start logging recommendations."}
          </p>
        </div>
      ) : (
        <section className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-slate-500">
                <th className="px-3 py-3 text-left">Symbol</th>
                <th className="px-3 py-3 text-left">Signal</th>
                <th className="px-3 py-3 text-right">Score</th>
                <th className="px-3 py-3 text-right">Price</th>
                <th className="px-3 py-3 text-center">Regime</th>
                <th className="px-3 py-3 text-right">1D</th>
                <th className="px-3 py-3 text-right">5D</th>
                <th className="px-3 py-3 text-right">20D</th>
                <th className="px-3 py-3 text-right">60D</th>
                <th className="px-3 py-3 text-right">Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-line/50 hover:bg-panel2/50 transition"
                >
                  <td className="px-3 py-2.5 font-semibold text-white">
                    {entry.symbol}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`rounded border px-2 py-0.5 text-xs font-semibold ${signalColor(entry.signal)}`}
                    >
                      {entry.signal}
                    </span>
                  </td>
                  <td className="number px-3 py-2.5 text-right text-white">
                    {entry.score}
                  </td>
                  <td className="number px-3 py-2.5 text-right text-slate-300">
                    ₹{entry.price_at_signal?.toFixed(2) ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span
                      className={`text-xs font-medium ${
                        entry.regime === "BULLISH"
                          ? "text-emerald-300"
                          : entry.regime === "BEARISH"
                          ? "text-red-300"
                          : entry.regime === "NO_TRADE"
                          ? "text-slate-400"
                          : "text-amber-300"
                      }`}
                    >
                      {entry.regime}
                    </span>
                  </td>
                  <td className="number px-3 py-2.5 text-right text-xs">
                    <OutcomeCell ret={entry.outcomes["1d"]} />
                  </td>
                  <td className="number px-3 py-2.5 text-right text-xs">
                    <OutcomeCell ret={entry.outcomes["5d"]} />
                  </td>
                  <td className="number px-3 py-2.5 text-right text-xs">
                    <OutcomeCell ret={entry.outcomes["20d"]} />
                  </td>
                  <td className="number px-3 py-2.5 text-right text-xs">
                    <OutcomeCell ret={entry.outcomes["60d"]} />
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-slate-500">
                    {entry.timestamp.slice(0, 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {entries.length > 0 && (
        <p className="flex items-center gap-1 text-xs text-slate-600">
          <TrendingUp size={11} />
          Showing {filteredEntries.length} of {entries.length} entries. Outcomes resolve automatically as time passes.
        </p>
      )}
    </div>
  );
}
