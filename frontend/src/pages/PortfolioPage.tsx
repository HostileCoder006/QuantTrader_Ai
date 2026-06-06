import { useCallback } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { PortfolioIntelligence } from "../components/PortfolioIntelligence";
import { RiskPanel } from "../components/RiskPanel";
import { api, formatINR, formatPercent, trendColor } from "../lib/api";
import type { PortfolioSummary } from "../lib/types";

const colors = ["#38d99a", "#43c8f5", "#f7c35f", "#f87171", "#a78bfa", "#fb7185"];

export function PortfolioPage({ summary }: { summary: PortfolioSummary }) {
  const allocation = summary.holdings.map((holding) => ({
    name: holding.stock_symbol,
    value: holding.current_value,
  }));

  const portfolioRiskFn = useCallback(() => api.portfolioRisk(), []);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-cyan">Portfolio</p>
        <h2 className="mt-1 text-2xl font-semibold text-white">Holdings & Intelligence</h2>
      </div>

      {/* Summary KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Health Score", value: `${summary.health_score}/100`, colorClass: summary.health_score >= 70 ? "text-mint" : summary.health_score >= 45 ? "text-amber-300" : "text-red-300" },
          { label: "Diversification", value: `${summary.diversification_score}/100`, colorClass: "text-white" },
          { label: "Cash Utilization", value: `${summary.cash_utilization.toFixed(1)}%`, colorClass: "text-white" },
          { label: "Max Single Position", value: `${summary.max_single_allocation.toFixed(1)}%`, colorClass: summary.max_single_allocation > 40 ? "text-red-300" : "text-mint" },
        ].map((item) => (
          <div key={item.label} className="panel p-4">
            <p className="text-xs text-slate-400">{item.label}</p>
            <p className={`number mt-2 text-xl font-semibold ${item.colorClass}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Holdings Table + Allocation Chart */}
      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
        <section className="panel overflow-hidden">
          <div className="border-b border-line p-5">
            <h3 className="text-lg font-semibold text-white">Current Holdings</h3>
          </div>
          <div className="overflow-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-panel2 text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-5 py-3">Symbol</th>
                  <th className="px-5 py-3">Sector</th>
                  <th className="px-5 py-3">Quantity</th>
                  <th className="px-5 py-3">Avg Buy</th>
                  <th className="px-5 py-3">Current Price</th>
                  <th className="px-5 py-3">Daily Δ</th>
                  <th className="px-5 py-3">P&L</th>
                  <th className="px-5 py-3">Allocation</th>
                </tr>
              </thead>
              <tbody>
                {summary.holdings.map((holding) => (
                  <tr key={holding.stock_symbol} className="border-t border-line hover:bg-panel2/50">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-white">{holding.stock_symbol}</p>
                      <p className="text-xs text-slate-400">{holding.name}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-300 text-xs">{holding.sector ?? "—"}</td>
                    <td className="number px-5 py-4 text-slate-300">{holding.quantity}</td>
                    <td className="number px-5 py-4 text-slate-300">{formatINR(holding.average_price)}</td>
                    <td className="number px-5 py-4 text-white">{formatINR(holding.current_price)}</td>
                    <td className={`number px-5 py-4 ${trendColor(holding.daily_change_percent)}`}>
                      {formatPercent(holding.daily_change_percent)}
                    </td>
                    <td className={`number px-5 py-4 ${trendColor(holding.profit_loss)}`}>
                      {formatINR(holding.profit_loss)} ({formatPercent(holding.return_percent)})
                    </td>
                    <td className="number px-5 py-4 text-slate-300">
                      {holding.allocation_percent.toFixed(2)}%
                    </td>
                  </tr>
                ))}
                {!summary.holdings.length && (
                  <tr>
                    <td className="px-5 py-8 text-center text-slate-400" colSpan={8}>
                      No holdings yet. Use the Market page to place a paper buy order.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel p-5">
          <h3 className="text-lg font-semibold text-white mb-4">Allocation</h3>
          <div className="h-64">
            {allocation.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={allocation} dataKey="value" nameKey="name" outerRadius={100}>
                    {allocation.map((entry, index) => (
                      <Cell key={entry.name} fill={colors[index % colors.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatINR(value)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center text-sm text-slate-400">No holdings yet.</div>
            )}
          </div>
          {/* Sector concentration */}
          {Object.keys(summary.sector_concentration).length > 0 && (
            <div className="mt-4 space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">By Sector</p>
              {Object.entries(summary.sector_concentration).map(([sector, pct]) => (
                <div key={sector} className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">{sector}</span>
                  <span className={`number font-medium ${pct > 40 ? "text-red-300" : "text-slate-300"}`}>
                    {pct.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Intelligence + Risk side by side */}
      <div className="grid gap-6 xl:grid-cols-2">
        <PortfolioIntelligence />
        <RiskPanel fetchFn={portfolioRiskFn} title="Portfolio Risk Analytics" />
      </div>
    </div>
  );
}
