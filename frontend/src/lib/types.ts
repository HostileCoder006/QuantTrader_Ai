// ─── Existing types ────────────────────────────────────────────────────────

export type Stock = {
  symbol: string;
  name: string;
  yf_symbol: string;
  sector?: string;
  current_price: number;
  daily_change_percent: number;
  previous_close: number;
  volume?: number;
  avg_volume?: number;
  high?: number;
  low?: number;
  open?: number;
  source: string;
};

export type Holding = {
  stock_symbol: string;
  name?: string;
  sector?: string;
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
  // Intelligence fields
  health_score: number;
  diversification_score: number;
  cash_utilization: number;
  sector_concentration: Record<string, number>;
  max_single_allocation: number;
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

// ─── New types ─────────────────────────────────────────────────────────────

export type NiftyIndex = {
  value: number;
  previous_close: number;
  change: number;
  change_percent: number;
  source: string;
};

export type MacdData = {
  macd: number;
  signal: number;
  histogram: number;
  crossover: "bullish" | "bearish" | "neutral";
};

export type SignalIndicators = {
  rsi: number;
  macd: MacdData;
  vwap: number;
  ema20: number;
  ema50: number;
  atr: number;
  volume_change: number;
  daily_momentum: number;
  current_price: number;
};

export type SignalTargets = {
  entry: number;
  target: number;
  stop_loss: number;
  risk_reward: number;
};

export type Signal = {
  symbol: string;
  name: string;
  sector: string;
  signal: "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell";
  confidence: "High" | "Medium" | "Low";
  score: number;
  score_breakdown: Record<string, number>;
  indicators: SignalIndicators;
  targets: SignalTargets;
  risk: "Low" | "Medium" | "High";
  data_source: string;
};

export type AISignalExplanation = {
  recommendation_summary: string;
  confidence_commentary: string;
  risk_assessment: string;
  trade_rationale: string;
  model: string;
};

export type SignalWithExplanation = Signal & {
  ai_explanation: AISignalExplanation;
};

export type ScannerResult = {
  top_buy: Signal[];
  top_sell: Signal[];
  top_momentum: Signal[];
  top_volume: Signal[];
  all_signals: Signal[];
  total_scanned: number;
};

export type RiskMetrics = {
  symbol?: string;
  volatility: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  max_drawdown: number;
  beta: number;
  risk_score: number;
  source?: string;
};

export type BacktestResult = {
  symbol: string;
  strategy: string;
  period: string;
  total_return: number;
  cagr: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  max_drawdown: number;
  win_rate: number;
  total_trades: number;
  equity_curve: number[];
  benchmark_return: number;
  alpha: number;
};

export type AIPortfolioAnalysis = {
  analysis: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  model: string;
};

export type PortfolioIntelligence = PortfolioSummary & {
  ai_analysis: AIPortfolioAnalysis;
};

export type MarketBrief = {
  market_summary: string;
  market_mood: string;
  key_events: string[];
  opportunities: string[];
  risks: string[];
  sectors_in_focus: string[];
  model: string;
  nifty: NiftyIndex;
};
