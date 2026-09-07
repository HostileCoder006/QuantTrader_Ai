import {
  AlertTriangle,
  BarChart2,
  FlaskConical,
  Info,
  Loader2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
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
import type { StrategyLabChartData, StrategyLabResult } from "../lib/types";

// ── Config options ──────────────────────────────────────────────────────────

const ENTRY_RULES = [
  { id: "rsi_above",        label: "RSI Above threshold",         hint: "e.g. RSI > 55 → momentum entry" },
  { id: "rsi_below",        label: "RSI Below threshold",         hint: "e.g. RSI < 35 → oversold bounce" },
  { id: "ema_cross_bullish",label: "EMA Bullish Cross",           hint: "EMA-fast crosses above EMA-slow" },
  { id: "ema_cross_bearish",label: "EMA Bearish Cross",           hint: "EMA-fast crosses below EMA-slow" },
  { id: "macd_hist_above",  label: "MACD Histogram > threshold",  hint: "e.g. > 0 → bullish momentum" },
  { id: "macd_hist_below",  label: "MACD Histogram < threshold",  hint: "e.g. < 0 → bearish pressure" },
  { id: "price_above_ema50",label: "Price vs EMA50 > threshold%", hint: "e.g. > 2 % above EMA50" },
  { id: "volume_spike_above",label: "Volume Spike > threshold%",  hint: "e.g. > 50 % above 20D avg" },
];
const EXIT_RULES = ENTRY_RULES;

const PERIODS = [
  { id: "1y", label: "1 Year"  },
  { id: "2y", label: "2 Years" },
  { id: "5y", label: "5 Years" },
];

// ── Small helpers ───────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, colorClass }: {
  label: string; value: string; sub?: string; colorClass?: string;
}) {
  return (
    <div className="panel p-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`number mt-2 text-xl font-semibold ${colorClass ?? "text-white"}`}>{value}</p>
      {sub && <p className="number mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function Field({ id, label, value, onChange, min, max, step, hint, type = "number" }: {
  id: string; label: string; value: string | number;
  onChange: (v: string) => void;
  min?: number; max?: number; step?: number; hint?: string; type?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-slate-400">{label}</label>
      <input id={id} type={type} className="input" value={value}
        min={min} max={max} step={step} onChange={e => onChange(e.target.value)} />
      {hint && <p className="mt-1 text-xs text-slate-600">{hint}</p>}
    </div>
  );
}

// ── Chart tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line bg-ink p-2.5 text-xs shadow-lg">
      <p className="mb-1.5 font-semibold text-slate-300">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color ?? "#fff" }}>
          {p.name}: {typeof p.value === "number" ? p.value.toFixed(2) : p.value}
        </p>
      ))}
    </div>
  );
}

// ── Signal marker dot ───────────────────────────────────────────────────────

function SignalDot(props: any) {
  const { cx, cy, payload } = props;
  if (!payload) return null;
  if (payload.buySignal) {
    return (
      <g>
        <polygon points={`${cx},${cy - 14} ${cx - 7},${cy} ${cx + 7},${cy}`}
          fill="#38d99a" stroke="#0f1923" strokeWidth={1} />
      </g>
    );
  }
  if (payload.sellSignal) {
    return (
      <g>
        <polygon points={`${cx},${cy + 14} ${cx - 7},${cy} ${cx + 7},${cy}`}
          fill="#f87171" stroke="#0f1923" strokeWidth={1} />
      </g>
    );
  }
  return null;
}

// ── Toggle switch ───────────────────────────────────────────────────────────

