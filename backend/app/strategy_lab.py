"""
Strategy Lab — Custom Backtester
---------------------------------
Lets users configure their own strategy with:
  - Entry rule  : indicator thresholds (RSI, EMA cross, MACD, Volume)
  - Exit rule   : same set + holding period cap
  - Stop loss   : % below entry price
  - Take profit : % above entry price
  - Position sizing: fixed capital per trade
  - Transaction costs: brokerage + STT (default 0.05% round-trip)
  - Slippage    : % of price (default 0.05%)

Anti-lookahead:
  - All indicator computations are on SERIES up to bar i.
  - Signals are generated at bar i, executed at bar i+1 OPEN price.
  - No peeking at future bars.

Output:
  - Total return, NIFTY alpha, Win rate, Sharpe, Max Drawdown
  - Profit factor, Number of trades
  - Equity curve (downsampled to ≤200 pts for UI)
  - Trade log (symbol, entry date, exit date, entry price, exit price, return)
"""
from __future__ import annotations

import logging
import math
from typing import Any

import numpy as np
import pandas as pd

from .market import get_ohlcv_history
from .nifty50 import NIFTY_INDEX, stock_by_symbol

logger = logging.getLogger(__name__)

TRADING_DAYS = 252
MAX_EQUITY_CURVE_POINTS = 200

# ── Available indicators & rules ────────────────────────────────────────────

AVAILABLE_INDICATORS = [
    {"id": "rsi", "label": "RSI (14)", "type": "float", "typical_range": [0, 100]},
    {"id": "ema_cross", "label": "EMA Cross (fast/slow)", "type": "cross", "options": ["bullish", "bearish"]},
    {"id": "macd_histogram", "label": "MACD Histogram", "type": "float", "typical_range": [-50, 50]},
    {"id": "price_vs_ema50", "label": "Price vs EMA50 (%)", "type": "float", "typical_range": [-20, 20]},
    {"id": "volume_spike", "label": "Volume vs 20D Avg (%)", "type": "float", "typical_range": [-50, 200]},
]

AVAILABLE_ENTRY_RULES = [
    "rsi_above", "rsi_below", "ema_cross_bullish", "ema_cross_bearish",
    "macd_hist_above", "macd_hist_below",
    "price_above_ema50", "price_below_ema50",
    "volume_spike_above",
]

# ── Rolling indicator builders ───────────────────────────────────────────────

