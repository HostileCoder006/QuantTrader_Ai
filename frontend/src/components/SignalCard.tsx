import { ArrowDownRight, ArrowUpRight, Minus, Shield, Target, TrendingUp } from "lucide-react";
import { formatINR, formatNumber, formatPercent, signalColor } from "../lib/api";
import type { Signal } from "../lib/types";

type SignalCardProps = {
  signal: Signal;
  onViewDetails?: (signal: Signal) => void;
  compact?: boolean;
};

const riskColor: Record<string, string> = {
  Low: "text-mint",
  Medium: "text-amber-300",
  High: "text-red-300",
};

const SignalIcon = ({ signal }: { signal: string }) => {
  if (signal === "Strong Buy" || signal === "Buy")
    return <ArrowUpRight size={16} className="text-mint" />;
  if (signal === "Strong Sell" || signal === "Sell")
    return <ArrowDownRight size={16} className="text-red-300" />;
  return <Minus size={16} className="text-amber-300" />;
};

export function SignalCard({ signal, onViewDetails, compact = false }: SignalCardProps) {
  const badgeClass = signalColor(signal.signal);

  if (compact) {
    return (
      <div
        className={`panel p-4 transition hover:border-cyan/50 ${onViewDetails ? "cursor-pointer" : ""}`}
        onClick={() => onViewDetails?.(signal)}
        role={onViewDetails ? "button" : undefined}
        tabIndex={onViewDetails ? 0 : undefined}
        onKeyDown={(e) => e.key === "Enter" && onViewDetails?.(signal)}
        aria-label={`${signal.symbol} signal: ${signal.signal}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <SignalIcon signal={signal.signal} />
              <span className="font-semibold text-white">{signal.symbol}</span>
              <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${badgeClass}`}>
                {signal.signal}
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-400">{signal.name}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="number text-sm font-semibold text-white">{signal.score}</p>
            <p className="text-xs text-slate-500">score</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="text-slate-500">RSI</p>
            <p className="number text-slate-200">{formatNumber(signal.indicators.rsi, 1)}</p>
          </div>
          <div>
            <p className="text-slate-500">Volume Δ</p>
            <p className={`number ${signal.indicators.volume_change >= 0 ? "text-mint" : "text-red-300"}`}>
              {formatPercent(signal.indicators.volume_change)}
            </p>
          </div>
          <div>
            <p className="text-slate-500">Risk</p>
            <p className={`font-medium ${riskColor[signal.risk] ?? "text-slate-300"}`}>{signal.risk}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel p-5 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <SignalIcon signal={signal.signal} />
            <h3 className="text-xl font-semibold text-white">{signal.symbol}</h3>
            <span className={`rounded-md border px-2.5 py-1 text-sm font-semibold ${badgeClass}`}>
              {signal.signal}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            {signal.name} · {signal.sector}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="number text-2xl font-semibold text-white">{signal.score}</p>
          <p className="text-xs text-slate-500">Signal Score / 100</p>
          <p className="mt-1 text-xs font-medium text-slate-400">
            Confidence:{" "}
            <span className={signal.confidence === "High" ? "text-mint" : "text-amber-300"}>
              {signal.confidence}
            </span>
          </p>
        </div>
      </div>

      {/* Score Bar */}
      <div>
        <div className="mb-1 flex justify-between text-xs text-slate-500">
          <span>Signal Strength</span>
          <span>{signal.score}/100</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-panel2">
          <div
            className={`h-full rounded-full transition-all ${
              signal.score >= 70
                ? "bg-mint"
                : signal.score >= 45
                  ? "bg-amber-400"
                  : "bg-red-400"
            }`}
            style={{ width: `${signal.score}%` }}
          />
        </div>
      </div>

      {/* Indicators grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "RSI (14)", value: formatNumber(signal.indicators.rsi, 1), accent: signal.indicators.rsi > 70 ? "text-red-300" : signal.indicators.rsi < 30 ? "text-amber-300" : "text-white" },
          { label: "MACD", value: signal.indicators.macd.crossover, accent: signal.indicators.macd.crossover === "bullish" ? "text-mint" : signal.indicators.macd.crossover === "bearish" ? "text-red-300" : "text-slate-300" },
          { label: "EMA 20", value: formatINR(signal.indicators.ema20), accent: "text-white" },
          { label: "EMA 50", value: formatINR(signal.indicators.ema50), accent: "text-white" },
          { label: "VWAP", value: formatINR(signal.indicators.vwap), accent: "text-white" },
          { label: "Vol Δ", value: formatPercent(signal.indicators.volume_change), accent: signal.indicators.volume_change >= 20 ? "text-mint" : "text-slate-300" },
          { label: "Momentum", value: formatPercent(signal.indicators.daily_momentum), accent: signal.indicators.daily_momentum >= 0 ? "text-mint" : "text-red-300" },
          { label: "ATR", value: formatINR(signal.indicators.atr), accent: "text-slate-300" },
        ].map((item) => (
          <div key={item.label} className="rounded-md border border-line bg-ink p-3">
            <p className="text-xs text-slate-500">{item.label}</p>
            <p className={`number mt-1 text-sm font-semibold capitalize ${item.accent}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Targets */}
      <div className="rounded-md border border-line bg-ink/50 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Target size={15} className="text-cyan" />
          <h4 className="text-sm font-semibold text-slate-200">ATR-Based Targets</h4>
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-slate-500">Entry</p>
            <p className="number font-semibold text-white mt-1">{formatINR(signal.targets.entry)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <TrendingUp size={11} className="text-mint" /> Target
            </p>
            <p className="number font-semibold text-mint mt-1">{formatINR(signal.targets.target)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <Shield size={11} className="text-red-400" /> Stop Loss
            </p>
            <p className="number font-semibold text-red-300 mt-1">{formatINR(signal.targets.stop_loss)}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>Risk/Reward: <span className="text-cyan">{signal.targets.risk_reward}:1</span></span>
          <span>
            Risk:{" "}
            <span className={`font-medium ${riskColor[signal.risk] ?? "text-slate-300"}`}>
              {signal.risk}
            </span>
          </span>
        </div>
      </div>

      {onViewDetails && (
        <button className="button-secondary w-full" onClick={() => onViewDetails(signal)}>
          View AI Analysis
        </button>
      )}
    </div>
  );
}
