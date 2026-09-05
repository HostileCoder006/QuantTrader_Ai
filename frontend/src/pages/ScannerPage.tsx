import {
  ArrowDownRight,
  ArrowUpRight,
  Brain,
  History,
  Loader2,
  RefreshCw,
  Scan,
  TrendingUp,
  Volume2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, signalColor } from "../lib/api";
import type { MarketRegime, ScannerResultWithRegime, Signal, EnrichedSignalWithExplanation } from "../lib/types";
import { SignalCard } from "../components/SignalCard";
import { RegimeBar } from "../components/RegimeBar";
import { PatternSearchPanel } from "../components/PatternSearchPanel";

type Tab = "buy" | "sell" | "momentum" | "volume" | "all";

const tabs: { id: Tab; label: string; icon: typeof Scan }[] = [
  { id: "buy", label: "Top Buy", icon: ArrowUpRight },
  { id: "sell", label: "Top Sell", icon: ArrowDownRight },
  { id: "momentum", label: "Momentum", icon: TrendingUp },
  { id: "volume", label: "Volume Movers", icon: Volume2 },
  { id: "all", label: "All Signals", icon: Scan },
];

function AIAnalysisDrawer({
  signal,
  onClose,
}: {
  signal: Signal;
  onClose: () => void;
}) {
  const [data, setData] = useState<EnrichedSignalWithExplanation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"ai" | "pattern">("ai");

  useEffect(() => {
    setLoading(true);
    setError("");
    api
      .signalExplain(signal.symbol)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Analysis failed"))
      .finally(() => setLoading(false));
  }, [signal.symbol]);

  const exp = data?.ai_explanation;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/60 backdrop-blur-sm sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label="AI Signal Analysis">
      <div className="h-full w-full max-h-[90vh] max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-panel p-5 sm:rounded-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Brain size={18} className="text-cyan" />
            <h3 className="font-semibold text-white">AI Trade Analysis</h3>
          </div>
          <button className="rounded-md p-1 text-slate-400 hover:text-white" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <SignalCard signal={signal} />

        {/* Regime context pill */}
        {(signal as any).regime_context && (
          <div className={`mt-3 rounded-md border px-3 py-2 text-xs flex items-center justify-between ${
            (signal as any).regime_context.regime === "BULLISH"
              ? "border-emerald-800 bg-emerald-950/40 text-emerald-300"
              : (signal as any).regime_context.regime === "BEARISH"
              ? "border-red-800 bg-red-950/40 text-red-300"
              : "border-amber-800 bg-amber-950/30 text-amber-300"
          }`}>
            <span>Regime: <strong>{(signal as any).regime_context.regime}</strong></span>
            <span>Score adj: {(signal as any).regime_context.score_adjustment >= 0 ? "+" : ""}{(signal as any).regime_context.score_adjustment} pts</span>
          </div>
        )}

        {/* Tab switcher */}
        <div className="mt-4 flex gap-1 rounded-lg bg-panel2 p-1 border border-line">
          <button
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-medium transition ${activeTab === "ai" ? "bg-mint text-ink" : "text-slate-400 hover:text-white"}`}
            onClick={() => setActiveTab("ai")}
          >
            <Brain size={13} /> AI Analysis
          </button>
          <button
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-medium transition ${activeTab === "pattern" ? "bg-cyan text-ink" : "text-slate-400 hover:text-white"}`}
            onClick={() => setActiveTab("pattern")}
          >
            <History size={13} /> Pattern History
          </button>
        </div>

        <div className="mt-4">
          {activeTab === "ai" && (
            <>
              {loading && (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Loader2 size={16} className="animate-spin" />
                  DeepSeek is analysing the signal…
                </div>
              )}
              {error && <p className="text-sm text-red-300">{error}</p>}
              {exp && (
                <div className="space-y-4 rounded-md border border-line bg-ink/60 p-4">
                  {[
                    { label: "Recommendation", key: "recommendation_summary" as const },
                    { label: "Supporting Evidence", key: "supporting_evidence" as const },
                    { label: "Contradictions", key: "contradictions" as const },
                    { label: "Regime Context", key: "regime_context" as const },
                    { label: "Pattern Context", key: "pattern_context" as const },
                    { label: "Trade Rationale", key: "trade_rationale" as const },
                    { label: "Risk Assessment", key: "risk_assessment" as const },
                  ].map(({ label, key }) => (
                    exp[key] ? (
                      <div key={key}>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-cyan">{label}</p>
                        <p className="text-sm leading-6 text-slate-300">{exp[key]}</p>
                      </div>
                    ) : null
                  ))}
                  <p className="text-right text-xs text-slate-600">Model: {exp.model}</p>
                </div>
              )}
            </>
          )}

          {activeTab === "pattern" && (
            <PatternSearchPanel symbol={signal.symbol} />
          )}
        </div>
      </div>
    </div>
  );
}

