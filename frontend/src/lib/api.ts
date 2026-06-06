import type { Analytics, PortfolioSummary, Sentiment, Stock, Transaction } from "./types";

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
  market: () => request<Stock[]>("/api/market"),
  stock: (symbol: string) => request<Stock>(`/api/market/${symbol}`),
  portfolio: () => request<PortfolioSummary>("/api/portfolio"),
  sentiment: (symbol: string) => request<Sentiment>(`/api/sentiment/${symbol}`),
  analytics: () => request<Analytics>("/api/analytics"),
  trade: (payload: {
    stock_symbol: string;
    buy_or_sell: "BUY" | "SELL";
    quantity: number;
    price: number;
  }) =>
    request<Transaction>("/api/trade", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(payload)
    })
};

export const formatINR = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value);

export const formatPercent = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
