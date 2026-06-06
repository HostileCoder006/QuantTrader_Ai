import { ShoppingCart, Undo2 } from "lucide-react";
import { useState } from "react";
import { api, formatINR } from "../lib/api";
import type { Stock } from "../lib/types";

type TradeTicketProps = {
  stock: Stock;
  onTrade: () => void;
};

export function TradeTicket({ stock, onTrade }: TradeTicketProps) {
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const submitTrade = async () => {
    setLoading(true);
    setMessage("");
    try {
      await api.trade({
        stock_symbol: stock.symbol,
        buy_or_sell: side,
        quantity,
        price: stock.current_price
      });
      setMessage(`${side} order filled for ${quantity} ${stock.symbol}.`);
      onTrade();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Trade failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-400">Trade Ticket</p>
          <h3 className="mt-1 text-lg font-semibold text-white">{stock.symbol}</h3>
        </div>
        <p className="number text-lg font-semibold text-mint">{formatINR(stock.current_price)}</p>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2 rounded-md bg-ink p-1">
        {(["BUY", "SELL"] as const).map((item) => (
          <button
            key={item}
            className={`rounded px-3 py-2 text-sm font-semibold ${
              side === item ? "bg-mint text-ink" : "text-slate-300 hover:bg-panel2"
            }`}
            onClick={() => setSide(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <label className="mt-4 block text-sm text-slate-400" htmlFor="quantity">
        Quantity
      </label>
      <input
        id="quantity"
        className="input mt-2"
        type="number"
        min={1}
        value={quantity}
        onChange={(event) => setQuantity(Math.max(1, Number(event.target.value)))}
      />
      <p className="number mt-3 text-sm text-slate-400">
        Estimated value: {formatINR(quantity * stock.current_price)}
      </p>
      <button className="button-primary mt-5 w-full" disabled={loading} onClick={submitTrade}>
        {side === "BUY" ? <ShoppingCart size={17} /> : <Undo2 size={17} />}
        {loading ? "Submitting" : `${side} Paper Order`}
      </button>
      {message ? <p className="mt-3 text-sm text-slate-300">{message}</p> : null}
    </section>
  );
}
