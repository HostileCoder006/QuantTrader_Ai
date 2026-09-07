import {
  AlertTriangle,
  Brain,
  ChevronDown,
  ChevronUp,
  History,
  Info,
  Loader2,
  RefreshCw,
  Search,
  Shield,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { useCallback, useState } from "react";
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
import { api, formatINR, formatNumber, formatPercent, signalColor, trendColor } from "../lib/api";
import type {
  AnalystResult,
  CommitteeMode,
  CommitteeStockResult,
  OpportunityCandidate,
  OpportunityCommitteeResult,
  OpportunityHorizon,
  OpportunityScanResult,
  QuickCommitteeResult,
  RiskProfile,
} from "../lib/types";

// ── Config constants ─────────────────────────────────────────────────────────

const HORIZONS: { id: OpportunityHorizon; label: string; desc: string }[] = [
  { id: "1-5d",  label: "1–5 Days",    desc: "Ultra short-term momentum plays" },
  { id: "1-2w",  label: "1–2 Weeks",   desc: "Weekly swing setups" },
  { id: "2-4w",  label: "2–4 Weeks",   desc: "Monthly positional opportunities" },
  { id: "1-3m",  label: "1–3 Months",  desc: "Medium-term trend setups" },
];

const RISK_PROFILES: { id: RiskProfile; label: string; desc: string; color: string }[] = [
  { id: "conservative", label: "Conservative", desc: "Price above EMA50, stable regime", color: "text-mint" },
  { id: "balanced",     label: "Balanced",     desc: "Default — no hard filters",        color: "text-cyan" },
  { id: "aggressive",   label: "Aggressive",   desc: "High momentum + volume plays",     color: "text-amber-300" },
];

const COMMITTEE_MODES: { id: CommitteeMode; label: string; calls: string; desc: string }[] = [
  { id: "quick",    label: "Quick",    calls: "~1 call",  desc: "Top-3 synthesis only" },
  { id: "standard", label: "Standard", calls: "~6 calls", desc: "Full 5 analysts + synthesis for top-5" },
  { id: "deep",     label: "Deep",     calls: "~19 calls",desc: "Analysts + bull/bear debate + synthesis" },
];

const ANALYST_COLORS: Record<string, string> = {
  technical:   "text-cyan",
  fundamental: "text-mint",
  sentiment:   "text-amber-300",
  macro:       "text-purple-300",
  contrarian:  "text-red-300",
};

// ── Small helpers ─────────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 75) return "text-emerald-300";
  if (score >= 60) return "text-mint";
  if (score >= 45) return "text-amber-300";
  return "text-red-300";
}

function scoreBg(score: number) {
  if (score >= 75) return "bg-emerald-950 border-emerald-800";
  if (score >= 60) return "bg-emerald-900/40 border-emerald-700";
  if (score >= 45) return "bg-amber-950/40 border-amber-800";
  return "bg-red-950/40 border-red-800";
}

function recColor(rec: string) {
  if (rec === "BUY")  return "text-mint bg-emerald-900/40 border-emerald-700";
  if (rec === "SELL") return "text-red-300 bg-red-950/40 border-red-800";
  return "text-amber-300 bg-amber-950/30 border-amber-800";
}

function convictionColor(c: string) {
  if (c === "HIGH")   return "text-mint";
  if (c === "MEDIUM") return "text-amber-300";
  return "text-slate-400";
}

function riskLabelColor(r: string) {
  if (r === "Low")    return "text-mint";
  if (r === "Medium") return "text-amber-300";
  return "text-red-300";
}

// ── Regime badge ──────────────────────────────────────────────────────────────

