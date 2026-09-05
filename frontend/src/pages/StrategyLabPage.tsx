import { AlertTriangle, FlaskConical, Info, Loader2 } from "lucide-react";
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
import type { StrategyLabResult } from "../lib/types";

// ── Config options ─────────────────────────────────────────────────────────

const ENTRY_RULES = [
  { id: "rsi_above", label: "RSI Above threshold", hint: "e.g. RSI > 55 → momentum entry" },
  { id: "rsi_below", label: "RSI Below threshold", hint: "e.g. RSI < 35 → oversold bounce" },
  { id: "ema_cross_bullish", label: "EMA Bullish Cross", hint: "EMA-fast crosses above EMA-slow" },
  { id: "ema_cross_bearish", label: "EMA Bearish Cross", hint: "EMA-fast crosses below EMA-slow" },
  { id: "macd_hist_above", label: "MACD Histogram > threshold", hint: "e.g. > 0 → bullish momentum" },
  { id: "macd_hist_below", label: "MACD Histogram < threshold", hint: "e.g. < 0 → bearish pressure" },
  { id: "price_above_ema50", label: "Price vs EMA50 > threshold%", hint: "e.g. > 2% above EMA50" },
  { id: "volume_spike_above", label: "Volume Spike > threshold%", hint: "e.g. > 50% above 20D avg" },
];

const EXIT_RULES = ENTRY_RULES;

const PERIODS = [
  { id: "1y", label: "1 Year" },
  { id: "2y", label: "2 Years" },
  { id: "5y", label: "5 Years" },
];

