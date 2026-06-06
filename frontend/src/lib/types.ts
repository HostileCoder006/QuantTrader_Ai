export type Stock = {
  symbol: string;
  name: string;
  yf_symbol: string;
  current_price: number;
  daily_change_percent: number;
  previous_close: number;
  source: string;
};

export type Holding = {
  stock_symbol: string;
  quantity: number;
  average_price: number;
  current_price: number;
  daily_change_percent: number;
  current_value: number;
  profit_loss: number;
  return_percent: number;
  allocation_percent: number;
};

export type PortfolioSummary = {
  portfolio_value: number;
  available_cash: number;
  invested_value: number;
  total_profit_loss: number;
  total_return_percent: number;
  top_performing_stock: Holding | null;
  holdings: Holding[];
};

export type Transaction = {
  id: number;
  stock_symbol: string;
  buy_or_sell: "BUY" | "SELL";
  quantity: number;
  price: number;
  timestamp: string;
  realized_pl: number;
};

export type Sentiment = {
  headlines: { title: string; source: string; url: string }[];
  classification: "Bullish" | "Neutral" | "Bearish";
  score: number;
  explanation: string;
  model: string;
};

export type Analytics = {
  growth: { timestamp: string; portfolio_value: number }[];
  best_trade: Transaction | null;
  worst_trade: Transaction | null;
  total_return_percent: number;
  transactions: Transaction[];
};