export function ScannerPage() {
  const [scanResult, setScanResult] = useState<ScannerResultWithRegime | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("buy");
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
  const lastScan = useRef<number>(0);

  const runScan = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.scanner();
      setScanResult(data);
      lastScan.current = Date.now();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    runScan();
  }, [runScan]);

  const getSignals = (): Signal[] => {
    if (!scanResult) return [];
    const map: Record<Tab, Signal[]> = {
      buy: scanResult.top_buy,
      sell: scanResult.top_sell,
      momentum: scanResult.top_momentum,
      volume: scanResult.top_volume,
      all: scanResult.all_signals,
    };
    return map[activeTab];
  };

  const signals = getSignals();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan">Quant Engine</p>
          <h2 className="mt-1 text-2xl font-semibold text-white">NIFTY 50 Market Scanner</h2>
          <p className="mt-1 text-sm text-slate-400">
            Deterministic signals from RSI · MACD · VWAP · EMA · ATR · Volume
          </p>
        </div>
        <div className="flex items-center gap-3">
          {scanResult && (
            <p className="text-xs text-slate-500">
              {scanResult.total_scanned} stocks scanned
            </p>
          )}
          <button
            className="button-primary flex items-center gap-2"
            onClick={runScan}
            disabled={loading}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {loading ? "Scanning..." : "Scan Now"}
          </button>
        </div>
      </div>

      {error && <div className="panel p-4 text-sm text-red-300">{error}</div>}

      {/* Regime Bar */}
      <RegimeBar regime={scanResult?.regime ?? null} loading={loading && !scanResult} />

      {/* Score legend */}
      <div className="flex flex-wrap gap-2 text-xs">
        {[
          { label: "Strong Buy", range: "80-100", cls: "text-emerald-300 bg-emerald-950 border-emerald-800" },
          { label: "Buy", range: "60-79", cls: "text-mint bg-emerald-900/50 border-emerald-700" },
          { label: "Hold", range: "40-59", cls: "text-amber-300 bg-amber-950/50 border-amber-800" },
          { label: "Sell", range: "20-39", cls: "text-red-300 bg-red-950/50 border-red-800" },
          { label: "Strong Sell", range: "0-19", cls: "text-red-400 bg-red-950 border-red-700" },
        ].map(({ label, range, cls }) => (
          <span key={label} className={`rounded-md border px-2.5 py-1 font-semibold ${cls}`}>
            {label} ({range})
          </span>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto gap-1 rounded-lg bg-panel2 p-1 border border-line">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition ${
                active ? "bg-mint text-ink" : "text-slate-300 hover:bg-panel hover:text-white"
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Signal grid */}
      {loading && !scanResult ? (
        <div className="panel p-8 flex flex-col items-center gap-3 text-slate-400">
          <Loader2 size={32} className="animate-spin text-cyan" />
          <p className="text-sm">Running quantitative scan across all 50 NIFTY stocks...</p>
          <p className="text-xs">Calculating RSI, MACD, VWAP, EMA, ATR for each stock</p>
        </div>
      ) : signals.length === 0 ? (
        <div className="panel p-8 text-center text-sm text-slate-400">
          {loading ? "Updating scan..." : "No signals in this category."}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {signals.map((sig) => (
            <SignalCard
              key={sig.symbol}
              signal={sig}
              compact
              onViewDetails={setSelectedSignal}
            />
          ))}
        </div>
      )}

      {/* AI Analysis Drawer */}
      {selectedSignal && (
        <AIAnalysisDrawer signal={selectedSignal} onClose={() => setSelectedSignal(null)} />
      )}
    </div>
  );
}
