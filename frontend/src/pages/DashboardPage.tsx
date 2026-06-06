import {
  Activity,
  Award,
  Banknote,
  Briefcase,
  Loader2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { StatCard } from "../components/StatCard";
import { SignalCard } from "../components/SignalCard";
import { MarketBrief } from "../components/MarketBrief";
import { api, formatINR, formatPercent, trendColor } from "../lib/api";
import type { NiftyIndex, PortfolioSummary, ScannerResult } from "../lib/types";

type DashboardPageProps = {
  summary: PortfolioSummary;
};

function NiftyCard({ nifty }: { nifty: NiftyIndex }) {
  return (
    <section className="panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">NIFTY 50 Index</p>
          <p className="number mt-2 text-3xl font-bold text-white">
            {nifty.value.toLocaleString("en-IN")}
          </p>
          <div className="mt-2 flex items-center gap-2">
            {nifty.change_percent >= 0 ? (
              <TrendingUp size={16} className="text-mint" />
            ) : (
              <TrendingDown size={16} className="text-red-300" />
            )}
            <span className={`number text-sm font-semibold ${trendColor(nifty.change_percent)}`}>
              {nifty.change >= 0 ? "+" : ""}
              {nifty.change.toFixed(2)} ({formatPercent(nifty.change_percent)})
            </span>
          </div>
        </div>
        <div className="rounded-md border border-line bg-panel2 p-2 text-cyan">
          <Activity size={20} />
        </div>
      </div>
      <p className="mt-4 text-xs text-slate-500">
        Prev Close: <span className="number text-slate-400">{nifty.previous_close.toLocaleString("en-IN")}</span>
        &nbsp;·&nbsp;Source: {nifty.source}
      </p>
    </section>
  );
}

export function DashboardPage({ summary }: DashboardPageProps) {
  const [nifty, setNifty] = useState<NiftyIndex | null>(null);
  const [scanner, setScanner] = useState<ScannerResult | null>(null);
  const [scanLoading, setScanLoading] = useState(false);

  const loadNifty = useCallback(async () => {
    try {
      const data = await api.nifty();
      setNifty(data);
    } catch {
      // silent — dashboard still works without index
    }
  }, []);

  const loadScanner = useCallback(async () => {
    setScanLoading(true);
    try {
      const data = await api.scanner();
      setScanner(data);
    } catch {
      // silent
    } finally {
      setScanLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNifty();
    loadScanner();
  }, [loadNifty, loadScanner]);

  const healthColor =
    summary.health_score >= 70 ? "text-mint" : summary.health_score >= 45 ? "text-amber-300" : "text-red-300";

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-cyan">Market Intelligence Platform</p>
          <h2 className="mt-1 text-2xl font-semibold text-white">Dashboard</h2>
        </div>
        <p className="max-w-xl text-sm leading-6 text-slate-400">
          AI-assisted NIFTY 50 quant trading · All signals are deterministic
        </p>
      </div>

      {/* NIFTY Index + Portfolio KPIs */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {nifty ? (
          <div className="md:col-span-2 xl:col-span-1">
            <NiftyCard nifty={nifty} />
          </div>
        ) : null}
        <StatCard
          label="Portfolio Value"
          value={formatINR(summary.portfolio_value)}
          detail={formatPercent(summary.total_return_percent)}
          icon={<Briefcase size={20} />}
          trend={summary.total_return_percent >= 0 ? "up" : "down"}
        />
        <StatCard
          label="Available Cash"
          value={formatINR(summary.available_cash)}
          detail="Ready for paper trades"
          icon={<Banknote size={20} />}
        />
        <StatCard
          label="Total P&L"
          value={formatINR(summary.total_profit_loss)}
          detail={formatPercent(summary.total_return_percent)}
          icon={<TrendingUp size={20} />}
          trend={summary.total_profit_loss >= 0 ? "up" : "down"}
        />
        <StatCard
          label="Portfolio Health"
          value={String(summary.health_score) + "/100"}
          detail={
            summary.health_score >= 70 ? "Strong" : summary.health_score >= 45 ? "Moderate" : "Needs Attention"
          }
          icon={<Award size={20} />}
          trend={summary.health_score >= 70 ? "up" : summary.health_score >= 45 ? "flat" : "down"}
        />
      </div>

      {/* Top Buy Signals + Top Sell Signals */}
      <div className="grid gap-6 xl:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-white">Top Buy Signals</h3>
              <p className="text-xs text-slate-500">Highest quant scores — Strong Buy & Buy</p>
            </div>
            <button
              className="button-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs"
              onClick={loadScanner}
              disabled={scanLoading}
              aria-label="Refresh scanner"
            >
              <RefreshCw size={12} className={scanLoading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
          {scanLoading && !scanner ? (
            <div className="panel p-6 flex items-center justify-center gap-2 text-slate-400 text-sm">
              <Loader2 size={16} className="animate-spin" /> Scanning...
            </div>
          ) : (
            <div className="space-y-2">
              {(scanner?.top_buy ?? []).slice(0, 4).map((sig) => (
                <SignalCard key={sig.symbol} signal={sig} compact />
              ))}
              {!scanner && <div className="panel p-4 text-sm text-slate-400">Run a scan to see signals.</div>}
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-white">Top Sell Signals</h3>
              <p className="text-xs text-slate-500">Weakest quant scores — Sell & Strong Sell</p>
            </div>
          </div>
          <div className="space-y-2">
            {(scanner?.top_sell ?? []).slice(0, 4).map((sig) => (
              <SignalCard key={sig.symbol} signal={sig} compact />
            ))}
            {!scanner && <div className="panel p-4 text-sm text-slate-400">Run a scan to see signals.</div>}
          </div>
        </section>
      </div>

      {/* Holdings Snapshot */}
      {summary.holdings.length > 0 && (
        <section className="panel p-5">
          <h3 className="mb-4 text-base font-semibold text-white">Holdings Snapshot</h3>
          <div className="space-y-3">
            {summary.holdings.slice(0, 5).map((holding) => (
              <div key={holding.stock_symbol} className="flex items-center gap-4">
                <div className="w-24 shrink-0">
                  <p className="font-semibold text-white text-sm">{holding.stock_symbol}</p>
                  <p className="text-xs text-slate-500">{holding.sector ?? ""}</p>
                </div>
                <div className="flex-1">
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span className="number">{holding.allocation_percent.toFixed(1)}%</span>
                    <span className={`number ${trendColor(holding.profit_loss)}`}>
                      {formatINR(holding.profit_loss)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-panel2">
                    <div
                      className="h-full rounded-full bg-cyan"
                      style={{ width: `${Math.min(100, holding.allocation_percent)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          {summary.holdings.length > 5 && (
            <p className="mt-3 text-xs text-slate-500">+{summary.holdings.length - 5} more holdings</p>
          )}
        </section>
      )}

      {/* AI Market Brief */}
      <MarketBrief />
    </div>
  );
}
