import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { SentimentPanel } from "../components/SentimentPanel";
import { TradeTicket } from "../components/TradeTicket";
import { formatINR, formatPercent } from "../lib/api";
import type { Stock } from "../lib/types";

export function MarketPage({ market, onTrade }: { market: Stock[]; onTrade: () => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Stock | null>(market[0] ?? null);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return market;
    return market.filter(
      (stock) =>
        stock.symbol.toLowerCase().includes(normalized) ||
        stock.name.toLowerCase().includes(normalized)
    );
  }, [market, query]);

  return (
    <div className="grid gap-6 xl:grid-cols-[1.35fr_0.85fr]">
      <section className="panel overflow-hidden">
        <div className="border-b border-line p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-cyan">NIFTY 50 Market</p>
              <h2 className="mt-1 text-2xl font-semibold text-white">Live Stock Watchlist</h2>
            </div>
            <label className="relative block w-full sm:max-w-xs">
              <Search className="absolute left-3 top-2.5 text-slate-500" size={18} />
              <input
                className="input pl-10"
                placeholder="Search symbol or company"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>
        </div>
        <div className="max-h-[680px] overflow-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="sticky top-0 bg-panel2 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-5 py-3">Stock</th>
                <th className="px-5 py-3">Current Price</th>
                <th className="px-5 py-3">Daily Change</th>
                <th className="px-5 py-3">Source</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((stock) => (
                <tr
                  key={stock.symbol}
                  className={`cursor-pointer border-t border-line transition hover:bg-panel2 ${
                    selected?.symbol === stock.symbol ? "bg-panel2" : ""
                  }`}
                  onClick={() => setSelected(stock)}
                >
                  <td className="px-5 py-4">
                    <span className="block font-semibold text-white">{stock.symbol}</span>
                    <span className="text-slate-400">{stock.name}</span>
                  </td>
                  <td className="number px-5 py-4 text-white">{formatINR(stock.current_price)}</td>
                  <td
                    className={`number px-5 py-4 ${
                      stock.daily_change_percent >= 0 ? "text-mint" : "text-red-300"
                    }`}
                  >
                    {formatPercent(stock.daily_change_percent)}
                  </td>
                  <td className="px-5 py-4 text-slate-400">{stock.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="space-y-6">
        {selected ? (
          <>
            <section className="panel p-5">
              <p className="text-sm text-slate-400">Stock Detail</p>
              <div className="mt-2 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-semibold text-white">{selected.symbol}</h3>
                  <p className="text-sm text-slate-400">{selected.name}</p>
                </div>
                <p className="number text-xl font-semibold text-mint">{formatINR(selected.current_price)}</p>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-md border border-line bg-ink p-3">
                  <p className="text-xs text-slate-500">Daily Change</p>
                  <p className={selected.daily_change_percent >= 0 ? "text-mint" : "text-red-300"}>
                    {formatPercent(selected.daily_change_percent)}
                  </p>
                </div>
                <div className="rounded-md border border-line bg-ink p-3">
                  <p className="text-xs text-slate-500">Previous Close</p>
                  <p className="number text-white">{formatINR(selected.previous_close)}</p>
                </div>
              </div>
            </section>
            <TradeTicket stock={selected} onTrade={onTrade} />
            <SentimentPanel stock={selected} />
          </>
        ) : null}
      </div>
    </div>
  );
}
