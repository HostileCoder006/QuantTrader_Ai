
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
  no_holdings: boolean;
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


export type RegimeName =
  | "BULLISH"
  | "BEARISH"
  | "NEUTRAL"
  | "HIGH_VOLATILITY"
  | "NO_TRADE";

export type MarketRegime = {
  regime: RegimeName;
  nifty_price: number | null;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi: number | null;
  volatility_20d: number | null;
  score_adjustment: number;
  details: Record<string, string | number>;
  data_available: boolean;
  cached_at?: string;
};

export type RegimeHistoryEntry = {
  timestamp: string;
  regime: RegimeName;
  nifty_value: number | null;
  ema20: number | null;
  ema50: number | null;
  rsi: number | null;
  volatility_20d: number | null;
  score_adjustment: number;
};


export type HorizonStats = {
  data_available: boolean;
  sample_size?: number;
  win_rate?: number;
  avg_return?: number;
  median_return?: number;
  best_return?: number;
  worst_return?: number;
  std_return?: number;
};

export type PatternMatch = {
  date: string;
  price: number;
  similarity: number;
  distance: number;
  rsi: number;
  macd_hist: number;
  price_vs_ema50_pct: number;
  volume_vs_avg_pct: number;
  return_5d: number | null;
  return_20d: number | null;
  return_60d: number | null;
};

export type PatternSearchResult = {
  symbol: string | null;
  similar_count: number;
  history_days: number;
  history_start: string | null;
  history_end: string | null;
  current_features: Record<string, number>;
  horizon_stats: {
    "5d"?: HorizonStats;
    "20d"?: HorizonStats;
    "60d"?: HorizonStats;
  };
  matches: PatternMatch[];
  data_available: boolean;
  message: string;
};


export type JournalOutcome = {
  price: number;
  return_pct: number;
  vs_nifty: number | null;
  date: string;
};

export type JournalEntry = {
  id: number;
  symbol: string;
  timestamp: string;
  signal: string;
  confidence: string;
  score: number;
  price_at_signal: number;
  regime: string;
  target: number | null;
  stop_loss: number | null;
  data_source: string;
  indicators: Record<string, unknown>;
  sentiment: { classification?: string; score?: number };
  outcomes: {
    "1d"?: JournalOutcome;
    "5d"?: JournalOutcome;
    "20d"?: JournalOutcome;
    "60d"?: JournalOutcome;
  };
};

export type HorizonStat = {
  data_available: boolean;
  sample_size: number;
  win_rate?: number;
  avg_return?: number;
  median_return?: number;
  best_return?: number;
  worst_return?: number;
  avg_alpha?: number;
  by_signal?: Record<string, { count: number; win_rate: number; avg_return: number }>;
};

export type JournalStats = {
  total_recommendations: number;
  by_signal: Record<string, number>;
  horizon_stats: {
    "1d": HorizonStat;
    "5d": HorizonStat;
    "20d": HorizonStat;
    "60d": HorizonStat;
  };
  max_drawdown_5d: number;
};


export type SentimentTrendPoint = {
  date: string;
  score: number;
  class: "Bullish" | "Neutral" | "Bearish";
};

export type ReactionClassStats = {
  count: number;
  avg_return: number;
  win_rate: number;
};

export type NewsReactionStats = {
  symbol: string;
  data_available: boolean;
  total_events?: number;
  resolved_events?: number;
  sentiment_trend: SentimentTrendPoint[];
  avg_sentiment_7d: number | null;
  avg_sentiment_30d: number | null;
  reaction_stats: {
    "1d"?: { data_available: boolean; sample_size: number; by_sentiment_class: Record<string, ReactionClassStats> };
    "5d"?: { data_available: boolean; sample_size: number; by_sentiment_class: Record<string, ReactionClassStats> };
    "20d"?: { data_available: boolean; sample_size: number; by_sentiment_class: Record<string, ReactionClassStats> };
  };
  divergence: { type: string; note: string } | null;
  message: string;
};


export type StrategyLabChartData = {
  symbol: string;
  stock_name: string;
  period: string;
  bars: number;
  dates: string[];
  ohlcv: {
    open: (number | null)[];
    high: (number | null)[];
    low: (number | null)[];
    close: (number | null)[];
    volume: number[];
  };
  rsi: {
    values: (number | null)[];
    period: number;
    ob_level: number;
    os_level: number;
  };
  macd: {
    macd: (number | null)[];
    signal: (number | null)[];
    histogram: (number | null)[];
    fast: number;
    slow: number;
    signal_span: number;
  };
  trade_signals: {
    buy: { date: string; price: number }[];
    sell: { date: string; price: number }[];
  };
};

export type StrategyLabResult = {
  symbol: string;
  stock_name: string;
  period: string;
  total_return: number;
  cagr: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  max_drawdown: number;
  win_rate: number;
  total_trades: number;
  profit_factor: number;
  equity_curve: number[];
  equity_curve_abs: number[];
  best_trade: number;
  worst_trade: number;
  avg_days_held: number;
  benchmark_return: number;
  alpha: number;
  trade_log: {
    entry_price: number;
    exit_price: number;
    return_pct: number;
    days_held: number;
    entry_date: string;
    exit_date: string;
  }[];
  config_used: Record<string, unknown>;
};


export type RegimeContext = {
  regime: RegimeName;
  score_adjustment: number;
  volatility_20d: number | null;
  rsi: number | null;
  data_available: boolean;
};

export type EnrichedSignal = Signal & {
  raw_score: number;
  regime_context: RegimeContext;
};