// ── Helpers ────────────────────────────────────────────────────────────────

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
      <p className={`number mt-2 text-xl font-semibold ${colorClass ?? "text-white"}`}>{value}</p>
      {sub && <p className="number mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function InputField({
  id, label, type = "number", value, onChange, min, max, step, hint,
}: {
  id: string; label: string; type?: string; value: string | number;
  onChange: (v: string) => void; min?: number; max?: number; step?: number; hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-slate-400">{label}</label>
      <input
        id={id}
        type={type}
        className="input"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <p className="mt-1 text-xs text-slate-600">{hint}</p>}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export function StrategyLabPage() {
  // Config state
  const [symbol, setSymbol] = useState("RELIANCE");
  const [entryRule, setEntryRule] = useState("rsi_above");
  const [entryValue, setEntryValue] = useState("55");
  const [exitRule, setExitRule] = useState("rsi_below");
  const [exitValue, setExitValue] = useState("40");
  const [emaFast, setEmaFast] = useState("20");
  const [emaSlow, setEmaSlow] = useState("50");
  const [stopLoss, setStopLoss] = useState("5");
  const [takeProfit, setTakeProfit] = useState("12");
  const [maxHolding, setMaxHolding] = useState("30");
  const [tradeCapital, setTradeCapital] = useState("10000");
  const [initialCapital, setInitialCapital] = useState("100000");
  const [costPct, setCostPct] = useState("0.05");
  const [slippagePct, setSlippagePct] = useState("0.05");
  const [period, setPeriod] = useState("2y");

  const [result, setResult] = useState<StrategyLabResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await api.strategyLabRun({
        symbol,
        entry_rule: entryRule,
        entry_value: parseFloat(entryValue),
        exit_rule: exitRule,
        exit_value: parseFloat(exitValue),
        ema_fast: parseInt(emaFast),
        ema_slow: parseInt(emaSlow),
        stop_loss_pct: parseFloat(stopLoss),
        take_profit_pct: parseFloat(takeProfit),
        max_holding_days: parseInt(maxHolding),
        trade_capital: parseFloat(tradeCapital),
        initial_capital: parseFloat(initialCapital),
        cost_pct: parseFloat(costPct),
        slippage_pct: parseFloat(slippagePct),
        period,
      });
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backtest failed");
    } finally {
      setLoading(false);
    }
  };

  const chartData =
    result?.equity_curve.map((v, i) => ({ day: i + 1, strategy: v })) ?? [];

  const selectedEntry = ENTRY_RULES.find((r) => r.id === entryRule);
  const selectedExit = EXIT_RULES.find((r) => r.id === exitRule);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-sm font-medium text-cyan">Quantitative Research</p>
        <h2 className="mt-1 text-2xl font-semibold text-white">Strategy Lab</h2>
        <p className="mt-1 text-sm text-slate-400">
          Configure custom entry/exit rules with position sizing, costs, and slippage. Signals execute at next-bar open — no lookahead bias.
        </p>
      </div>

      {/* Config panel */}
      <section className="panel p-5 space-y-5">
        <h3 className="text-base font-semibold text-white">Strategy Configuration</h3>

        {/* Row 1: Stock + Period */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="sl-symbol" className="mb-1 block text-sm text-slate-400">Stock</label>
            <select id="sl-symbol" className="input" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
              {NIFTY_50_STOCKS.map((s) => (
                <option key={s.symbol} value={s.symbol}>{s.symbol} — {s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sl-period" className="mb-1 block text-sm text-slate-400">Backtest Period</label>
            <select id="sl-period" className="input" value={period} onChange={(e) => setPeriod(e.target.value)}>
              {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
        </div>

        {/* Row 2: Entry rule */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="sl-entry" className="mb-1 block text-sm text-slate-400">Entry Rule</label>
            <select id="sl-entry" className="input" value={entryRule} onChange={(e) => setEntryRule(e.target.value)}>
              {ENTRY_RULES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            {selectedEntry && <p className="mt-1 text-xs text-slate-500">{selectedEntry.hint}</p>}
          </div>
          <InputField
            id="sl-entry-val" label="Entry Threshold Value"
            value={entryValue} onChange={setEntryValue} step={0.1}
            hint="E.g. 55 for RSI, 0 for MACD histogram"
          />
        </div>

        {/* Row 3: Exit rule */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="sl-exit" className="mb-1 block text-sm text-slate-400">Exit Rule</label>
            <select id="sl-exit" className="input" value={exitRule} onChange={(e) => setExitRule(e.target.value)}>
              {EXIT_RULES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            {selectedExit && <p className="mt-1 text-xs text-slate-500">{selectedExit.hint}</p>}
          </div>
          <InputField
            id="sl-exit-val" label="Exit Threshold Value"
            value={exitValue} onChange={setExitValue} step={0.1}
          />
        </div>

        {/* Row 4: EMA periods (used for EMA cross rules) */}
        <div className="grid gap-4 sm:grid-cols-4">
          <InputField id="sl-ema-fast" label="EMA Fast Period" value={emaFast} onChange={setEmaFast} min={5} max={50} hint="Used by EMA cross rules" />
          <InputField id="sl-ema-slow" label="EMA Slow Period" value={emaSlow} onChange={setEmaSlow} min={20} max={200} />
          <InputField id="sl-sl" label="Stop Loss %" value={stopLoss} onChange={setStopLoss} min={0.5} max={30} step={0.5} />
          <InputField id="sl-tp" label="Take Profit %" value={takeProfit} onChange={setTakeProfit} min={1} max={100} step={0.5} />
        </div>

        {/* Row 5: Sizing + costs */}
        <div className="grid gap-4 sm:grid-cols-4">
          <InputField id="sl-hold" label="Max Holding Days" value={maxHolding} onChange={setMaxHolding} min={1} max={252} />
          <InputField id="sl-capital" label="Trade Capital (₹)" value={tradeCapital} onChange={setTradeCapital} min={1000} hint="Capital per trade" />
          <InputField id="sl-cost" label="Cost % (one-way)" value={costPct} onChange={setCostPct} min={0} max={1} step={0.01} hint="Brokerage + STT" />
          <InputField id="sl-slip" label="Slippage %" value={slippagePct} onChange={setSlippagePct} min={0} max={1} step={0.01} />
        </div>

        <div className="flex items-center gap-4 border-t border-line pt-4">
          <InputField
            id="sl-init-cap" label="Initial Capital (₹)"
            value={initialCapital} onChange={setInitialCapital}
            min={10000} hint="Starting portfolio value"
          />
          <button
            className="button-primary mt-5 flex items-center gap-2 self-end"
            onClick={run}
            disabled={loading}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <FlaskConical size={16} />}
            {loading ? "Running…" : "Run Backtest"}
          </button>
        </div>
      </section>

      {error && <div className="panel p-4 text-sm text-red-300">{error}</div>}

      {/* Results */}
      {result && (
        <>
          <h3 className="text-base font-semibold text-slate-300">
            {result.symbol} · {result.stock_name} · {period}
          </h3>

          {/* Metrics grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Total Return"
              value={`${result.total_return >= 0 ? "+" : ""}${formatNumber(result.total_return, 2)}%`}
              sub={`vs NIFTY ${formatPercent(result.benchmark_return)}`}
              colorClass={trendColor(result.total_return)}
            />
            <MetricCard
              label="Alpha vs NIFTY"
              value={`${result.alpha >= 0 ? "+" : ""}${formatNumber(result.alpha, 2)}%`}
              colorClass={trendColor(result.alpha)}
            />
            <MetricCard
              label="CAGR"
              value={`${formatNumber(result.cagr, 2)}%`}
              colorClass={trendColor(result.cagr)}
            />
            <MetricCard
              label="Win Rate"
              value={`${formatNumber(result.win_rate, 1)}%`}
              colorClass={result.win_rate >= 55 ? "text-mint" : "text-amber-300"}
            />
            <MetricCard
              label="Sharpe Ratio"
              value={formatNumber(result.sharpe_ratio, 3)}
              colorClass={result.sharpe_ratio >= 1 ? "text-mint" : result.sharpe_ratio >= 0 ? "text-amber-300" : "text-red-300"}
            />
            <MetricCard
              label="Max Drawdown"
              value={`${formatNumber(result.max_drawdown, 2)}%`}
              colorClass={Math.abs(result.max_drawdown) > 20 ? "text-red-300" : "text-amber-300"}
            />
            <MetricCard
              label="Profit Factor"
              value={result.profit_factor >= 9999 ? "∞" : formatNumber(result.profit_factor, 2)}
              colorClass={result.profit_factor >= 1.5 ? "text-mint" : result.profit_factor >= 1 ? "text-amber-300" : "text-red-300"}
            />
            <MetricCard
              label="Total Trades"
              value={String(result.total_trades)}
              sub={`Avg ${formatNumber(result.avg_days_held, 1)} days held`}
            />
            <MetricCard
              label="Best Trade"
              value={`+${formatNumber(result.best_trade, 2)}%`}
              colorClass="text-mint"
            />
            <MetricCard
              label="Worst Trade"
              value={`${formatNumber(result.worst_trade, 2)}%`}
              colorClass="text-red-300"
            />
            <MetricCard
              label="Sortino Ratio"
              value={formatNumber(result.sortino_ratio, 3)}
              colorClass={result.sortino_ratio >= 1 ? "text-mint" : "text-amber-300"}
            />
            <MetricCard label="NIFTY Benchmark" value={formatPercent(result.benchmark_return)} />
          </div>

          {/* Equity curve */}
          <section className="panel p-5">
            <h3 className="mb-4 text-base font-semibold text-white">
              Equity Curve (₹100 normalised start)
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid stroke="#263941" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    label={{ value: "Trading Days", position: "insideBottom", offset: -2, fill: "#64748b", fontSize: 11 }}
                  />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} domain={["auto", "auto"]} />
                  <Tooltip
                    formatter={(v: number) => [`₹${v.toFixed(2)}`, "Portfolio"]}
                    contentStyle={{ background: "#0f1923", border: "1px solid #1e3040", fontSize: 11 }}
                  />
                  <ReferenceLine
                    y={100}
                    stroke="#475569"
                    strokeDasharray="4 4"
                    label={{ value: "Start", fill: "#64748b", fontSize: 10 }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="strategy" stroke="#38d99a" strokeWidth={2} dot={false} name="Strategy" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Benchmark (NIFTY Buy-and-Hold):{" "}
              <span className={`font-semibold ${trendColor(result.benchmark_return)}`}>
                {formatPercent(result.benchmark_return)}
              </span>{" "}
              · Alpha:{" "}
              <span className={`font-semibold ${trendColor(result.alpha)}`}>
                {result.alpha >= 0 ? "+" : ""}{formatNumber(result.alpha, 2)}%
              </span>
            </p>
          </section>

          {/* Trade log */}
          {result.trade_log.length > 0 && (
            <section className="panel p-5">
              <h3 className="mb-4 text-base font-semibold text-white">
                Recent Trades (last {result.trade_log.length})
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-line text-slate-500">
                      <th className="pb-2 text-left">Entry Date</th>
                      <th className="pb-2 text-left">Exit Date</th>
                      <th className="pb-2 text-right">Entry ₹</th>
                      <th className="pb-2 text-right">Exit ₹</th>
                      <th className="pb-2 text-right">Return</th>
                      <th className="pb-2 text-right">Days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...result.trade_log].reverse().slice(0, 20).map((t, i) => (
                      <tr key={i} className="border-b border-line/50">
                        <td className="py-1.5 text-slate-400">{t.entry_date}</td>
                        <td className="py-1.5 text-slate-400">{t.exit_date}</td>
                        <td className="number py-1.5 text-right text-slate-300">₹{t.entry_price.toFixed(2)}</td>
                        <td className="number py-1.5 text-right text-slate-300">₹{t.exit_price.toFixed(2)}</td>
                        <td className={`number py-1.5 text-right font-semibold ${trendColor(t.return_pct)}`}>
                          {t.return_pct >= 0 ? "+" : ""}{formatNumber(t.return_pct, 2)}%
                        </td>
                        <td className="number py-1.5 text-right text-slate-400">{t.days_held}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Disclaimer */}
          <div className="flex items-start gap-2 rounded-md border border-line bg-panel2 p-3 text-xs text-slate-400">
            <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-400" />
            <p>
              Past performance does not guarantee future results. This backtest uses real historical
              price data with transaction costs and slippage. Signals execute at next-bar open to
              prevent lookahead bias. For educational purposes only.
            </p>
          </div>
        </>
      )}

      {!result && !loading && (
        <div className="panel p-8 text-center">
          <FlaskConical size={32} className="mx-auto mb-3 text-slate-600" />
          <p className="text-sm text-slate-400">
            Configure your strategy above and click Run Backtest to see results.
          </p>
          <div className="mt-4 flex items-start gap-2 rounded-md border border-line bg-panel2 p-3 text-xs text-slate-500 text-left max-w-lg mx-auto">
            <Info size={13} className="mt-0.5 shrink-0" />
            <p>
              Costs and slippage default to 0.05% each way — typical for Indian equity markets.
              Use realistic values to avoid overfitting.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
