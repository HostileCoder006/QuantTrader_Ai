import { AlertTriangle, Brain, Lightbulb, Loader2, MapPin, RefreshCw, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, formatPercent, trendColor } from "../lib/api";
import type { MarketBrief as MarketBriefType } from "../lib/types";

const moodColor: Record<string, string> = {
  Bullish: "text-mint border-mint/30 bg-mint/10",
  Bearish: "text-red-300 border-red-400/30 bg-red-400/10",
  Neutral: "text-amber-300 border-amber-400/30 bg-amber-400/10",
};

function getMood(raw: string): string {
  if (raw.toLowerCase().includes("bullish")) return "Bullish";
  if (raw.toLowerCase().includes("bearish")) return "Bearish";
  return "Neutral";
}

export function MarketBrief() {
  const [brief, setBrief] = useState<MarketBriefType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.marketBrief();
      setBrief(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load market brief");
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
            <h3 className="font-semibold text-white">AI Market Brief</h3>
            <p className="text-xs text-slate-400">Powered by DeepSeek V3</p>
          </div>
        </div>
        <button
          className="button-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs"
          onClick={load}
          disabled={loading}
          aria-label="Refresh market brief"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {loading && !brief && (
        <div className="mt-5 flex items-center gap-2 text-sm text-slate-400">
          <Loader2 size={16} className="animate-spin" />
          Generating market intelligence...
        </div>
      )}

      {error && <p className="mt-5 text-sm text-red-300">{error}</p>}

      {brief && (
        <div className="mt-5 space-y-5">
          {/* NIFTY + mood */}
          <div className="flex flex-wrap items-start gap-3">
            <div className="rounded-md border border-line bg-ink p-3 flex-1 min-w-[140px]">
              <p className="text-xs text-slate-500">NIFTY 50</p>
              <p className="number mt-1 text-lg font-semibold text-white">
                {brief.nifty.value.toLocaleString("en-IN")}
              </p>
              <p className={`number text-sm ${trendColor(brief.nifty.change_percent)}`}>
                {formatPercent(brief.nifty.change_percent)}
              </p>
            </div>
            <div
              className={`rounded-md border px-3 py-3 flex-1 min-w-[160px] ${moodColor[getMood(brief.market_mood)]}`}
            >
              <p className="text-xs opacity-70">Market Mood</p>
              <p className="mt-1 text-sm font-semibold">{getMood(brief.market_mood)}</p>
              <p className="mt-0.5 text-xs opacity-80 line-clamp-2">{brief.market_mood}</p>
            </div>
          </div>

          {/* Summary */}
          <p className="text-sm leading-6 text-slate-300">{brief.market_summary}</p>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Key Events */}
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <Zap size={13} className="text-cyan" />
                Key Events
              </div>
              <ul className="space-y-1.5">
                {brief.key_events.map((event, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan" />
                    {event}
                  </li>
                ))}
              </ul>
            </div>

            {/* Sectors */}
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <MapPin size={13} className="text-cyan" />
                Sectors in Focus
              </div>
              <div className="flex flex-wrap gap-2">
                {brief.sectors_in_focus.map((s) => (
                  <span
                    key={s}
                    className="rounded-md border border-cyan/30 bg-cyan/10 px-2 py-1 text-xs font-medium text-cyan"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>

            {/* Opportunities */}
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <Lightbulb size={13} className="text-mint" />
                Opportunities
              </div>
              <ul className="space-y-1.5">
                {brief.opportunities.map((o, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-mint" />
                    {o}
                  </li>
                ))}
              </ul>
            </div>

            {/* Risks */}
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <AlertTriangle size={13} className="text-red-400" />
                Risks
              </div>
              <ul className="space-y-1.5">
                {brief.risks.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="text-right text-xs text-slate-600">Model: {brief.model}</p>
        </div>
      )}
    </section>
  );
}