export type EnrichedSignalWithExplanation = EnrichedSignal & {
  ai_explanation: {
    recommendation_summary: string;
    supporting_evidence: string;
    contradictions: string;
    regime_context: string;
    pattern_context: string;
    risk_assessment: string;
    trade_rationale: string;
    confidence_commentary: string;
    model: string;
  };
  pattern_context: PatternSearchResult | null;
};

export type ScannerResultWithRegime = ScannerResult & {
  regime: MarketRegime | null;
};


export type OpportunityHorizon = "1-5d" | "1-2w" | "2-4w" | "1-3m";
export type RiskProfile = "conservative" | "balanced" | "aggressive";
export type CommitteeMode = "quick" | "standard" | "deep";

export type OpportunityFactorScores = {
  momentum:    number;
  macd:        number;
  rsi:         number;
  volume:      number;
  vwap:        number;
  trend:       number;
  risk_reward: number;
  sector:      number;
};

export type OpportunityPatternStat = {
  data_available: boolean;
  sample_size?:   number;
  win_rate?:      number;
  avg_return?:    number;
  median_return?: number;
  best_return?:   number;
  worst_return?:  number;
  std_return?:    number;
};

export type OpportunityPattern = {
  data_available:  boolean;
  symbol?:         string;
  similar_setups?: number;
  history_years?:  number;
  primary_horizon?: string;
  primary_stat?:   OpportunityPatternStat;
  all_horizons?:   Record<string, OpportunityPatternStat>;
  message?:        string;
};

export type OpportunityCandidate = {
  // identity
  symbol:           string;
  name:             string;
  sector:           string;
  rank:             number;
  // price
  current_price:    number;
  daily_momentum:   number;
  atr:              number;
  atr_pct:          number;
  // indicators
  rsi:              number;
  macd:             { macd: number; signal: number; histogram: number; crossover: string };
  vwap:             number;
  ema20:            number;
  ema50:            number;
  volume_change:    number;
  // scoring
  opportunity_score:    number;
  factor_scores:        OpportunityFactorScores;
  confidence:           number;
  risk_label:           "Low" | "Medium" | "High";
  // targets
  entry:            number;
  target:           number;
  stop_loss:        number;
  risk_reward:      number;
  estimated_return_lo: number;
  estimated_return_hi: number;
  // historical
  pattern:          OpportunityPattern;
  // meta
  data_source:      string;
};

export type OpportunityRegime = {
  regime:           string;
  rsi:              number | null;
  volatility_20d:   number | null;
  score_adjustment: number;
  data_available:   boolean;
};

export type OpportunityScanResult = {
  scan_id:           string;
  horizon:           OpportunityHorizon;
  horizon_label:     string;
  risk_profile:      RiskProfile;
  regime:            OpportunityRegime;
  scanned_at:        string;
  candidates:        OpportunityCandidate[];
  top_for_committee: string[];
  total_scanned:     number;
  sector_strength:   Record<string, number>;
  message:           string;
};

// Committee types
export type AnalystResult = {
  analyst:        string;
  role:           string;
  recommendation: "BUY" | "HOLD" | "SELL";
  confidence:     number;
  thesis:         string;
  evidence:       string[];
  risks:          string[];
  invalidation:   string;
  model:          string;
};

export type DebateResult = {
  bull_case:     string;
  bear_case:     string;
  bull_rebuttal: string;
  bear_rebuttal: string;
  key_tension:   string;
  model:         string;
};

export type CommitteeSynthesis = {
  final_recommendation: "BUY" | "HOLD" | "SELL";
  conviction:           "HIGH" | "MEDIUM" | "LOW";
  consensus_score:      number;
  thesis:               string;
  strongest_bull:       string;
  strongest_bear:       string;
  key_risks:            string[];
  conditions_to_watch:  string[];
  disclaimer:           string;
  model:                string;
};

export type CommitteeStockResult = {
  symbol:            string;
  name:              string;
  sector:            string;
  opportunity_score: number;
  rank:              number;
  analyst_results:   AnalystResult[];
  debate:            DebateResult | null;
  synthesis:         CommitteeSynthesis;
  vote_summary:      { buy: number; hold: number; sell: number };
};

export type QuickCommitteeResult = {
  mode:           "quick";
  rankings:       {
    rank: number;
    symbol: string;
    recommendation: "BUY" | "HOLD" | "SELL";
    confidence: number;
    one_line_thesis: string;
    key_risk: string;
  }[];
  market_comment: string;
  disclaimer:     string;
  model:          string;
};

export type OpportunityCommitteeResult = OpportunityScanResult & {
  committee:      CommitteeStockResult[] | QuickCommitteeResult;
  committee_mode: CommitteeMode;
};

export type OpportunitySelfEvalSummary = {
  total_logged:   number;
  resolved:       number;
  accuracy_pct:   number | null;
  avg_return_pct: number | null;
};

export type OpportunitySelfEval = {
  recommendations: {
    id:                  number;
    scan_id:             string;
    symbol:              string;
    rank:                number;
    horizon:             string;
    risk_profile:        string;
    opportunity_score:   number;
    committee_rec:       string | null;
    committee_conviction: string | null;
    predicted_lo:        number | null;
    predicted_hi:        number | null;
    price_at_rec:        number | null;
    regime:              string | null;
    recorded_at:         string;
    actual_return_pct:   number | null;
    was_correct:         0 | 1 | null;
    outcome_price:       number | null;
    outcome_date:        string | null;
  }[];
  summary: OpportunitySelfEvalSummary;
};
