import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { formatINR, formatPercent, api } from "../lib/api";
import type { Analytics } from "../lib/types";

export function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .analytics()
      .then(setAnalytics)
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load analytics"));
  }, []);

  if (error) {
    return <div className="panel p-6 text-red-300">{error}</div>;
  }
  if (!analytics) {
    return <div className="panel p-6 text-slate-300">Loading analytics...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-cyan">Analytics</p>
        <h2 className="mt-1 text-2xl font-semibold text-white">Performance and Trade History</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <section className="panel p-5">
          <p className="text-sm text-slate-400">Total Return</p>
          <p
            className={`number mt-2 text-2xl font-semibold ${
              analytics.total_return_percent >= 0 ? "text-mint" : "text-red-300"
            }`}
          >
            {formatPercent(analytics.total_return_percent)}
          </p>
        </section>
        <section className="panel p-5">
          <p className="text-sm text-slate-400">Best Trade</p>
          <p className="mt-2 text-xl font-semibold text-white">
            {analytics.best_trade?.stock_symbol ?? "No sell trades"}
          </p>
          <p className="number mt-1 text-sm text-mint">
            {analytics.best_trade ? formatINR(analytics.best_trade.realized_pl) : "Realized P/L pending"}
          </p>
        </section>
        <section className="panel p-5">
          <p className="text-sm text-slate-400">Worst Trade</p>
          <p className="mt-2 text-xl font-semibold text-white">
            {analytics.worst_trade?.stock_symbol ?? "No sell trades"}
          </p>
          <p className="number mt-1 text-sm text-red-300">
            {analytics.worst_trade ? formatINR(analytics.worst_trade.realized_pl) : "Realized P/L pending"}
          </p>
        </section>
      </div>

      <section className="panel p-5">
        <h3 className="text-lg font-semibold text-white">Portfolio Growth</h3>
        <div className="mt-4 h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={analytics.growth}>
              <CartesianGrid stroke="#263941" strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" tick={{ fill: "#94a3b8", fontSize: 12 }} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} />
              <Tooltip formatter={(value: number) => formatINR(value)} />
              <Line type="monotone" dataKey="portfolio_value" stroke="#38d99a" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="border-b border-line p-5">
          <h3 className="text-lg font-semibold text-white">Trade History</h3>
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-panel2 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-5 py-3">Time</th>
                <th className="px-5 py-3">Symbol</th>
                <th className="px-5 py-3">Side</th>
                <th className="px-5 py-3">Quantity</th>
                <th className="px-5 py-3">Price</th>
                <th className="px-5 py-3">Realized P/L</th>
              </tr>
            </thead>
            <tbody>
              {analytics.transactions.map((trade) => (
                <tr key={trade.id} className="border-t border-line">
                  <td className="px-5 py-4 text-slate-400">{trade.timestamp}</td>
                  <td className="px-5 py-4 font-semibold text-white">{trade.stock_symbol}</td>
                  <td className={trade.buy_or_sell === "BUY" ? "px-5 py-4 text-mint" : "px-5 py-4 text-red-300"}>
                    {trade.buy_or_sell}
                  </td>
                  <td className="number px-5 py-4 text-slate-300">{trade.quantity}</td>
                  <td className="number px-5 py-4 text-slate-300">{formatINR(trade.price)}</td>
                  <td className="number px-5 py-4 text-slate-300">{formatINR(trade.realized_pl)}</td>
                </tr>
              ))}
              {!analytics.transactions.length ? (
                <tr>
                  <td className="px-5 py-8 text-center text-slate-400" colSpan={6}>
                    No trades yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