function Toggle({ checked, onChange, label, color = "bg-mint" }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; color?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition ${
        checked
          ? `${color === "bg-mint" ? "border-emerald-700 bg-emerald-900/40 text-mint" : "border-cyan-700 bg-cyan-900/30 text-cyan"}`
          : "border-line bg-panel2 text-slate-500"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${checked ? color : "bg-slate-600"}`} />
      {label}
    </button>
  );
}

// ── Three-panel chart ───────────────────────────────────────────────────────

function IndicatorCharts({
  chartData,
  showRsi,
  showMacd,
  rsiPeriod,
  macdFast,
  macdSlow,
  macdSignal,
}: {
  chartData: StrategyLabChartData;
  showRsi: boolean;
  showMacd: boolean;
  rsiPeriod: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
}) {
  // Build a flat array of objects so all charts share the same x-axis index
  const buySet  = new Set(chartData.trade_signals.buy.map(b => b.date));
  const sellSet = new Set(chartData.trade_signals.sell.map(s => s.date));

  const rows = chartData.dates.map((date, i) => ({
    date,
    close:      chartData.ohlcv.close[i],
    rsi:        chartData.rsi.values[i],
    macd:       chartData.macd.macd[i],
    macdSig:    chartData.macd.signal[i],
    macdHist:   chartData.macd.histogram[i],
    buySignal:  buySet.has(date)  ? chartData.ohlcv.close[i] : null,
    sellSignal: sellSet.has(date) ? chartData.ohlcv.close[i] : null,
  }));

  // Thin the x-axis labels
  const tickCount = Math.min(8, chartData.bars);
  const tickStep  = Math.max(1, Math.floor(chartData.bars / tickCount));
  const ticks     = chartData.dates.filter((_, i) => i % tickStep === 0);

  const commonXAxis = (
    <XAxis
      dataKey="date"
      ticks={ticks}
      tick={{ fill: "#64748b", fontSize: 10 }}
      tickLine={false}
      axisLine={false}
    />
  );

  const gridProps = { stroke: "#1e313a", strokeDasharray: "3 3" };

  return (
    <div className="space-y-1">
      {/* ── Price + signal markers ── */}
      <div>
        <p className="mb-1 text-xs font-medium text-slate-400">
          Price  ·  ▲ BUY  ▼ SELL
        </p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              {commonXAxis}
              <YAxis
                domain={["auto", "auto"]}
                tick={{ fill: "#94a3b8", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={55}
                tickFormatter={v => `₹${(v as number).toFixed(0)}`}
              />
              <Tooltip content={<ChartTooltip />} />

              {/* Close price line */}
              <Line
                type="monotone"
                dataKey="close"
                stroke="#43c8f5"
                strokeWidth={1.5}
                dot={false}
                name="Close"
              />

              {/* Buy signal dots */}
              <Line
                type="monotone"
                dataKey="buySignal"
                stroke="transparent"
                dot={<SignalDot />}
                activeDot={false}
                name="Buy"
                legendType="none"
              />

              {/* Sell signal dots */}
              <Line
                type="monotone"
                dataKey="sellSignal"
                stroke="transparent"
                dot={<SignalDot />}
                activeDot={false}
                name="Sell"
                legendType="none"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-1 flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <span className="inline-block h-0 w-4 border-t-2 border-cyan" />
            Close price
          </span>
          <span className="flex items-center gap-1">
            <span style={{ display: "inline-block", width: 0, height: 0,
              borderLeft: "5px solid transparent", borderRight: "5px solid transparent",
              borderBottom: "8px solid #38d99a" }} />
            Buy signal
          </span>
          <span className="flex items-center gap-1">
            <span style={{ display: "inline-block", width: 0, height: 0,
              borderLeft: "5px solid transparent", borderRight: "5px solid transparent",
              borderTop: "8px solid #f87171" }} />
            Sell signal
          </span>
          <span className="ml-auto text-slate-600">
            {chartData.trade_signals.buy.length} buys · {chartData.trade_signals.sell.length} sells
          </span>
        </div>
      </div>

      {/* ── RSI panel ── */}
      {showRsi && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-medium text-slate-400">
            RSI ({rsiPeriod})  ·  OB: 70  ·  OS: 30
          </p>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                {commonXAxis}
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 30, 50, 70, 100]}
                  tick={{ fill: "#94a3b8", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={30}
                />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={70} stroke="#f87171" strokeDasharray="3 3" strokeOpacity={0.5} />
                <ReferenceLine y={30} stroke="#38d99a" strokeDasharray="3 3" strokeOpacity={0.5} />
                <ReferenceLine y={50} stroke="#475569" strokeDasharray="2 4" strokeOpacity={0.4} />
                <Line
                  type="monotone"
                  dataKey="rsi"
                  stroke="#f7c35f"
                  strokeWidth={1.5}
                  dot={false}
                  name={`RSI(${rsiPeriod})`}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-0.5 flex gap-4 text-xs text-slate-600">
            <span className="text-red-400">— 70 overbought</span>
            <span className="text-mint">— 30 oversold</span>
          </div>
        </div>
      )}

      {/* ── MACD panel ── */}
      {showMacd && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-medium text-slate-400">
            MACD ({macdFast},{macdSlow},{macdSignal})
          </p>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                {commonXAxis}
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fill: "#94a3b8", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={42}
                />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={0} stroke="#475569" strokeOpacity={0.6} />

                {/* Histogram as bars */}
                <Bar
                  dataKey="macdHist"
                  name="Histogram"
                  fill="#38d99a"
                  radius={[1, 1, 0, 0]}
                  // Color each bar individually inline via Cell would need import —
                  // use opacity trick instead: positive = mint, negative = red via CSS
                  // Recharts Bar doesn't easily color per-value without Cell;
                  // we use a shape override:
                  shape={(props: any) => {
                    const { x, y, width, height, value } = props;
                    const fill = value >= 0 ? "#38d99a" : "#f87171";
                    const barY  = value >= 0 ? y : y + height;
                    const barH  = Math.abs(height);
                    return <rect x={x} y={barY} width={width} height={Math.max(barH, 1)} fill={fill} opacity={0.7} />;
                  }}
                />

                {/* MACD line */}
                <Line
                  type="monotone"
                  dataKey="macd"
                  stroke="#43c8f5"
                  strokeWidth={1.5}
                  dot={false}
                  name="MACD"
                  connectNulls
                />

                {/* Signal line */}
                <Line
                  type="monotone"
                  dataKey="macdSig"
                  stroke="#f87171"
                  strokeWidth={1.5}
                  dot={false}
                  name="Signal"
                  connectNulls
                />

                <Legend
                  wrapperStyle={{ fontSize: 10, color: "#64748b", paddingTop: 2 }}
                  iconSize={8}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

export function StrategyLabPage() {
  // Strategy config
  const [symbol,       setSymbol]       = useState("RELIANCE");
  const [entryRule,    setEntryRule]    = useState("rsi_above");
  const [entryValue,   setEntryValue]   = useState("55");
  const [exitRule,     setExitRule]     = useState("rsi_below");
  const [exitValue,    setExitValue]    = useState("40");
  const [emaFast,      setEmaFast]      = useState("20");
  const [emaSlow,      setEmaSlow]      = useState("50");
  const [stopLoss,     setStopLoss]     = useState("5");
  const [takeProfit,   setTakeProfit]   = useState("12");
  const [maxHolding,   setMaxHolding]   = useState("30");
  const [tradeCapital, setTradeCapital] = useState("10000");
  const [initialCap,   setInitialCap]   = useState("100000");
  const [costPct,      setCostPct]      = useState("0.05");
  const [slippagePct,  setSlippagePct]  = useState("0.05");
  const [period,       setPeriod]       = useState("2y");

  // Indicator panel params
  const [rsiPeriod,   setRsiPeriod]   = useState("14");
  const [macdFast,    setMacdFast]    = useState("12");
  const [macdSlow,    setMacdSlow]    = useState("26");
  const [macdSignal,  setMacdSignal]  = useState("9");

  // Toggles
  const [showRsi,  setShowRsi]  = useState(true);
  const [showMacd, setShowMacd] = useState(true);

  // Data
  const [result,    setResult]    = useState<StrategyLabResult | null>(null);
  const [chartData, setChartData] = useState<StrategyLabChartData | null>(null);
  const [loadingRun,   setLoadingRun]   = useState(false);
  const [loadingChart, setLoadingChart] = useState(false);
  const [error,    setError]    = useState("");
  const [chartErr, setChartErr] = useState("");

  // Track the last config that produced the current chart so we know when it
  // is stale (symbol or period changed since the last chart load).
  const lastChartConfig = useRef<string>("");

  // ── Build a consistent config payload ──────────────────────────────────────
  const buildConfig = useCallback(() => ({
    symbol,
    period,
    entry_rule:        entryRule,
    entry_value:       parseFloat(entryValue),
    exit_rule:         exitRule,
    exit_value:        parseFloat(exitValue),
    ema_fast:          parseInt(emaFast),
    ema_slow:          parseInt(emaSlow),
    stop_loss_pct:     parseFloat(stopLoss),
    take_profit_pct:   parseFloat(takeProfit),
    max_holding_days:  parseInt(maxHolding),
    trade_capital:     parseFloat(tradeCapital),
    initial_capital:   parseFloat(initialCap),
    cost_pct:          parseFloat(costPct),
    slippage_pct:      parseFloat(slippagePct),
    rsi_period:        parseInt(rsiPeriod),
    macd_fast:         parseInt(macdFast),
    macd_slow:         parseInt(macdSlow),
    macd_signal:       parseInt(macdSignal),
  }), [symbol, period, entryRule, entryValue, exitRule, exitValue,
      emaFast, emaSlow, stopLoss, takeProfit, maxHolding,
      tradeCapital, initialCap, costPct, slippagePct,
      rsiPeriod, macdFast, macdSlow, macdSignal]);

  // ── Load chart whenever symbol or period change ────────────────────────────
  const loadChart = useCallback(async (cfg: ReturnType<typeof buildConfig>) => {
    const key = `${cfg.symbol}|${cfg.period}|${cfg.entry_rule}|${cfg.entry_value}|${cfg.exit_rule}|${cfg.exit_value}|${cfg.ema_fast}|${cfg.ema_slow}|${cfg.rsi_period}|${cfg.macd_fast}|${cfg.macd_slow}|${cfg.macd_signal}`;
    if (key === lastChartConfig.current) return;
    lastChartConfig.current = key;

    setLoadingChart(true);
    setChartErr("");
    try {
      const data = await api.strategyLabChart(cfg);
      setChartData(data);
    } catch (e) {
      setChartErr(e instanceof Error ? e.message : "Chart load failed");
    } finally {
      setLoadingChart(false);
    }
  }, []);

  // Load chart on mount with defaults
  useEffect(() => {
    loadChart(buildConfig());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-load chart when symbol or period change (without waiting for full run)
  useEffect(() => {
    const cfg = buildConfig();
    const key = `${cfg.symbol}|${cfg.period}`;
    loadChart(cfg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, period]);

  // ── Run full backtest ───────────────────────────────────────────────────────
  const run = async () => {
    const cfg = buildConfig();
    setLoadingRun(true);
    setError("");
    setResult(null);
    try {
      // Run chart + backtest in parallel
      const [runData] = await Promise.all([
        api.strategyLabRun(cfg),
        loadChart(cfg),
      ]);
      setResult(runData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backtest failed");
    } finally {
      setLoadingRun(false);
    }
  };

  const equityCurveData = result?.equity_curve.map((v, i) => ({ day: i + 1, strategy: v })) ?? [];
  const selectedEntry = ENTRY_RULES.find(r => r.id === entryRule);
  const selectedExit  = EXIT_RULES.find(r  => r.id === exitRule);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-sm font-medium text-cyan">Quantitative Research</p>
        <h2 className="mt-1 text-2xl font-semibold text-white">Strategy Lab</h2>
        <p className="mt-1 text-sm text-slate-400">
          Configure entry/exit rules, position sizing, costs and slippage. Signals execute at next-bar open — no lookahead bias.
        </p>
      </div>

      {/* ── Config panel ── */}
      <section className="panel p-5 space-y-5">
        <h3 className="text-base font-semibold text-white">Strategy Configuration</h3>

        {/* Stock + Period */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="sl-symbol" className="mb-1 block text-sm text-slate-400">Stock</label>
            <select id="sl-symbol" className="input" value={symbol}
              onChange={e => { setSymbol(e.target.value); }}>
              {NIFTY_50_STOCKS.map(s => (
                <option key={s.symbol} value={s.symbol}>{s.symbol} — {s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sl-period" className="mb-1 block text-sm text-slate-400">Backtest Period</label>
            <select id="sl-period" className="input" value={period}
              onChange={e => { setPeriod(e.target.value); }}>
              {PERIODS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
        </div>

        {/* Entry rule */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="sl-entry" className="mb-1 block text-sm text-slate-400">Entry Rule</label>
            <select id="sl-entry" className="input" value={entryRule} onChange={e => setEntryRule(e.target.value)}>
              {ENTRY_RULES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            {selectedEntry && <p className="mt-1 text-xs text-slate-500">{selectedEntry.hint}</p>}
          </div>
          <Field id="sl-entry-val" label="Entry Threshold Value"
            value={entryValue} onChange={setEntryValue} step={0.1}
            hint="e.g. 55 for RSI, 0 for MACD histogram" />
        </div>

        {/* Exit rule */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="sl-exit" className="mb-1 block text-sm text-slate-400">Exit Rule</label>
            <select id="sl-exit" className="input" value={exitRule} onChange={e => setExitRule(e.target.value)}>
              {EXIT_RULES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            {selectedExit && <p className="mt-1 text-xs text-slate-500">{selectedExit.hint}</p>}
          </div>
          <Field id="sl-exit-val" label="Exit Threshold Value"
            value={exitValue} onChange={setExitValue} step={0.1} />
        </div>

        {/* EMA + risk */}
        <div className="grid gap-4 sm:grid-cols-4">
          <Field id="sl-ema-fast" label="EMA Fast" value={emaFast} onChange={setEmaFast} min={5}  max={50}  hint="EMA cross rules" />
          <Field id="sl-ema-slow" label="EMA Slow"  value={emaSlow} onChange={setEmaSlow} min={20} max={200} />
          <Field id="sl-sl"       label="Stop Loss %" value={stopLoss} onChange={setStopLoss} min={0.5} max={30} step={0.5} />
          <Field id="sl-tp"       label="Take Profit %" value={takeProfit} onChange={setTakeProfit} min={1} max={100} step={0.5} />
        </div>

        {/* Position sizing + costs */}
        <div className="grid gap-4 sm:grid-cols-4">
          <Field id="sl-hold"    label="Max Holding Days" value={maxHolding}   onChange={setMaxHolding}   min={1}    max={252} />
          <Field id="sl-cap"     label="Trade Capital (₹)" value={tradeCapital} onChange={setTradeCapital} min={1000} hint="Per trade" />
          <Field id="sl-cost"    label="Cost % (one-way)" value={costPct}      onChange={setCostPct}      min={0}    max={1}   step={0.01} hint="Brokerage + STT" />
          <Field id="sl-slip"    label="Slippage %"        value={slippagePct}  onChange={setSlippagePct}  min={0}    max={1}   step={0.01} />
        </div>

        <div className="flex flex-wrap items-end gap-4 border-t border-line pt-4">
          <Field id="sl-init-cap" label="Initial Capital (₹)" value={initialCap}
            onChange={setInitialCap} min={10000} hint="Starting portfolio value" />
          <button className="button-primary flex items-center gap-2 self-end mb-0.5"
            onClick={run} disabled={loadingRun}>
            {loadingRun
              ? <Loader2 size={16} className="animate-spin" />
              : <FlaskConical size={16} />}
            {loadingRun ? "Running…" : "Run Backtest"}
          </button>
        </div>
      </section>

      {error && <div className="panel p-4 text-sm text-red-300">{error}</div>}

      {/* ── Indicator chart panel ── */}
      <section className="panel p-5 space-y-4">
        {/* Chart header: toggles + indicator params */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BarChart2 size={16} className="text-cyan" />
              <h3 className="text-base font-semibold text-white">
                {chartData ? `${chartData.symbol} · ${chartData.stock_name}` : "Price Chart"}
              </h3>
              {loadingChart && <Loader2 size={14} className="animate-spin text-slate-400" />}
            </div>
            <p className="text-xs text-slate-500">
              Indicators update when stock or period changes. Run Backtest to show trade signals.
            </p>
          </div>

          {/* Toggles */}
          <div className="flex flex-wrap gap-2">
            <Toggle checked={showRsi}  onChange={setShowRsi}  label="RSI"  color="bg-amber-400" />
            <Toggle checked={showMacd} onChange={setShowMacd} label="MACD" color="bg-mint" />
            {chartData && (
              <button
                className="flex items-center gap-1.5 rounded-md border border-line bg-panel2 px-3 py-1.5 text-xs text-slate-400 hover:text-white transition"
                onClick={() => loadChart({ ...buildConfig(), _force: Date.now() } as any)}
                disabled={loadingChart}
                title="Reload chart"
              >
                <RefreshCw size={12} className={loadingChart ? "animate-spin" : ""} />
                Reload
              </button>
            )}
          </div>
        </div>

        {/* Indicator params row */}
        <div className="flex flex-wrap gap-4 rounded-md border border-line bg-panel2 p-3">
          {showRsi && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">RSI Period</span>
              <input type="number" className="input w-16 py-1 text-xs" value={rsiPeriod}
                min={2} max={50} onChange={e => setRsiPeriod(e.target.value)} />
            </div>
          )}
          {showMacd && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">MACD Fast</span>
                <input type="number" className="input w-16 py-1 text-xs" value={macdFast}
                  min={2} max={50} onChange={e => setMacdFast(e.target.value)} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Slow</span>
                <input type="number" className="input w-16 py-1 text-xs" value={macdSlow}
                  min={5} max={200} onChange={e => setMacdSlow(e.target.value)} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Signal</span>
                <input type="number" className="input w-16 py-1 text-xs" value={macdSignal}
                  min={2} max={50} onChange={e => setMacdSignal(e.target.value)} />
              </div>
            </>
          )}
          {!showRsi && !showMacd && (
            <p className="text-xs text-slate-500">Enable RSI or MACD with the toggles above.</p>
          )}
        </div>

        {/* Chart content */}
        {chartErr && <p className="text-xs text-red-300">{chartErr}</p>}

        {loadingChart && !chartData && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
            <Loader2 size={20} className="animate-spin text-cyan" />
            Loading chart data…
          </div>
        )}

        {chartData && (
          <IndicatorCharts
            chartData={chartData}
            showRsi={showRsi}
            showMacd={showMacd}
            rsiPeriod={parseInt(rsiPeriod)}
            macdFast={parseInt(macdFast)}
            macdSlow={parseInt(macdSlow)}
            macdSignal={parseInt(macdSignal)}
          />
        )}

        {!chartData && !loadingChart && !chartErr && (
          <p className="py-8 text-center text-sm text-slate-500">
            Select a stock and period — chart loads automatically.
          </p>
        )}
      </section>

      {/* ── Backtest results ── */}
      {result && (
        <>
          <h3 className="text-base font-semibold text-slate-300">
            {result.symbol} · {result.stock_name} · {period}
          </h3>

          {/* Metrics grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Total Return"
              value={`${result.total_return >= 0 ? "+" : ""}${formatNumber(result.total_return, 2)}%`}
              sub={`vs NIFTY ${formatPercent(result.benchmark_return)}`}
              colorClass={trendColor(result.total_return)} />
            <MetricCard label="Alpha vs NIFTY"
              value={`${result.alpha >= 0 ? "+" : ""}${formatNumber(result.alpha, 2)}%`}
              colorClass={trendColor(result.alpha)} />
            <MetricCard label="CAGR"
              value={`${formatNumber(result.cagr, 2)}%`}
              colorClass={trendColor(result.cagr)} />
            <MetricCard label="Win Rate"
              value={`${formatNumber(result.win_rate, 1)}%`}
              colorClass={result.win_rate >= 55 ? "text-mint" : "text-amber-300"} />
            <MetricCard label="Sharpe Ratio"
              value={formatNumber(result.sharpe_ratio, 3)}
              colorClass={result.sharpe_ratio >= 1 ? "text-mint" : result.sharpe_ratio >= 0 ? "text-amber-300" : "text-red-300"} />
            <MetricCard label="Max Drawdown"
              value={`${formatNumber(result.max_drawdown, 2)}%`}
              colorClass={Math.abs(result.max_drawdown) > 20 ? "text-red-300" : "text-amber-300"} />
            <MetricCard label="Profit Factor"
              value={result.profit_factor >= 9999 ? "∞" : formatNumber(result.profit_factor, 2)}
              colorClass={result.profit_factor >= 1.5 ? "text-mint" : result.profit_factor >= 1 ? "text-amber-300" : "text-red-300"} />
            <MetricCard label="Total Trades"
              value={String(result.total_trades)}
              sub={`Avg ${formatNumber(result.avg_days_held, 1)} days held`} />
            <MetricCard label="Best Trade"
              value={`+${formatNumber(result.best_trade, 2)}%`}
              colorClass="text-mint" />
            <MetricCard label="Worst Trade"
              value={`${formatNumber(result.worst_trade, 2)}%`}
              colorClass="text-red-300" />
            <MetricCard label="Sortino Ratio"
              value={formatNumber(result.sortino_ratio, 3)}
              colorClass={result.sortino_ratio >= 1 ? "text-mint" : "text-amber-300"} />
            <MetricCard label="NIFTY Benchmark"
              value={formatPercent(result.benchmark_return)} />
          </div>

          {/* Equity curve */}
          <section className="panel p-5">
            <h3 className="mb-4 text-base font-semibold text-white">
              Equity Curve (₹100 normalised start)
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={equityCurveData}>
                  <CartesianGrid stroke="#1e313a" strokeDasharray="3 3" />
                  <XAxis dataKey="day"
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    label={{ value: "Trading Days", position: "insideBottom", offset: -2, fill: "#64748b", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} domain={["auto", "auto"]} />
                  <Tooltip formatter={(v: number) => [`₹${v.toFixed(2)}`, "Portfolio"]}
                    contentStyle={{ background: "#0f1923", border: "1px solid #1e3040", fontSize: 11 }} />
                  <ReferenceLine y={100} stroke="#475569" strokeDasharray="4 4"
                    label={{ value: "Start", fill: "#64748b", fontSize: 10 }} />
                  <Legend />
                  <Line type="monotone" dataKey="strategy" stroke="#38d99a"
                    strokeWidth={2} dot={false} name="Strategy" />
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

          <div className="flex items-start gap-2 rounded-md border border-line bg-panel2 p-3 text-xs text-slate-400">
            <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-400" />
            <p>
              Past performance does not guarantee future results. Backtest uses real historical
              price data with transaction costs and slippage. Signals execute at next-bar open to
              prevent lookahead bias. For educational purposes only.
            </p>
          </div>
        </>
      )}

      {!result && !loadingRun && (
        <div className="panel p-8 text-center">
          <FlaskConical size={32} className="mx-auto mb-3 text-slate-600" />
          <p className="text-sm text-slate-400">
            Configure your strategy above and click <strong className="text-white">Run Backtest</strong> to see performance metrics.
          </p>
          <div className="mt-4 mx-auto max-w-lg flex items-start gap-2 rounded-md border border-line bg-panel2 p-3 text-xs text-slate-500 text-left">
            <Info size={13} className="mt-0.5 shrink-0" />
            <p>Costs and slippage default to 0.05 % each way — typical for Indian equity markets. The price chart with RSI &amp; MACD loads automatically when you pick a stock.</p>
          </div>
        </div>
      )}
    </div>
  );
}
