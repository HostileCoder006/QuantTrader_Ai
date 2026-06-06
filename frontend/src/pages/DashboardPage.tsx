import { Award, Banknote, Briefcase, TrendingUp } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { StatCard } from "../components/StatCard";
import { formatINR, formatPercent } from "../lib/api";
import type { PortfolioSummary } from "../lib/types";

const colors = ["#38d99a", "#43c8f5", "#f7c35f", "#f87171", "#a78bfa", "#fb7185"];

export function DashboardPage({ summary }: { summary: PortfolioSummary }) {
  const allocation = summary.holdings.map((holding) => ({
    name: holding.stock_symbol,
    value: holding.current_value
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-cyan">Portfolio Overview</p>
          <h2 className="mt-1 text-3xl font-semibold text-white">Dashboard</h2>
        </div>
        <p className="max-w-xl text-sm leading-6 text-slate-400">
          Manual NIFTY 50 paper trading with AI news sentiment. No real orders are placed.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
          label="Total Profit/Loss"
          value={formatINR(summary.total_profit_loss)}
          detail={formatPercent(summary.total_return_percent)}
          icon={<TrendingUp size={20} />}
          trend={summary.total_profit_loss >= 0 ? "up" : "down"}
        />
        <StatCard
          label="Top Performing Stock"
          value={summary.top_performing_stock?.stock_symbol ?? "No holdings"}
          detail={
            summary.top_performing_stock
              ? formatPercent(summary.top_performing_stock.return_percent)
              : "Buy a stock to start"
          }
          icon={<Award size={20} />}
          trend={(summary.top_performing_stock?.return_percent ?? 0) >= 0 ? "up" : "down"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Portfolio Allocation</h3>
            <span className="text-sm text-slate-400">{formatINR(summary.invested_value)} invested</span>
          </div>
          <div className="h-80">
            {allocation.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={allocation} dataKey="value" nameKey="name" innerRadius={70} outerRadius={120}>
                    {allocation.map((entry, index) => (
                      <Cell key={entry.name} fill={colors[index % colors.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatINR(value)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center text-sm text-slate-400">
                Portfolio allocation appears after the first paper buy.
              </div>
            )}
          </div>
        </section>

        <section className="panel p-5">
          <h3 className="text-lg font-semibold text-white">Holdings Snapshot</h3>
          <div className="mt-4 space-y-3">
            {summary.holdings.length ? (
              summary.holdings.slice(0, 6).map((holding) => (
                <div key={holding.stock_symbol} className="rounded-md border border-line bg-ink p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-white">{holding.stock_symbol}</span>
                    <span className={holding.profit_loss >= 0 ? "text-mint" : "text-red-300"}>
                      {formatINR(holding.profit_loss)}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-panel2">
                    <div
                      className="h-full rounded-full bg-cyan"
                      style={{ width: `${Math.min(100, holding.allocation_percent)}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400">No holdings yet.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
