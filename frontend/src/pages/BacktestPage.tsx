import { FlaskConical, Loader2 } from "lucide-react";
import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, formatNumber, formatPercent, trendColor } from "../lib/api";
import { NIFTY_50_STOCKS } from "../lib/nifty50";
import type { BacktestResult } from "../lib/types";

const STRATEGIES = [
  { id: "momentum", label: "Momentum Strategy", description: "RSI > 55 + Price > EMA50" },
  { id: "ema_crossover", label: "EMA Crossover", description: "EMA20 crosses EMA50" },
  { id: "rsi_reversal", label: "RSI Reversal", description: "Oversold (RSI < 35) bounce" },
  { id: "sentiment", label: "Sentiment + Volume", description: "EMA trend + volume spike proxy" },
];

const PERIODS = [
  { id: "1y", label: "1 Year" },
  { id: "2y", label: "2 Years" },
  { id: "5y", label: "5 Years" },
];

function MetricCard({
  label,
  value,
  sub,
  colorClass,
}: {
  label: string;
  value: string;
  sub?: string;
  colorClass?: string;
}) {
  return (
    <div className="panel p-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`number mt-2 text-2xl font-semibold ${colorClass ?? "text-white"}`}>{value}</p>
      {sub && <p className="number mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export function BacktestPage() {
  const [symbol, setSymbol] = useState("RELIANCE");
  const [strategy, setStrategy] = useState("momentum");
  const [period, setPeriod] = useState("1y");
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const runBacktest = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await api.backtest(symbol, strategy, period);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backtest failed");
    } finally {
      setLoading(false);
    }
  };

  const chartData = result?.equity_curve.map((v, i) => ({ day: i + 1, strategy: v })) ?? [];

  const selectedStrategy = STRATEGIES.find((s) => s.id === strategy);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-sm font-medium text-cyan">Quantitative Research</p>
        <h2 className="mt-1 text-2xl font-semibold text-white">Strategy Backtester</h2>
        <p className="mt-1 text-sm text-slate-400">
          Test rule-based strategies against historical NIFTY 50 data. No AI — purely deterministic.
        </p>
      </div>

      {/* Config Panel */}
      <section className="panel p-5">
        <h3 className="mb-4 text-base font-semibold text-white">Configuration</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Symbol */}
          <div>
            <label className="mb-1.5 block text-sm text-slate-400" htmlFor="bt-symbol">
              Stock
            </label>
            <select
              id="bt-symbol"
              className="input"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
            >
              {NIFTY_50_STOCKS.map((s) => (
                <option key={s.symbol} value={s.symbol}>
                  {s.symbol} — {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Strategy */}
          <div>
            <label className="mb-1.5 block text-sm text-slate-400" htmlFor="bt-strategy">
              Strategy
            </label>
            <select
              id="bt-strategy"
              className="input"
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
            >
              {STRATEGIES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            {selectedStrategy && (
              <p className="mt-1 text-xs text-slate-500">{selectedStrategy.description}</p>
            )}
          </div>

          {/* Period */}
          <div>
            <label className="mb-1.5 block text-sm text-slate-400" htmlFor="bt-period">
              Period
            </label>
            <select
              id="bt-period"
              className="input"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            >
              {PERIODS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          className="button-primary mt-5 flex items-center gap-2"
          onClick={runBacktest}
          disabled={loading}
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <FlaskConical size={16} />}
          {loading ? "Running Backtest..." : "Run Backtest"}
        </button>
      </section>

      {error && <div className="panel p-4 text-sm text-red-300">{error}</div>}

      {result && (
        <>
          {/* Metrics */}
          <div>
            <h3 className="mb-3 text-base font-semibold text-slate-300">
              {result.symbol} · {STRATEGIES.find((s) => s.id === result.strategy)?.label} · {PERIODS.find((p) => p.id === result.period)?.label}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Total Return"
                value={`${result.total_return >= 0 ? "+" : ""}${formatNumber(result.total_return, 1)}%`}
                sub={`vs NIFTY ${formatPercent(result.benchmark_return)}`}
                colorClass={trendColor(result.total_return)}
              />
              <MetricCard
                label="Alpha vs NIFTY"
                value={`${result.alpha >= 0 ? "+" : ""}${formatNumber(result.alpha, 1)}%`}
                colorClass={trendColor(result.alpha)}
              />
              <MetricCard
                label="CAGR"
                value={`${formatNumber(result.cagr, 1)}%`}
                colorClass={trendColor(result.cagr)}
              />
              <MetricCard
                label="Sharpe Ratio"
                value={formatNumber(result.sharpe_ratio, 3)}
                colorClass={result.sharpe_ratio >= 1 ? "text-mint" : result.sharpe_ratio >= 0 ? "text-amber-300" : "text-red-300"}
              />
              <MetricCard
                label="Sortino Ratio"
                value={formatNumber(result.sortino_ratio, 3)}
                colorClass={result.sortino_ratio >= 1 ? "text-mint" : result.sortino_ratio >= 0 ? "text-amber-300" : "text-red-300"}
              />
              <MetricCard
                label="Max Drawdown"
                value={`${formatNumber(result.max_drawdown, 1)}%`}
                colorClass={Math.abs(result.max_drawdown) > 20 ? "text-red-300" : "text-amber-300"}
              />
              <MetricCard
                label="Win Rate"
                value={`${formatNumber(result.win_rate, 1)}%`}
                colorClass={result.win_rate >= 55 ? "text-mint" : "text-amber-300"}
              />
              <MetricCard
                label="Total Trades"
                value={String(result.total_trades)}
              />
            </div>
          </div>

          {/* Equity Curve */}
          <section className="panel p-5">
            <h3 className="mb-4 text-base font-semibold text-white">Equity Curve (Strategy ₹100 start)</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid stroke="#263941" strokeDasharray="3 3" />
                  <XAxis dataKey="day" tick={{ fill: "#94a3b8", fontSize: 11 }} label={{ value: "Trading Days", position: "insideBottom", offset: -2, fill: "#64748b", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} domain={["auto", "auto"]} />
                  <Tooltip formatter={(v: number) => [`₹${v.toFixed(2)}`, "Portfolio"]} />
                  <ReferenceLine y={100} stroke="#475569" strokeDasharray="4 4" label={{ value: "Start", fill: "#64748b", fontSize: 10 }} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="strategy"
                    stroke="#38d99a"
                    strokeWidth={2}
                    dot={false}
                    name="Strategy"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Benchmark (NIFTY Buy-and-Hold): <span className={`font-semibold ${trendColor(result.benchmark_return)}`}>{formatPercent(result.benchmark_return)}</span> · Alpha: <span className={`font-semibold ${trendColor(result.alpha)}`}>{result.alpha >= 0 ? "+" : ""}{formatNumber(result.alpha, 1)}%</span>
            </p>
          </section>

          <p className="text-xs text-slate-500 panel p-3">
            ⚠ Past performance does not guarantee future results. This backtest is for educational purposes only and uses paper trading data.
          </p>
        </>
      )}
    </div>
  );
}