def _rsi_series(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(com=period - 1, min_periods=period).mean()
    avg_loss = loss.ewm(com=period - 1, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def _ema_series(close: pd.Series, span: int) -> pd.Series:
    return close.ewm(span=span, adjust=False).mean()


def _macd_histogram_series(close: pd.Series) -> pd.Series:
    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    macd_line = ema12 - ema26
    signal_line = macd_line.ewm(span=9, adjust=False).mean()
    return macd_line - signal_line


def _volume_vs_avg_series(volume: pd.Series, window: int = 20) -> pd.Series:
    avg = volume.rolling(window).mean()
    return ((volume - avg) / avg.replace(0, np.nan)) * 100


# ── Signal generation from config ───────────────────────────────────────────

def _generate_signals_from_config(df: pd.DataFrame, config: dict[str, Any]) -> pd.Series:
    """
    Generate entry (+1) and exit (-1) signals from user config.
    Signal is set at bar i, trade executed at bar i+1 open (handled in _run).
    """
    close = df["Close"]
    volume = df["Volume"]
    n = len(df)

    rsi = _rsi_series(close)
    ema_fast_span = int(config.get("ema_fast", 20))
    ema_slow_span = int(config.get("ema_slow", 50))
    ema_fast = _ema_series(close, ema_fast_span)
    ema_slow = _ema_series(close, ema_slow_span)
    macd_hist = _macd_histogram_series(close)
    vol_vs_avg = _volume_vs_avg_series(volume)
    price_vs_ema50 = ((close - _ema_series(close, 50)) / _ema_series(close, 50).replace(0, np.nan)) * 100

    signals = pd.Series(0, index=df.index)

    entry_rule = config.get("entry_rule", "rsi_above")
    entry_value = float(config.get("entry_value", 55))
    exit_rule = config.get("exit_rule", "rsi_below")
    exit_value = float(config.get("exit_value", 40))

    # ── Entry conditions ──
    if entry_rule == "rsi_above":
        entry_mask = rsi > entry_value
    elif entry_rule == "rsi_below":
        entry_mask = rsi < entry_value
    elif entry_rule == "ema_cross_bullish":
        entry_mask = (ema_fast > ema_slow) & (ema_fast.shift(1) <= ema_slow.shift(1))
    elif entry_rule == "ema_cross_bearish":
        entry_mask = (ema_fast < ema_slow) & (ema_fast.shift(1) >= ema_slow.shift(1))
    elif entry_rule == "macd_hist_above":
        entry_mask = macd_hist > entry_value
    elif entry_rule == "macd_hist_below":
        entry_mask = macd_hist < entry_value
    elif entry_rule == "price_above_ema50":
        entry_mask = price_vs_ema50 > entry_value
    elif entry_rule == "price_below_ema50":
        entry_mask = price_vs_ema50 < entry_value
    elif entry_rule == "volume_spike_above":
        entry_mask = vol_vs_avg > entry_value
    else:
        entry_mask = pd.Series(False, index=df.index)

    # ── Exit conditions ──
    if exit_rule == "rsi_above":
        exit_mask = rsi > exit_value
    elif exit_rule == "rsi_below":
        exit_mask = rsi < exit_value
    elif exit_rule == "ema_cross_bullish":
        exit_mask = (ema_fast > ema_slow) & (ema_fast.shift(1) <= ema_slow.shift(1))
    elif exit_rule == "ema_cross_bearish":
        exit_mask = (ema_fast < ema_slow) & (ema_fast.shift(1) >= ema_slow.shift(1))
    elif exit_rule == "macd_hist_above":
        exit_mask = macd_hist > exit_value
    elif exit_rule == "macd_hist_below":
        exit_mask = macd_hist < exit_value
    elif exit_rule == "price_above_ema50":
        exit_mask = price_vs_ema50 > exit_value
    elif exit_rule == "price_below_ema50":
        exit_mask = price_vs_ema50 < exit_value
    elif exit_rule == "volume_spike_above":
        exit_mask = vol_vs_avg > exit_value
    else:
        exit_mask = pd.Series(False, index=df.index)

    signals[entry_mask] = 1
    signals[exit_mask] = -1
    return signals


# ── Core backtest simulation ─────────────────────────────────────────────────

def _run_strategy(df: pd.DataFrame, signals: pd.Series, config: dict[str, Any]) -> dict:
    """
    Long-only backtest with stop-loss, take-profit, holding period cap,
    position sizing, transaction costs, and slippage.

    Executes at NEXT BAR OPEN to avoid lookahead bias.
    """
    close = df["Close"]
    opens = df["Open"]
    n = len(close)

    if n < 60:
        return _empty_result()

    stop_loss_pct = float(config.get("stop_loss_pct", 5.0)) / 100
    take_profit_pct = float(config.get("take_profit_pct", 10.0)) / 100
    max_holding_days = int(config.get("max_holding_days", 30))
    trade_capital = float(config.get("trade_capital", 10000))  # INR per trade
    cost_pct = float(config.get("cost_pct", 0.05)) / 100       # one-way cost
    slippage_pct = float(config.get("slippage_pct", 0.05)) / 100

    position = 0
    entry_price = 0.0
    entry_day = 0
    shares = 0.0
    trades: list[dict] = []
    equity = float(config.get("initial_capital", 100000))
    equity_curve: list[float] = [equity]

    for i in range(1, n):
        sig = int(signals.iloc[i - 1])  # signal from previous bar
        exec_price_raw = float(opens.iloc[i])  # execute at current open

        # Apply slippage
        if position == 0 and sig == 1:
            exec_price = exec_price_raw * (1 + slippage_pct)
        elif position == 1:
            exec_price = exec_price_raw * (1 - slippage_pct)
        else:
            exec_price = exec_price_raw

        if position == 0 and sig == 1:
            # Enter long
            cost_per_share = exec_price * (1 + cost_pct)
            if cost_per_share <= 0 or equity < cost_per_share:
                equity_curve.append(round(equity, 4))
                continue
            shares = trade_capital / cost_per_share
            entry_price = exec_price
            entry_day = i
            position = 1

        elif position == 1:
            days_held = i - entry_day
            current_price = float(close.iloc[i])
            ret_from_entry = (current_price - entry_price) / entry_price

            should_exit = (
                sig == -1
                or ret_from_entry <= -stop_loss_pct
                or ret_from_entry >= take_profit_pct
                or days_held >= max_holding_days
            )

            if should_exit:
                exit_price = exec_price
                proceeds = shares * exit_price * (1 - cost_pct)
                cost_basis = shares * entry_price * (1 + cost_pct)
                pnl = proceeds - cost_basis
                equity += pnl
                ret_pct = round(((exit_price - entry_price) / entry_price) * 100, 3)
                trades.append({
                    "entry_price": round(entry_price, 2),
                    "exit_price": round(exit_price, 2),
                    "return_pct": ret_pct,
                    "days_held": days_held,
                    "entry_date": str(df.index[entry_day].date()),
                    "exit_date": str(df.index[i].date()),
                })
                position = 0
                entry_price = 0.0
                shares = 0.0

        equity_curve.append(round(max(equity, 0.01), 4))

    # Close open position at last bar
    if position == 1:
        exit_price = float(close.iloc[-1])
        proceeds = shares * exit_price * (1 - cost_pct)
        cost_basis = shares * entry_price * (1 + cost_pct)
        pnl = proceeds - cost_basis
        equity += pnl
        ret_pct = round(((exit_price - entry_price) / entry_price) * 100, 3)
        trades.append({
            "entry_price": round(entry_price, 2),
            "exit_price": round(exit_price, 2),
            "return_pct": ret_pct,
            "days_held": n - entry_day,
            "entry_date": str(df.index[entry_day].date()),
            "exit_date": str(df.index[-1].date()),
        })
        equity_curve[-1] = round(max(equity, 0.01), 4)

    return _calc_metrics(equity_curve, trades, n, config)


def _calc_metrics(
    equity_curve: list[float],
    trades: list[dict],
    n_days: int,
    config: dict[str, Any],
) -> dict:
    if not trades:
        return _empty_result()

    initial = float(config.get("initial_capital", 100000))
    final = equity_curve[-1]
    total_return = round((final - initial) / initial * 100, 2)
    years = n_days / TRADING_DAYS
    cagr = round((math.pow(final / max(initial, 0.01), 1 / max(years, 0.1)) - 1) * 100, 2)

    eq = pd.Series(equity_curve)
    daily_rets = eq.pct_change().dropna()
    std = daily_rets.std()

    if std > 0:
        rf_daily = 0.065 / TRADING_DAYS
        sharpe = round(float((daily_rets.mean() - rf_daily) / std * math.sqrt(TRADING_DAYS)), 3)
    else:
        sharpe = 0.0

    downside = daily_rets[daily_rets < 0]
    if len(downside) > 0 and downside.std() > 0:
        sortino = round(
            float((daily_rets.mean() * TRADING_DAYS - 0.065) / (downside.std() * math.sqrt(TRADING_DAYS))),
            3,
        )
    else:
        sortino = 0.0

    rolling_max = eq.cummax()
    drawdowns = (eq - rolling_max) / rolling_max
    max_dd = round(float(drawdowns.min() * 100), 2)

    wins = [t for t in trades if t["return_pct"] > 0]
    losses = [t for t in trades if t["return_pct"] <= 0]
    win_rate = round(len(wins) / len(trades) * 100, 1)

    gross_profit = sum(t["return_pct"] for t in wins)
    gross_loss = abs(sum(t["return_pct"] for t in losses))
    profit_factor = round(gross_profit / gross_loss, 3) if gross_loss > 0 else float("inf")

    # Downsample equity curve
    step = max(1, len(equity_curve) // MAX_EQUITY_CURVE_POINTS)
    curve_out = [round(v, 2) for v in equity_curve[::step]]

    # Normalise curve to ₹100 start for comparison
    norm_curve = [round(v / initial * 100, 3) for v in curve_out]

    return {
        "total_return": total_return,
        "cagr": cagr,
        "sharpe_ratio": sharpe,
        "sortino_ratio": sortino,
        "max_drawdown": max_dd,
        "win_rate": win_rate,
        "total_trades": len(trades),
        "profit_factor": profit_factor if profit_factor != float("inf") else 9999.0,
        "equity_curve": norm_curve,      # normalised, ₹100 base
        "equity_curve_abs": curve_out,  # absolute INR
        "best_trade": round(max(t["return_pct"] for t in trades), 2),
        "worst_trade": round(min(t["return_pct"] for t in trades), 2),
        "avg_days_held": round(sum(t["days_held"] for t in trades) / len(trades), 1),
        "trade_log": trades[-50:],  # last 50 for UI display
    }


def _empty_result() -> dict:
    return {
        "total_return": 0.0,
        "cagr": 0.0,
        "sharpe_ratio": 0.0,
        "sortino_ratio": 0.0,
        "max_drawdown": 0.0,
        "win_rate": 0.0,
        "total_trades": 0,
        "profit_factor": 0.0,
        "equity_curve": [100.0],
        "equity_curve_abs": [],
        "best_trade": 0.0,
        "worst_trade": 0.0,
        "avg_days_held": 0.0,
        "trade_log": [],
    }


# ── Public API ───────────────────────────────────────────────────────────────

def run_custom_backtest(symbol: str, config: dict[str, Any]) -> dict:
    """
    Entry point for the Strategy Lab.

    config keys:
      entry_rule, entry_value, exit_rule, exit_value,
      ema_fast (int, default 20), ema_slow (int, default 50),
      stop_loss_pct (default 5.0), take_profit_pct (default 10.0),
      max_holding_days (default 30),
      trade_capital (default 10000), initial_capital (default 100000),
      cost_pct (default 0.05), slippage_pct (default 0.05),
      period (yfinance period string, default "2y")
    """
    stock = stock_by_symbol(symbol)
    if not stock:
        raise ValueError(f"Unknown NIFTY 50 symbol: {symbol}")

    period = str(config.get("period", "2y"))
    df = get_ohlcv_history(stock["yf_symbol"], period=period)

    if df.empty or len(df) < 60:
        raise ValueError(f"Insufficient data for {symbol} over period {period}")

    signals = _generate_signals_from_config(df, config)
    result = _run_strategy(df, signals, config)

    # Benchmark: NIFTY buy-and-hold
    df_nifty = get_ohlcv_history(NIFTY_INDEX["yf_symbol"], period=period)
    if not df_nifty.empty and len(df_nifty) >= 2:
        nifty_ret = round(
            ((float(df_nifty["Close"].iloc[-1]) - float(df_nifty["Close"].iloc[0]))
             / float(df_nifty["Close"].iloc[0])) * 100,
            2,
        )
    else:
        nifty_ret = 0.0

    return {
        **result,
        "symbol": symbol,
        "stock_name": stock["name"],
        "period": period,
        "benchmark_return": nifty_ret,
        "alpha": round(result["total_return"] - nifty_ret, 2),
        "config_used": {k: v for k, v in config.items() if k != "initial_capital"},
    }


def get_available_indicators() -> list[dict]:
    return AVAILABLE_INDICATORS


# ── Chart data (OHLCV + indicators + signals) ────────────────────────────────

def get_chart_data(symbol: str, config: dict[str, Any]) -> dict:
    """
    Return all data needed to render the Strategy Lab price chart with
    RSI panel, MACD panel, and BUY/SELL signal markers.

    config keys used here:
      period        — yfinance period string (default "2y")
      rsi_period    — RSI lookback (default 14)
      macd_fast     — MACD fast EMA span (default 12)
      macd_slow     — MACD slow EMA span (default 26)
      macd_signal   — MACD signal EMA span (default 9)
      entry_rule, entry_value, exit_rule, exit_value,
      ema_fast, ema_slow  — same as run_custom_backtest

    Returns dicts with ISO-date keys so the frontend can align all series.
    """
    stock = stock_by_symbol(symbol)
    if not stock:
        raise ValueError(f"Unknown NIFTY 50 symbol: {symbol}")

    period = str(config.get("period", "2y"))
    df = get_ohlcv_history(stock["yf_symbol"], period=period)

    if df.empty or len(df) < 30:
        raise ValueError(f"Insufficient data for {symbol} over {period}")

    close = df["Close"]
    n = len(df)

    # ── RSI ──────────────────────────────────────────────────────────────────
    rsi_period = int(config.get("rsi_period", 14))
    rsi = _rsi_series(close, rsi_period)

    # ── MACD ─────────────────────────────────────────────────────────────────
    macd_fast   = int(config.get("macd_fast",   12))
    macd_slow_p = int(config.get("macd_slow",   26))
    macd_sig    = int(config.get("macd_signal",  9))

    ema_f   = close.ewm(span=macd_fast,   adjust=False).mean()
    ema_s   = close.ewm(span=macd_slow_p, adjust=False).mean()
    macd_line   = ema_f - ema_s
    signal_line = macd_line.ewm(span=macd_sig, adjust=False).mean()
    histogram   = macd_line - signal_line

    # ── Trade signals (entry=+1, exit=-1, 0=nothing) ─────────────────────────
    signals = _generate_signals_from_config(df, config)

    # ── Downsample if needed (keep ≤ 500 bars for the chart) ─────────────────
    MAX_BARS = 500
    step = max(1, n // MAX_BARS)
    idx = df.index[::step]

    def _round(v: float | None, d: int = 2) -> float | None:
        if v is None or (isinstance(v, float) and (np.isnan(v) or np.isinf(v))):
            return None
        return round(float(v), d)

    dates   = [str(i.date()) for i in idx]
    opens   = [_round(df["Open"].loc[i])  for i in idx]
    highs   = [_round(df["High"].loc[i])  for i in idx]
    lows    = [_round(df["Low"].loc[i])   for i in idx]
    closes  = [_round(df["Close"].loc[i]) for i in idx]
    volumes = [int(df["Volume"].loc[i])   for i in idx]

    rsi_vals  = [_round(rsi.loc[i],        1) for i in idx]
    macd_vals = [_round(macd_line.loc[i],  4) for i in idx]
    sig_vals  = [_round(signal_line.loc[i],4) for i in idx]
    hist_vals = [_round(histogram.loc[i],  4) for i in idx]

    # ── Signal markers — only include bars where signal fires ─────────────────
    buy_signals  = []
    sell_signals = []
    for i_loc in range(0, n, step):
        bar_idx = df.index[i_loc]
        sig_val = int(signals.iloc[i_loc])
        if sig_val == 1:
            buy_signals.append({
                "date":  str(bar_idx.date()),
                "price": _round(float(df["Close"].iloc[i_loc])),
            })
        elif sig_val == -1:
            sell_signals.append({
                "date":  str(bar_idx.date()),
                "price": _round(float(df["Close"].iloc[i_loc])),
            })

    return {
        "symbol":       symbol,
        "stock_name":   stock["name"],
        "period":       period,
        "bars":         len(dates),
        "dates":        dates,
        "ohlcv": {
            "open":   opens,
            "high":   highs,
            "low":    lows,
            "close":  closes,
            "volume": volumes,
        },
        "rsi": {
            "values": rsi_vals,
            "period": rsi_period,
            "ob_level": 70,
            "os_level": 30,
        },
        "macd": {
            "macd":        macd_vals,
            "signal":      sig_vals,
            "histogram":   hist_vals,
            "fast":        macd_fast,
            "slow":        macd_slow_p,
            "signal_span": macd_sig,
        },
        "trade_signals": {
            "buy":  buy_signals,
            "sell": sell_signals,
        },
    }