function RegimeBadge({ regime }: { regime: string }) {
  const map: Record<string, string> = {
    BULLISH:        "bg-emerald-950 border-emerald-800 text-emerald-300",
    NEUTRAL:        "bg-amber-950/40 border-amber-800 text-amber-300",
    BEARISH:        "bg-red-950/40 border-red-800 text-red-300",
    HIGH_VOLATILITY:"bg-orange-950/40 border-orange-800 text-orange-300",
    NO_TRADE:       "bg-slate-900 border-slate-600 text-slate-400",
  };
  return (
    <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${map[regime] ?? "border-line bg-panel2 text-slate-400"}`}>
      {regime}
    </span>
  );
}

// ── Factor score bar ──────────────────────────────────────────────────────────

function FactorBar({ label, score }: { label: string; score: number }) {
  const color = score >= 70 ? "bg-mint" : score >= 50 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 shrink-0 text-slate-400 capitalize">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-panel2 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`w-8 text-right font-mono ${scoreColor(score)}`}>{score.toFixed(0)}</span>
    </div>
  );
}

// ── Historical pattern card ───────────────────────────────────────────────────

function PatternCard({ pattern, horizonLabel }: {
  pattern: OpportunityCandidate["pattern"];
  horizonLabel: string;
}) {
  if (!pattern?.data_available) {
    return (
      <div className="rounded-md border border-line bg-ink/40 px-3 py-2 text-xs text-slate-500">
        Historical pattern data unavailable
      </div>
    );
  }
  const s = pattern.primary_stat;
  if (!s?.data_available) {
    return (
      <div className="rounded-md border border-line bg-ink/40 px-3 py-2 text-xs text-slate-500">
        Insufficient history for {horizonLabel} horizon
      </div>
    );
  }
  return (
    <div className="rounded-md border border-line bg-ink/50 p-3 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-300 flex items-center gap-1">
          <History size={11} className="text-cyan" />
          {pattern.similar_setups} similar setups · {pattern.history_years}y history
        </span>
        <span className="text-slate-500">{horizonLabel} outcomes</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-xs text-slate-500">Win Rate</p>
          <p className={`number font-semibold text-sm ${(s.win_rate ?? 0) >= 55 ? "text-mint" : "text-amber-300"}`}>
            {s.win_rate?.toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Avg Return</p>
          <p className={`number font-semibold text-sm ${trendColor(s.avg_return ?? 0)}`}>
            {(s.avg_return ?? 0) >= 0 ? "+" : ""}{s.avg_return?.toFixed(2)}%
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Sample</p>
          <p className="number font-semibold text-sm text-white">{s.sample_size}</p>
        </div>
      </div>
      <div className="flex justify-between text-xs text-slate-500">
        <span>Best: <span className="text-mint">+{s.best_return?.toFixed(1)}%</span></span>
        <span>Worst: <span className="text-red-300">{s.worst_return?.toFixed(1)}%</span></span>
        <span>Std: ±{s.std_return?.toFixed(1)}%</span>
      </div>
    </div>
  );
}

// ── Candidate detail panel ────────────────────────────────────────────────────

function CandidateDetail({
  candidate,
  horizonLabel,
  committeeData,
  onClose,
}: {
  candidate: OpportunityCandidate;
  horizonLabel: string;
  committeeData: CommitteeStockResult | null;
  onClose: () => void;
}) {
  const [analystOpen, setAnalystOpen] = useState<string | null>(null);

  const factorEntries = Object.entries(candidate.factor_scores).filter(([k]) => k !== "sector" || candidate.factor_scores.sector > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-end bg-black/70 backdrop-blur-sm"
      role="dialog" aria-modal="true"
    >
      <div className="h-full w-full max-w-2xl overflow-y-auto border-l border-line bg-panel p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-3xl font-bold ${scoreColor(candidate.opportunity_score)}`}>
                #{candidate.rank}
              </span>
              <h2 className="text-2xl font-bold text-white">{candidate.symbol}</h2>
              <span className={`rounded border px-2.5 py-1 text-xs font-bold ${scoreBg(candidate.opportunity_score)} ${scoreColor(candidate.opportunity_score)}`}>
                {candidate.opportunity_score.toFixed(0)}/100
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-400">{candidate.name} · {candidate.sector}</p>
            <p className="mt-0.5 text-xs text-slate-500">{horizonLabel} horizon</p>
          </div>
          <button className="rounded-md p-2 text-slate-400 hover:text-white transition" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Price + targets */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Current Price", value: formatINR(candidate.current_price), cls: "text-white" },
            { label: "Entry",         value: formatINR(candidate.entry),         cls: "text-white" },
            { label: "Target",        value: formatINR(candidate.target),        cls: "text-mint" },
            { label: "Stop Loss",     value: formatINR(candidate.stop_loss),     cls: "text-red-300" },
          ].map(({ label, value, cls }) => (
            <div key={label} className="rounded-md border border-line bg-ink p-3">
              <p className="text-xs text-slate-500">{label}</p>
              <p className={`number mt-1 font-semibold ${cls}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Return range + confidence + risk */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-md border border-line bg-ink p-3">
            <p className="text-xs text-slate-500">Est. Return Range</p>
            <p className="number mt-1 font-semibold text-white text-sm">
              {candidate.estimated_return_lo >= 0 ? "+" : ""}{candidate.estimated_return_lo.toFixed(1)}%
              {" to "}
              {candidate.estimated_return_hi >= 0 ? "+" : ""}{candidate.estimated_return_hi.toFixed(1)}%
            </p>
            <p className="text-xs text-slate-600 mt-0.5">Estimate, not guaranteed</p>
          </div>
          <div className="rounded-md border border-line bg-ink p-3">
            <p className="text-xs text-slate-500">Confidence</p>
            <p className={`number mt-1 font-semibold text-sm ${scoreColor(candidate.confidence)}`}>{candidate.confidence}%</p>
            <p className="text-xs text-slate-600 mt-0.5">Quant + pattern</p>
          </div>
          <div className="rounded-md border border-line bg-ink p-3">
            <p className="text-xs text-slate-500">Risk</p>
            <p className={`mt-1 font-semibold text-sm ${riskLabelColor(candidate.risk_label)}`}>{candidate.risk_label}</p>
            <p className="text-xs text-slate-600 mt-0.5">ATR: {candidate.atr_pct?.toFixed(1)}%</p>
          </div>
        </div>

        {/* Indicators grid */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Technical Indicators</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {[
              { label: "RSI", value: candidate.rsi?.toFixed(1),
                cls: candidate.rsi > 70 ? "text-red-300" : candidate.rsi < 30 ? "text-amber-300" : "text-white" },
              { label: "MACD", value: candidate.macd?.crossover,
                cls: candidate.macd?.crossover === "bullish" ? "text-mint" : candidate.macd?.crossover === "bearish" ? "text-red-300" : "text-slate-300" },
              { label: "EMA20", value: formatINR(candidate.ema20), cls: "text-white" },
              { label: "EMA50", value: formatINR(candidate.ema50), cls: "text-white" },
              { label: "Vol Δ", value: formatPercent(candidate.volume_change ?? 0),
                cls: (candidate.volume_change ?? 0) >= 20 ? "text-mint" : "text-slate-300" },
              { label: "Momentum", value: formatPercent(candidate.daily_momentum ?? 0),
                cls: trendColor(candidate.daily_momentum ?? 0) },
              { label: "VWAP", value: formatINR(candidate.vwap), cls: "text-white" },
              { label: "RR Ratio", value: `${candidate.risk_reward}:1`, cls: "text-cyan" },
            ].map(({ label, value, cls }) => (
              <div key={label} className="rounded-md border border-line bg-ink/60 p-2">
                <p className="text-slate-500">{label}</p>
                <p className={`number mt-0.5 font-semibold capitalize ${cls}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Factor scores */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Factor Scores</p>
          <div className="space-y-1.5">
            {factorEntries.map(([k, v]) => (
              <FactorBar key={k} label={k.replace("_", " ")} score={v} />
            ))}
          </div>
        </div>

        {/* Historical patterns */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Historical Similar Setups
          </p>
          <PatternCard pattern={candidate.pattern} horizonLabel={horizonLabel} />
          <p className="mt-1.5 text-xs text-slate-600">
            Past evidence only — not a guarantee of future returns.
          </p>
        </div>

        {/* Committee analysis */}
        {committeeData && (
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Users size={12} /> AI Investment Committee
            </p>

            {/* Synthesis */}
            <div className="rounded-md border border-line bg-ink/60 p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded border px-2.5 py-1 text-sm font-bold ${recColor(committeeData.synthesis.final_recommendation)}`}>
                  {committeeData.synthesis.final_recommendation}
                </span>
                <span className={`text-sm font-semibold ${convictionColor(committeeData.synthesis.conviction)}`}>
                  {committeeData.synthesis.conviction} conviction
                </span>
                <span className={`number text-sm ${scoreColor(committeeData.synthesis.consensus_score)}`}>
                  Consensus: {committeeData.synthesis.consensus_score}/100
                </span>
                <span className="ml-auto text-xs text-slate-600 flex items-center gap-1.5">
                  <span className="flex gap-1">
                    <span className="text-mint">{committeeData.vote_summary.buy}B</span>
                    <span className="text-amber-300">{committeeData.vote_summary.hold}H</span>
                    <span className="text-red-300">{committeeData.vote_summary.sell}S</span>
                  </span>
                </span>
              </div>
              <p className="text-sm text-slate-300 leading-6">{committeeData.synthesis.thesis}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold text-mint mb-1">Strongest Bull Case</p>
                  <p className="text-xs text-slate-400 leading-5">{committeeData.synthesis.strongest_bull}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-red-300 mb-1">Strongest Bear Case</p>
                  <p className="text-xs text-slate-400 leading-5">{committeeData.synthesis.strongest_bear}</p>
                </div>
              </div>
              {committeeData.synthesis.key_risks?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-amber-300 mb-1">Key Risks</p>
                  <ul className="space-y-0.5">
                    {committeeData.synthesis.key_risks.map((r, i) => (
                      <li key={i} className="flex gap-1.5 text-xs text-slate-400">
                        <span className="text-amber-400 mt-0.5">•</span>{r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {committeeData.synthesis.conditions_to_watch?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-cyan mb-1">Conditions to Watch</p>
                  <ul className="space-y-0.5">
                    {committeeData.synthesis.conditions_to_watch.map((c, i) => (
                      <li key={i} className="flex gap-1.5 text-xs text-slate-400">
                        <span className="text-cyan mt-0.5">→</span>{c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-xs text-slate-600 italic">{committeeData.synthesis.disclaimer}</p>
              <p className="text-right text-xs text-slate-700">Model: {committeeData.synthesis.model}</p>
            </div>

            {/* Bull/Bear debate */}
            {committeeData.debate && (
              <div className="rounded-md border border-line bg-ink/40 p-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Bull vs Bear Debate</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded border border-emerald-900 bg-emerald-950/20 p-3">
                    <p className="text-xs font-semibold text-mint mb-1">🐂 Bull Case</p>
                    <p className="text-xs text-slate-300 leading-5">{committeeData.debate.bull_case}</p>
                    <p className="mt-2 text-xs font-semibold text-mint/70">Rebuttal:</p>
                    <p className="text-xs text-slate-400 leading-5">{committeeData.debate.bull_rebuttal}</p>
                  </div>
                  <div className="rounded border border-red-900 bg-red-950/20 p-3">
                    <p className="text-xs font-semibold text-red-300 mb-1">🐻 Bear Case</p>
                    <p className="text-xs text-slate-300 leading-5">{committeeData.debate.bear_case}</p>
                    <p className="mt-2 text-xs font-semibold text-red-300/70">Rebuttal:</p>
                    <p className="text-xs text-slate-400 leading-5">{committeeData.debate.bear_rebuttal}</p>
                  </div>
                </div>
                <div className="rounded border border-amber-900/50 bg-amber-950/20 p-2">
                  <span className="text-xs font-semibold text-amber-300">Key Tension: </span>
                  <span className="text-xs text-slate-300">{committeeData.debate.key_tension}</span>
                </div>
              </div>
            )}

            {/* Individual analyst views — collapsible */}
            {committeeData.analyst_results?.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Individual Analyst Views</p>
                <div className="space-y-2">
                  {committeeData.analyst_results.map((a) => (
                    <div key={a.analyst} className="rounded-md border border-line bg-ink/40">
                      <button
                        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
                        onClick={() => setAnalystOpen(analystOpen === a.analyst ? null : a.analyst)}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold ${ANALYST_COLORS[a.analyst] ?? "text-slate-300"}`}>
                            {a.role}
                          </span>
                          <span className={`rounded border px-1.5 py-0.5 text-xs font-semibold ${recColor(a.recommendation)}`}>
                            {a.recommendation}
                          </span>
                          <span className={`text-xs ${scoreColor(a.confidence)}`}>{a.confidence}%</span>
                        </div>
                        {analystOpen === a.analyst
                          ? <ChevronUp size={14} className="text-slate-500" />
                          : <ChevronDown size={14} className="text-slate-500" />}
                      </button>
                      {analystOpen === a.analyst && (
                        <div className="border-t border-line px-3 pb-3 pt-2 space-y-2">
                          <p className="text-xs text-slate-300 leading-5">{a.thesis}</p>
                          {a.evidence?.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-mint mb-1">Evidence</p>
                              <ul className="space-y-0.5">
                                {a.evidence.map((e, i) => (
                                  <li key={i} className="flex gap-1.5 text-xs text-slate-400">
                                    <span className="text-mint mt-0.5">•</span>{e}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {a.risks?.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-red-300 mb-1">Risks</p>
                              <ul className="space-y-0.5">
                                {a.risks.map((r, i) => (
                                  <li key={i} className="flex gap-1.5 text-xs text-slate-400">
                                    <span className="text-red-400 mt-0.5">•</span>{r}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {a.invalidation && (
                            <p className="text-xs text-slate-500 italic">Invalidation: {a.invalidation}</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex items-start gap-2 rounded-md border border-line bg-panel2 p-3 text-xs text-slate-500">
          <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-400" />
          These are quantitative estimates for educational paper trading only.
          Historical statistics are evidence from the past — not guaranteed future returns.
          Always use stop-losses and manage position size.
        </div>
      </div>
    </div>
  );
}

// ── Candidate card (grid item) ────────────────────────────────────────────────

function CandidateCard({
  candidate,
  horizonLabel,
  onSelect,
  hasCommittee,
}: {
  candidate: OpportunityCandidate;
  horizonLabel: string;
  onSelect: (c: OpportunityCandidate) => void;
  hasCommittee: boolean;
}) {
  const ps = candidate.pattern?.primary_stat;

  return (
    <button
      className="panel p-4 text-left w-full transition hover:border-cyan/50 focus:outline-none focus:ring-1 focus:ring-cyan/50 rounded-lg"
      onClick={() => onSelect(candidate)}
      aria-label={`View details for ${candidate.symbol}`}
    >
      {/* Rank + symbol + score */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-lg font-bold ${scoreColor(candidate.opportunity_score)}`}>
            #{candidate.rank}
          </span>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-white">{candidate.symbol}</span>
              {hasCommittee && <Brain size={11} className="text-cyan" aria-label="Committee analysed" />}
            </div>
            <p className="text-xs text-slate-500 truncate max-w-[120px]">{candidate.name}</p>
          </div>
        </div>
        <div className={`rounded border px-2 py-1 text-center ${scoreBg(candidate.opportunity_score)}`}>
          <p className={`number text-lg font-bold leading-none ${scoreColor(candidate.opportunity_score)}`}>
            {candidate.opportunity_score.toFixed(0)}
          </p>
          <p className="text-xs text-slate-500 leading-none mt-0.5">score</p>
        </div>
      </div>

      {/* Return range estimate */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500">Est. return</span>
        <span className={`number text-xs font-semibold ${candidate.estimated_return_hi > 0 ? "text-mint" : "text-red-300"}`}>
          {candidate.estimated_return_lo >= 0 ? "+" : ""}{candidate.estimated_return_lo.toFixed(1)}%
          {" to "}
          {candidate.estimated_return_hi >= 0 ? "+" : ""}{candidate.estimated_return_hi.toFixed(1)}%
        </span>
      </div>

      {/* Key indicators */}
      <div className="grid grid-cols-3 gap-1.5 text-xs mb-3">
        <div>
          <p className="text-slate-500">RSI</p>
          <p className={`number font-semibold ${candidate.rsi > 70 ? "text-red-300" : candidate.rsi < 30 ? "text-amber-300" : "text-white"}`}>
            {candidate.rsi?.toFixed(1)}
          </p>
        </div>
        <div>
          <p className="text-slate-500">MACD</p>
          <p className={`text-xs font-medium capitalize ${candidate.macd?.crossover === "bullish" ? "text-mint" : candidate.macd?.crossover === "bearish" ? "text-red-300" : "text-slate-400"}`}>
            {candidate.macd?.crossover}
          </p>
        </div>
        <div>
          <p className="text-slate-500">Vol Δ</p>
          <p className={`number font-semibold ${(candidate.volume_change ?? 0) >= 0 ? "text-mint" : "text-red-300"}`}>
            {(candidate.volume_change ?? 0) >= 0 ? "+" : ""}{(candidate.volume_change ?? 0).toFixed(0)}%
          </p>
        </div>
      </div>

      {/* Historical win rate if available */}
      {ps?.data_available && (
        <div className="flex items-center justify-between text-xs border-t border-line pt-2">
          <span className="flex items-center gap-1 text-slate-500">
            <History size={10} /> {candidate.pattern?.similar_setups} setups
          </span>
          <span className={`font-semibold ${(ps.win_rate ?? 0) >= 55 ? "text-mint" : "text-amber-300"}`}>
            {ps.win_rate?.toFixed(0)}% win
          </span>
          <span className={`font-semibold ${trendColor(ps.avg_return ?? 0)}`}>
            {(ps.avg_return ?? 0) >= 0 ? "+" : ""}{ps.avg_return?.toFixed(1)}% avg
          </span>
        </div>
      )}

      {/* Risk + confidence */}
      <div className="flex items-center justify-between text-xs mt-2">
        <span className={`font-medium ${riskLabelColor(candidate.risk_label)}`}>
          {candidate.risk_label} risk
        </span>
        <span className={`font-medium ${scoreColor(candidate.confidence)}`}>
          {candidate.confidence}% conf
        </span>
        <span className="text-slate-500">{candidate.sector}</span>
      </div>
    </button>
  );
}

// ── Sector strength chart ─────────────────────────────────────────────────────

function SectorChart({ strength }: { strength: Record<string, number> }) {
  const data = Object.entries(strength)
    .sort(([, a], [, b]) => b - a)
    .map(([sector, score]) => ({ sector: sector.slice(0, 10), score }));

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 4, right: 20, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#263941" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 10 }} />
          <YAxis type="category" dataKey="sector" tick={{ fill: "#94a3b8", fontSize: 10 }} width={65} />
          <Tooltip
            formatter={(v: number) => [`${v.toFixed(1)}`, "Avg Score"]}
            contentStyle={{ background: "#0f1923", border: "1px solid #263941", fontSize: 11 }}
          />
          <Bar dataKey="score" radius={[0, 3, 3, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.score >= 65 ? "#38d99a" : entry.score >= 50 ? "#f7c35f" : "#f87171"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Quick committee results banner ────────────────────────────────────────────

function QuickCommitteeBanner({ result }: { result: QuickCommitteeResult }) {
  return (
    <div className="panel p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Zap size={14} className="text-amber-300" />
        <span className="text-sm font-semibold text-white">Quick Committee Analysis</span>
        <span className="text-xs text-slate-500">· {result.market_comment}</span>
      </div>
      <div className="flex flex-wrap gap-3">
        {result.rankings?.map((r) => (
          <div key={r.symbol} className="flex items-center gap-2 rounded-md border border-line bg-ink px-3 py-2">
            <span className="font-bold text-slate-300">#{r.rank}</span>
            <span className="font-bold text-white">{r.symbol}</span>
            <span className={`rounded border px-2 py-0.5 text-xs font-bold ${recColor(r.recommendation)}`}>
              {r.recommendation}
            </span>
            <span className={`text-xs ${scoreColor(r.confidence)}`}>{r.confidence}%</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-600 italic">{result.disclaimer}</p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function OpportunityScannerPage() {
  const [horizon,      setHorizon]      = useState<OpportunityHorizon>("2-4w");
  const [riskProfile,  setRiskProfile]  = useState<RiskProfile>("balanced");
  const [includePattern, setIncludePattern] = useState(true);
  const [committeeMode, setCommitteeMode]   = useState<CommitteeMode>("standard");

  const [scanResult,      setScanResult]      = useState<OpportunityScanResult | null>(null);
  const [committeeResult, setCommitteeResult] = useState<OpportunityCommitteeResult | null>(null);
  const [selected,        setSelected]        = useState<OpportunityCandidate | null>(null);

  const [scanLoading,      setScanLoading]      = useState(false);
  const [committeeLoading, setCommitteeLoading] = useState(false);
  const [scanError,        setScanError]        = useState("");
  const [committeeError,   setCommitteeError]   = useState("");

  const horizonLabel = HORIZONS.find(h => h.id === horizon)?.label ?? horizon;

  // ── Scan ──────────────────────────────────────────────────────────────────
  const runScan = useCallback(async () => {
    setScanLoading(true);
    setScanError("");
    setCommitteeResult(null);
    try {
      const result = await api.opportunityScan({ horizon, risk_profile: riskProfile, include_pattern: includePattern });
      setScanResult(result);
    } catch (e) {
      setScanError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanLoading(false);
    }
  }, [horizon, riskProfile, includePattern]);

  // ── Committee ─────────────────────────────────────────────────────────────
  const runCommittee = useCallback(async () => {
    if (!scanResult) return;
    setCommitteeLoading(true);
    setCommitteeError("");
    try {
      const result = await api.opportunityCommittee({ scan_result: scanResult, mode: committeeMode });
      setCommitteeResult(result);

      // Save top recommendations for self-evaluation
      const committeeSrc = Array.isArray(result.committee) ? result.committee : [];
      for (const item of committeeSrc.slice(0, 5) as CommitteeStockResult[]) {
        const cand = scanResult.candidates.find(c => c.symbol === item.symbol);
        if (!cand) continue;
        try {
          await api.opportunitySaveRec({
            scan_id:             scanResult.scan_id,
            symbol:              item.symbol,
            rank:                item.rank,
            horizon:             scanResult.horizon,
            risk_profile:        scanResult.risk_profile,
            opportunity_score:   item.opportunity_score,
            committee_rec:       item.synthesis?.final_recommendation,
            committee_conviction: item.synthesis?.conviction,
            predicted_lo:        cand.estimated_return_lo,
            predicted_hi:        cand.estimated_return_hi,
            price_at_rec:        cand.current_price,
            regime:              scanResult.regime.regime,
          });
        } catch { /* non-blocking */ }
      }
    } catch (e) {
      setCommitteeError(e instanceof Error ? e.message : "Committee failed");
    } finally {
      setCommitteeLoading(false);
    }
  }, [scanResult, committeeMode]);

  // ── Committee lookup for a given symbol ──────────────────────────────────
  const getCommitteeForSymbol = (symbol: string): CommitteeStockResult | null => {
    if (!committeeResult) return null;
    const c = committeeResult.committee;
    if (!Array.isArray(c)) return null;
    return (c as CommitteeStockResult[]).find(r => r.symbol === symbol) ?? null;
  };

  const isQuickResult = committeeResult && !Array.isArray(committeeResult.committee);
  const committeeList  = committeeResult && Array.isArray(committeeResult.committee)
    ? (committeeResult.committee as CommitteeStockResult[])
    : [];

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div>
        <p className="text-sm font-medium text-cyan">AI-Powered Quant Research</p>
        <h2 className="mt-1 text-2xl font-semibold text-white">Short-Term Opportunity Scanner</h2>
        <p className="mt-1 text-sm text-slate-400">
          Quant screening → Historical pattern analysis → AI Investment Committee
        </p>
      </div>

      {/* ── Config panel ── */}
      <section className="panel p-5 space-y-5">
        <h3 className="text-base font-semibold text-white">Scan Configuration</h3>

        {/* Horizon */}
        <div>
          <p className="mb-2 text-sm text-slate-400">Investment Horizon</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {HORIZONS.map(h => (
              <button
                key={h.id}
                onClick={() => setHorizon(h.id)}
                className={`rounded-md border px-3 py-2.5 text-left transition ${
                  horizon === h.id
                    ? "border-cyan bg-cyan/10 text-white"
                    : "border-line bg-panel2 text-slate-400 hover:border-cyan/50 hover:text-white"
                }`}
              >
                <p className="text-sm font-semibold">{h.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{h.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Risk profile */}
        <div>
          <p className="mb-2 text-sm text-slate-400">Risk Profile</p>
          <div className="grid grid-cols-3 gap-2">
            {RISK_PROFILES.map(rp => (
              <button
                key={rp.id}
                onClick={() => setRiskProfile(rp.id)}
                className={`rounded-md border px-3 py-2.5 text-left transition ${
                  riskProfile === rp.id
                    ? "border-cyan bg-cyan/10 text-white"
                    : "border-line bg-panel2 text-slate-400 hover:border-cyan/50 hover:text-white"
                }`}
              >
                <p className={`text-sm font-semibold ${rp.color}`}>{rp.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{rp.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Options row */}
        <div className="flex flex-wrap items-center gap-4 border-t border-line pt-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includePattern}
              onChange={e => setIncludePattern(e.target.checked)}
              className="h-4 w-4 rounded border-line bg-ink accent-mint"
            />
            <span className="text-sm text-slate-300">Include historical pattern analysis</span>
            <span className="text-xs text-slate-500">(adds ~15s)</span>
          </label>
          <button
            className="button-primary flex items-center gap-2 ml-auto"
            onClick={runScan}
            disabled={scanLoading}
          >
            {scanLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            {scanLoading ? "Scanning…" : "Find Opportunities"}
          </button>
        </div>
      </section>

      {scanError && <div className="panel p-4 text-sm text-red-300">{scanError}</div>}

      {/* ── Loading state ── */}
      {scanLoading && (
        <div className="panel p-10 flex flex-col items-center gap-4 text-slate-400">
          <Loader2 size={36} className="animate-spin text-cyan" />
          <div className="text-center">
            <p className="text-sm font-medium text-white">Scanning NIFTY 50…</p>
            <p className="text-xs mt-1">Computing RSI · MACD · EMA · ATR · Volume · Sector Strength</p>
            {includePattern && <p className="text-xs mt-0.5">+ Historical pattern analysis for top candidates</p>}
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {scanResult && !scanLoading && (
        <>
          {/* Regime + stats bar */}
          <div className="flex flex-wrap items-center gap-4 panel p-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Regime:</span>
              <RegimeBadge regime={scanResult.regime.regime} />
              {scanResult.regime.rsi != null && (
                <span className="text-slate-500 text-xs">NIFTY RSI {scanResult.regime.rsi.toFixed(1)}</span>
              )}
            </div>
            <div className="flex items-center gap-1 text-slate-400">
              <TrendingUp size={13} />
              <span className="text-slate-300 font-semibold">{scanResult.candidates.length}</span>
              <span>candidates from {scanResult.total_scanned} scanned</span>
            </div>
            <span className="text-xs text-slate-500 ml-auto">
              {new Date(scanResult.scanned_at).toLocaleTimeString()}
            </span>
          </div>

          {/* Quick committee results if in quick mode */}
          {isQuickResult && (
            <QuickCommitteeBanner result={committeeResult!.committee as QuickCommitteeResult} />
          )}

          {/* 2-column layout: candidates + sector chart */}
          <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
            {/* Candidates grid */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Trophy size={16} className="text-amber-300" />
                  Ranked Opportunities — {horizonLabel}
                </h3>
                <button
                  className="button-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
                  onClick={runScan}
                  disabled={scanLoading}
                >
                  <RefreshCw size={12} className={scanLoading ? "animate-spin" : ""} />
                  Rescan
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {scanResult.candidates.map(c => (
                  <CandidateCard
                    key={c.symbol}
                    candidate={c}
                    horizonLabel={horizonLabel}
                    onSelect={setSelected}
                    hasCommittee={!!getCommitteeForSymbol(c.symbol)}
                  />
                ))}
              </div>
            </div>

            {/* Right sidebar */}
            <div className="space-y-5">
              {/* Sector strength */}
              {Object.keys(scanResult.sector_strength).length > 0 && (
                <section className="panel p-4">
                  <h3 className="text-sm font-semibold text-white mb-3">Sector Strength</h3>
                  <SectorChart strength={scanResult.sector_strength} />
                  <p className="text-xs text-slate-600 mt-2">Average opportunity score per sector</p>
                </section>
              )}

              {/* AI Committee config */}
              <section className="panel p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Brain size={14} className="text-cyan" />
                  <h3 className="text-sm font-semibold text-white">AI Investment Committee</h3>
                </div>
                <p className="text-xs text-slate-400">
                  5 specialist analysts debate the top candidates: Technical, Fundamental, Sentiment, Macro, Contrarian.
                </p>

                <div className="space-y-1.5">
                  {COMMITTEE_MODES.map(m => (
                    <button
                      key={m.id}
                      onClick={() => setCommitteeMode(m.id)}
                      className={`w-full flex items-center justify-between rounded-md border px-3 py-2 text-left transition ${
                        committeeMode === m.id
                          ? "border-cyan bg-cyan/10 text-white"
                          : "border-line bg-panel2 text-slate-400 hover:border-cyan/30"
                      }`}
                    >
                      <div>
                        <p className="text-xs font-semibold">{m.label}</p>
                        <p className="text-xs text-slate-500">{m.desc}</p>
                      </div>
                      <span className="text-xs text-slate-500 shrink-0">{m.calls}</span>
                    </button>
                  ))}
                </div>

                {committeeError && <p className="text-xs text-red-300">{committeeError}</p>}

                <button
                  className="button-primary w-full flex items-center justify-center gap-2"
                  onClick={runCommittee}
                  disabled={committeeLoading}
                >
                  {committeeLoading
                    ? <Loader2 size={15} className="animate-spin" />
                    : <Users size={15} />}
                  {committeeLoading ? "Analysing…" : "Run Committee"}
                </button>

                <div className="flex items-start gap-1.5 text-xs text-slate-500">
                  <Info size={11} className="mt-0.5 shrink-0" />
                  Uses DeepSeek V3.2. Results cached per scan.
                </div>
              </section>

              {/* Message */}
              <div className="panel p-3">
                <p className="text-xs text-slate-500">{scanResult.message}</p>
              </div>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="flex items-start gap-2 panel p-3 text-xs text-slate-500">
            <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-400" />
            <span>
              Opportunity scores, return estimates and committee views are for educational paper trading only.
              Historical statistics represent past evidence — not guaranteed future returns.
              Always use stop-losses and manage risk appropriately.
            </span>
          </div>
        </>
      )}

      {/* ── Empty state ── */}
      {!scanResult && !scanLoading && (
        <div className="panel p-12 text-center space-y-3">
          <Search size={40} className="mx-auto text-slate-600" />
          <p className="text-white font-semibold">Ready to scan</p>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Select your horizon and risk profile, then click{" "}
            <strong className="text-white">Find Opportunities</strong> to rank the
            NIFTY 50 with quant scoring, historical pattern analysis, and AI committee review.
          </p>
        </div>
      )}

      {/* ── Detail panel (slide-over) ── */}
      {selected && (
        <CandidateDetail
          candidate={selected}
          horizonLabel={horizonLabel}
          committeeData={getCommitteeForSymbol(selected.symbol)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
