import { AlertCircle, Newspaper, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, formatNumber } from "../lib/api";
import type { NewsReactionStats } from "../lib/types";

const sentimentColor = (cls: string) => {
  if (cls === "Bullish") return "text-mint";
  if (cls === "Bearish") return "text-red-300";
  return "text-amber-300";
};

const sentimentBg = (cls: string) => {
  if (cls === "Bullish") return "bg-emerald-900/40 border-emerald-800 text-emerald-300";
  if (cls === "Bearish") return "bg-red-900/40 border-red-800 text-red-300";
  return "bg-amber-900/30 border-amber-800 text-amber-300";
};

type Props = { symbol: string };

export function NewsReactionPanel({ symbol }: Props) {
  const [data, setData] = useState<NewsReactionStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .newsReactions(symbol)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [symbol]);

  if (loading) {
    return (
      <div className="rounded-md border border-line bg-ink/60 p-4 text-xs text-slate-500 animate-pulse">
        Loading news reaction data…
      </div>
    );
  }

  if (!data || !data.data_available) {
    return (
      <div className="rounded-md border border-line bg-ink/60 p-4 space-y-1">
        <p className="text-xs font-semibold text-slate-400">News → Price Reactions</p>
        <p className="text-xs text-slate-500">
          {data?.message ?? "No reaction data yet. Visit the Sentiment tab to start recording news events."}
        </p>
      </div>
    );
  }

  const trendChart = data.sentiment_trend.map((p) => ({
    date: p.date,
    score: p.score,
  }));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Newspaper size={15} className="text-cyan" />
        <h4 className="text-sm font-semibold text-slate-200">News → Price Reactions</h4>
        <span className="text-xs text-slate-500">
          {data.resolved_events}/{data.total_events} resolved
        </span>
      </div>

      {/* Divergence alert */}
      {data.divergence && (
        <div className="flex items-start gap-2 rounded-md border border-amber-800 bg-amber-950/30 p-3 text-xs text-amber-300">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <div>
            <span className="font-semibold">Divergence Detected: </span>
            {data.divergence.note}
          </div>
        </div>
      )}

      {/* Sentiment trend summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-line bg-ink p-3">
          <p className="text-xs text-slate-500">7D Avg Sentiment</p>
          <p className={`number mt-1 text-lg font-semibold ${
            data.avg_sentiment_7d == null ? "text-slate-500" :
            data.avg_sentiment_7d > 10 ? "text-mint" :
            data.avg_sentiment_7d < -10 ? "text-red-300" : "text-amber-300"
          }`}>
            {data.avg_sentiment_7d != null ? `${data.avg_sentiment_7d > 0 ? "+" : ""}${data.avg_sentiment_7d.toFixed(1)}` : "—"}
          </p>
        </div>
        <div className="rounded-md border border-line bg-ink p-3">
          <p className="text-xs text-slate-500">30D Avg Sentiment</p>
          <p className={`number mt-1 text-lg font-semibold ${
            data.avg_sentiment_30d == null ? "text-slate-500" :
            data.avg_sentiment_30d > 10 ? "text-mint" :
            data.avg_sentiment_30d < -10 ? "text-red-300" : "text-amber-300"
          }`}>
            {data.avg_sentiment_30d != null ? `${data.avg_sentiment_30d > 0 ? "+" : ""}${data.avg_sentiment_30d.toFixed(1)}` : "—"}
          </p>
        </div>
        <div className="rounded-md border border-line bg-ink p-3">
          <p className="text-xs text-slate-500">News Events</p>
          <p className="number mt-1 text-lg font-semibold text-white">{data.total_events}</p>
        </div>
      </div>

      {/* Sentiment trend chart */}
      {trendChart.length > 1 && (
        <div>
          <p className="mb-2 text-xs font-semibold text-slate-400">Sentiment Score Trend</p>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendChart}>
                <CartesianGrid stroke="#263941" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 9 }} />
                <YAxis domain={[-100, 100]} tick={{ fill: "#94a3b8", fontSize: 10 }} />
                <Tooltip
                  formatter={(v: number) => [v, "Sentiment Score"]}
                  contentStyle={{ background: "#0f1923", border: "1px solid #1e3040", fontSize: 11 }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#38d99a"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Reaction stats by horizon */}
      {(["1d", "5d", "20d"] as const).map((h) => {
        const stats = data.reaction_stats[h];
        if (!stats?.data_available) return null;
        return (
          <div key={h}>
            <p className="mb-2 text-xs font-semibold text-slate-400">
              Price Reaction {h.toUpperCase()} After News ({stats.sample_size} events)
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(["Bullish", "Neutral", "Bearish"] as const).map((cls) => {
                const s = stats.by_sentiment_class[cls];
                if (!s) return (
                  <div key={cls} className="rounded border border-line bg-ink/50 px-2 py-2 text-xs text-slate-600 text-center">
                    {cls}<br />No data
                  </div>
                );
                return (
                  <div
                    key={cls}
                    className={`rounded border px-2 py-2 text-xs ${sentimentBg(cls)}`}
                  >
                    <p className="font-semibold">{cls}</p>
                    <p className="mt-1">
                      Avg:{" "}
                      <span className={s.avg_return >= 0 ? "text-mint" : "text-red-300"}>
                        {s.avg_return >= 0 ? "+" : ""}
                        {formatNumber(s.avg_return, 2)}%
                      </span>
                    </p>
                    <p>Win: {formatNumber(s.win_rate, 1)}%</p>
                    <p className="text-slate-400">n={s.count}</p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Trend history table (last 10) */}
      {data.sentiment_trend.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold text-slate-400">Recent Sentiment Events</p>
          <div className="space-y-1">
            {[...data.sentiment_trend].reverse().slice(0, 8).map((p, i) => (
              <div key={i} className="flex items-center justify-between rounded border border-line bg-ink/40 px-3 py-1.5 text-xs">
                <span className="text-slate-500">{p.date}</span>
                <span className={`font-semibold ${sentimentColor(p.class)}`}>{p.class}</span>
                <span className={`font-mono ${p.score >= 0 ? "text-mint" : "text-red-300"}`}>
                  {p.score >= 0 ? "+" : ""}{p.score}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="flex items-center gap-1 text-xs text-slate-600">
        <TrendingUp size={11} />
        {data.message}
      </p>
    </div>
  );
}
