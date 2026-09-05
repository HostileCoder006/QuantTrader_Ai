import { Activity, AlertTriangle, Ban, TrendingDown, TrendingUp } from "lucide-react";
import type { MarketRegime, RegimeName } from "../lib/types";

const REGIME_CONFIG: Record<
  RegimeName,
  { label: string; color: string; bg: string; border: string; icon: typeof TrendingUp; desc: string }
> = {
  BULLISH: {
    label: "BULLISH",
    color: "text-emerald-300",
    bg: "bg-emerald-950/60",
    border: "border-emerald-800",
    icon: TrendingUp,
    desc: "Sustained uptrend — score +10",
  },
  NEUTRAL: {
    label: "NEUTRAL",
    color: "text-amber-300",
    bg: "bg-amber-950/40",
    border: "border-amber-800",
    icon: Activity,
    desc: "Mixed signals — no adjustment",
  },
  BEARISH: {
    label: "BEARISH",
    color: "text-red-300",
    bg: "bg-red-950/50",
    border: "border-red-800",
    icon: TrendingDown,
    desc: "Downtrend — score −15",
  },
  HIGH_VOLATILITY: {
    label: "HIGH VOLATILITY",
    color: "text-orange-300",
    bg: "bg-orange-950/50",
    border: "border-orange-800",
    icon: AlertTriangle,
    desc: "Elevated risk — score −10",
  },
  NO_TRADE: {
    label: "NO TRADE",
    color: "text-slate-300",
    bg: "bg-slate-900/80",
    border: "border-slate-600",
    icon: Ban,
    desc: "Extreme conditions — score −25, NO TRADE override active",
  },
};

type Props = {
  regime: MarketRegime | null;
  loading?: boolean;
};

export function RegimeBar({ regime, loading }: Props) {
  if (loading) {
    return (
      <div className="rounded-md border border-line bg-panel2 px-4 py-2.5 text-xs text-slate-500 animate-pulse">
        Loading market regime...
      </div>
    );
  }

  if (!regime) return null;

  const cfg = REGIME_CONFIG[regime.regime] ?? REGIME_CONFIG.NEUTRAL;
  const Icon = cfg.icon;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm ${cfg.bg} ${cfg.border}`}
      role="status"
      aria-label={`Market regime: ${cfg.label}`}
    >
      {/* Left: regime label + description */}
      <div className="flex items-center gap-3">
        <div className={`flex items-center gap-1.5 font-bold tracking-wide ${cfg.color}`}>
          <Icon size={16} />
          <span>NIFTY REGIME: {cfg.label}</span>
        </div>
        <span className="hidden text-xs text-slate-400 sm:inline">{cfg.desc}</span>
      </div>

      {/* Right: key stats */}
      {regime.data_available && (
        <div className="flex flex-wrap items-center gap-4 text-xs">
          {regime.rsi != null && (
            <span>
              <span className="text-slate-500">RSI </span>
              <span className="font-semibold text-white">{regime.rsi.toFixed(1)}</span>
            </span>
          )}
          {regime.volatility_20d != null && (
            <span>
              <span className="text-slate-500">Vol </span>
              <span className="font-semibold text-white">{regime.volatility_20d.toFixed(1)}%</span>
            </span>
          )}
          {regime.ema20 != null && regime.ema50 != null && (
            <span>
              <span className="text-slate-500">EMA20 vs 50 </span>
              <span
                className={`font-semibold ${
                  regime.ema20 > regime.ema50 ? "text-emerald-300" : "text-red-300"
                }`}
              >
                {regime.ema20 > regime.ema50 ? "▲ Bullish" : "▼ Bearish"}
              </span>
            </span>
          )}
          <span className={`rounded border px-2 py-0.5 font-semibold text-xs ${cfg.color} ${cfg.border} bg-black/30`}>
            Adj {regime.score_adjustment >= 0 ? "+" : ""}
            {regime.score_adjustment} pts
          </span>
        </div>
      )}

      {!regime.data_available && (
        <span className="text-xs text-slate-500">DATA UNAVAILABLE</span>
      )}
    </div>
  );
}
