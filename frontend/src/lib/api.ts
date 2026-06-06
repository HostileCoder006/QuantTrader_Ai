import type {
  Analytics,
  BacktestResult,
  MarketBrief,
  NiftyIndex,
  PortfolioIntelligence,
  PortfolioSummary,
  RiskMetrics,
  ScannerResult,
  Sentiment,
  Signal,
  SignalWithExplanation,
  Stock,
  Transaction,
} from "./types";

const jsonHeaders = { "Content-Type": "application/json" };

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error ?? "Request failed");
  }
  return body as T;
}

export const api = {
  // ── Market ────────────────────────────────────────────────────────────────
  market: () => request<Stock[]>("/api/market"),
  stock: (symbol: string) => request<Stock>(`/api/market/${symbol}`),
  nifty: () => request<NiftyIndex>("/api/nifty"),
  marketBrief: () => request<MarketBrief>("/api/market/brief"),

  // ── Signals ───────────────────────────────────────────────────────────────
  signal: (symbol: string) => request<Signal>(`/api/signal/${symbol}`),
  signalExplain: (symbol: string) =>
    request<SignalWithExplanation>(`/api/signal/${symbol}/explain`),

  // ── Scanner ───────────────────────────────────────────────────────────────
  scanner: () => request<ScannerResult>("/api/scanner"),

  // ── Portfolio ─────────────────────────────────────────────────────────────
  portfolio: () => request<PortfolioSummary>("/api/portfolio"),
  portfolioIntelligence: () =>
    request<PortfolioIntelligence>("/api/portfolio/intelligence"),

  // ── Sentiment ─────────────────────────────────────────────────────────────
  sentiment: (symbol: string) => request<Sentiment>(`/api/sentiment/${symbol}`),

  // ── Analytics ─────────────────────────────────────────────────────────────
  analytics: () => request<Analytics>("/api/analytics"),

  // ── Risk ──────────────────────────────────────────────────────────────────
  stockRisk: (symbol: string) => request<RiskMetrics>(`/api/risk/${symbol}`),
  portfolioRisk: () => request<RiskMetrics>("/api/risk/portfolio/aggregate"),

  // ── Backtesting ───────────────────────────────────────────────────────────
  backtest: (symbol: string, strategy: string, period: string) =>
    request<BacktestResult>(
      `/api/backtest/${symbol}?strategy=${strategy}&period=${period}`
    ),

  // ── Trading ───────────────────────────────────────────────────────────────
  trade: (payload: {
    stock_symbol: string;
    buy_or_sell: "BUY" | "SELL";
    quantity: number;
    price: number;
  }) =>
    request<Transaction>("/api/trade", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    }),
};

export const formatINR = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);

export const formatPercent = (value: number) =>
  `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

export const formatNumber = (value: number, decimals = 2) =>
  value.toFixed(decimals);

/** Returns Tailwind color class based on value direction. */
export const trendColor = (value: number) =>
  value >= 0 ? "text-mint" : "text-red-300";

/** Signal badge color. */
export const signalColor = (signal: string): string => {
  const map: Record<string, string> = {
    "Strong Buy": "text-emerald-300 bg-emerald-950 border-emerald-800",
    Buy: "text-mint bg-emerald-900/50 border-emerald-700",
    Hold: "text-amber-300 bg-amber-950/50 border-amber-800",
    Sell: "text-red-300 bg-red-950/50 border-red-800",
    "Strong Sell": "text-red-400 bg-red-950 border-red-700",
  };
  return map[signal] ?? "text-slate-300 bg-panel2 border-line";
};
