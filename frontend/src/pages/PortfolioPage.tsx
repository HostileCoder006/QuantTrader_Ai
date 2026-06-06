import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatINR, formatPercent } from "../lib/api";
import type { PortfolioSummary } from "../lib/types";

const colors = ["#38d99a", "#43c8f5", "#f7c35f", "#f87171", "#a78bfa", "#fb7185"];

export function PortfolioPage({ summary }: { summary: PortfolioSummary }) {
  const allocation = summary.holdings.map((holding) => ({
    name: holding.stock_symbol,
    value: holding.current_value
  }));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-cyan">Portfolio</p>
        <h2 className="mt-1 text-2xl font-semibold text-white">Holdings and Allocation</h2>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
        <section className="panel overflow-hidden">
          <div className="border-b border-line p-5">
            <h3 className="text-lg font-semibold text-white">Current Holdings</h3>
          </div>
          <div className="overflow-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="bg-panel2 text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-5 py-3">Symbol</th>
                  <th className="px-5 py-3">Quantity</th>
                  <th className="px-5 py-3">Average Buy</th>
                  <th className="px-5 py-3">Current Price</th>
                  <th className="px-5 py-3">Profit/Loss</th>
                  <th className="px-5 py-3">Allocation</th>
                </tr>
              </thead>
              <tbody>
                {summary.holdings.map((holding) => (
                  <tr key={holding.stock_symbol} className="border-t border-line">
                    <td className="px-5 py-4 font-semibold text-white">{holding.stock_symbol}</td>
                    <td className="number px-5 py-4 text-slate-300">{holding.quantity}</td>
                    <td className="number px-5 py-4 text-slate-300">{formatINR(holding.average_price)}</td>
                    <td className="number px-5 py-4 text-white">{formatINR(holding.current_price)}</td>
                    <td
                      className={`number px-5 py-4 ${
                        holding.profit_loss >= 0 ? "text-mint" : "text-red-300"
                      }`}
                    >
                      {formatINR(holding.profit_loss)} ({formatPercent(holding.return_percent)})
                    </td>
                    <td className="number px-5 py-4 text-slate-300">
                      {holding.allocation_percent.toFixed(2)}%
                    </td>
                  </tr>
                ))}
                {!summary.holdings.length ? (
                  <tr>
                    <td className="px-5 py-8 text-center text-slate-400" colSpan={6}>
                      No holdings yet. Use the Market page to place a paper buy order.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel p-5">
          <h3 className="text-lg font-semibold text-white">Allocation</h3>
          <div className="mt-4 h-72">
            {allocation.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={allocation} dataKey="value" nameKey="name" outerRadius={105}>
                    {allocation.map((entry, index) => (
                      <Cell key={entry.name} fill={colors[index % colors.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatINR(value)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center text-sm text-slate-400">No allocation yet.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
