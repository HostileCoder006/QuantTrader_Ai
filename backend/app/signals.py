"""
Quantitative Signal Engine
--------------------------
All signals are derived from deterministic technical indicators.
No AI or ML is involved in signal generation.

Pipeline (generate_signal):
  1. Fetch OHLCV → compute indicators
  2. Fetch market regime → apply score adjustment
  3. Score indicators → derive signal label
  4. NO_TRADE override when regime is NO_TRADE and score < 40
  5. Log recommendation to journal (non-blocking, best-effort)
"""
from __future__ import annotations

import logging
from random import Random

import numpy as np
import pandas as pd

from .market import get_ohlcv_history
from .nifty50 import stock_by_symbol

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Technical indicator helpers — pure functions on pd.Series / pd.DataFrame
# ---------------------------------------------------------------------------

def calc_rsi(close: pd.Series, period: int = 14) -> float:
    """Relative Strength Index (Wilder smoothing)."""
    if len(close) < period + 1:
        return 50.0
    delta = close.diff().dropna()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(com=period - 1, min_periods=period).mean().iloc[-1]
    avg_loss = loss.ewm(com=period - 1, min_periods=period).mean().iloc[-1]
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(float(100 - (100 / (1 + rs))), 2)


def calc_macd(close: pd.Series) -> dict:
    """
    MACD line = EMA12 - EMA26
    Signal line = EMA9 of MACD line
    Histogram = MACD - Signal
    """
    if len(close) < 26:
        return {"macd": 0.0, "signal": 0.0, "histogram": 0.0, "crossover": "neutral"}

    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    macd_line = ema12 - ema26
    signal_line = macd_line.ewm(span=9, adjust=False).mean()
    histogram = macd_line - signal_line

    macd_val = round(float(macd_line.iloc[-1]), 4)
    signal_val = round(float(signal_line.iloc[-1]), 4)
    hist_val = round(float(histogram.iloc[-1]), 4)

    # Bullish crossover: histogram turned positive in last 2 bars
    if len(histogram) >= 2:
        prev_hist = float(histogram.iloc[-2])
        if prev_hist <= 0 and hist_val > 0:
            crossover = "bullish"
        elif prev_hist >= 0 and hist_val < 0:
            crossover = "bearish"
        else:
            crossover = "bullish" if hist_val > 0 else "bearish" if hist_val < 0 else "neutral"
    else:
        crossover = "neutral"

    return {
        "macd": macd_val,
        "signal": signal_val,
        "histogram": hist_val,
        "crossover": crossover,
    }


def calc_vwap(df: pd.DataFrame) -> float:
    """
    VWAP using the most recent trading day's bars.
    Falls back to a session VWAP from available daily data.
    """
    if df.empty or "Volume" not in df.columns:
        return 0.0
    typical_price = (df["High"] + df["Low"] + df["Close"]) / 3
    cum_tp_vol = (typical_price * df["Volume"]).cumsum()
    cum_vol = df["Volume"].cumsum()
    vwap_series = cum_tp_vol / cum_vol.replace(0, np.nan)
    return round(float(vwap_series.iloc[-1]), 2)


def calc_ema(close: pd.Series, period: int) -> float:
    if len(close) < period:
        return float(close.iloc[-1]) if len(close) > 0 else 0.0
    return round(float(close.ewm(span=period, adjust=False).mean().iloc[-1]), 2)


def calc_atr(df: pd.DataFrame, period: int = 14) -> float:
    """Average True Range."""
    if len(df) < period + 1:
        if len(df) > 0:
            return round(float((df["High"] - df["Low"]).mean()), 2)
        return 0.0
    high_low = df["High"] - df["Low"]
    high_prev_close = (df["High"] - df["Close"].shift(1)).abs()
    low_prev_close = (df["Low"] - df["Close"].shift(1)).abs()
    tr = pd.concat([high_low, high_prev_close, low_prev_close], axis=1).max(axis=1)
    atr = tr.ewm(com=period - 1, min_periods=period).mean()
    return round(float(atr.iloc[-1]), 2)


def calc_volume_change(df: pd.DataFrame) -> float:
    """
    Percentage change of today's volume vs 20-day average volume.
    Returns 0.0 if insufficient data.
    """
    if len(df) < 2:
        return 0.0
    today_vol = float(df["Volume"].iloc[-1])
    avg_vol = float(df["Volume"].iloc[:-1].tail(20).mean())
    if avg_vol == 0:
        return 0.0
    return round(((today_vol - avg_vol) / avg_vol) * 100, 2)


def calc_daily_momentum(close: pd.Series) -> float:
    """Percentage change of the last bar vs the bar before it."""
    if len(close) < 2:
        return 0.0
    return round(((float(close.iloc[-1]) - float(close.iloc[-2])) / float(close.iloc[-2])) * 100, 2)


# ---------------------------------------------------------------------------
# Weighted scoring system
# ---------------------------------------------------------------------------

def _score_indicators(
    current_price: float,
    vwap: float,
    macd: dict,
    rsi: float,
    volume_change: float,
    sentiment_score: int | None,
    ema20: float,
    ema50: float,
) -> tuple[int, dict]:
    """
    Returns (score 0-100, breakdown dict).

    Scoring rubric (max 100 pts):
      +20  Price above VWAP
      +20  MACD bullish crossover / bullish histogram
      +20  RSI between 50 and 70 (healthy uptrend without overbought)
      +20  Positive news sentiment (score > 10)
      +20  Volume spike > 20% above average

    Sell-pressure deductions:
      -10  RSI > 75 (overbought)
      -10  RSI < 30 (oversold / falling knife risk — down signal)
      -10  Price below EMA 50 (bearish trend)
    """
    score = 0
    breakdown: dict[str, int] = {}

    # 1. Price vs VWAP
    if vwap > 0 and current_price > vwap:
        score += 20
        breakdown["price_above_vwap"] = 20
    else:
        breakdown["price_above_vwap"] = 0

    # 2. MACD signal
    if macd["crossover"] == "bullish" or macd["histogram"] > 0:
        score += 20
        breakdown["macd_bullish"] = 20
    else:
        breakdown["macd_bullish"] = 0

    # 3. RSI zone
    if 50 <= rsi <= 70:
        score += 20
        breakdown["rsi_healthy"] = 20
    elif rsi > 75:
        score -= 10
        breakdown["rsi_overbought"] = -10
    elif rsi < 30:
        score -= 10
        breakdown["rsi_oversold"] = -10
    else:
        breakdown["rsi_zone"] = 0

    # 4. Sentiment
    if sentiment_score is not None and sentiment_score > 10:
        score += 20
        breakdown["positive_sentiment"] = 20
    else:
        breakdown["positive_sentiment"] = 0

    # 5. Volume spike
    if volume_change > 20:
        score += 20
        breakdown["volume_spike"] = 20
    else:
        breakdown["volume_spike"] = 0

    # 6. EMA trend filter
    if ema50 > 0 and current_price < ema50:
        score -= 10
        breakdown["below_ema50"] = -10
    else:
        breakdown["below_ema50"] = 0

    score = max(0, min(100, score))
    return score, breakdown


def _score_to_signal(score: int) -> dict:
    if score >= 80:
        return {"signal": "Strong Buy", "confidence": "High"}
    if score >= 60:
        return {"signal": "Buy", "confidence": "Medium"}
    if score >= 40:
        return {"signal": "Hold", "confidence": "Low"}
    if score >= 20:
        return {"signal": "Sell", "confidence": "Medium"}
    return {"signal": "Strong Sell", "confidence": "High"}


def _no_trade_signal() -> dict:
    """Signal returned when regime conditions make trading inadvisable."""
    return {"signal": "No Trade", "confidence": "High"}


def _calc_targets(current_price: float, atr: float) -> dict:
    """ATR-based entry, target, and stop-loss levels."""
    if atr <= 0:
        atr = current_price * 0.015  # fallback: 1.5% of price
    return {
        "entry": round(current_price, 2),
        "target": round(current_price + 2.0 * atr, 2),
        "stop_loss": round(current_price - 1.5 * atr, 2),
        "risk_reward": round(2.0 / 1.5, 2),
    }


def _risk_label(score: int) -> str:
    if score >= 70:
        return "Low"
    if score >= 45:
        return "Medium"
    return "High"


def _demo_indicators(symbol: str) -> dict:
    """Deterministic demo indicators when live data is unavailable."""
    rng = Random(symbol + "indicators_v2")
    rsi = round(rng.uniform(28, 74), 2)
    macd_val = round(rng.uniform(-8, 12), 4)
    hist = round(rng.uniform(-5, 8), 4)
    crossover = "bullish" if hist > 0 else "bearish"
    price = round(rng.uniform(180, 4200), 2)
    vwap = round(price * rng.uniform(0.97, 1.03), 2)
    ema20 = round(price * rng.uniform(0.97, 1.03), 2)
    ema50 = round(price * rng.uniform(0.93, 1.05), 2)
    volume_change = round(rng.uniform(-25, 65), 2)
    momentum = round(rng.uniform(-2.5, 3.0), 2)
    atr = round(price * rng.uniform(0.008, 0.025), 2)
    return {
        "rsi": rsi,
        "macd": {"macd": macd_val, "signal": round(macd_val * 0.9, 4), "histogram": hist, "crossover": crossover},
        "vwap": vwap,
        "ema20": ema20,
        "ema50": ema50,
        "volume_change": volume_change,
        "daily_momentum": momentum,
        "atr": atr,
        "current_price": price,
        "source": "demo",
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def compute_indicators(symbol: str) -> dict:
    """
    Compute all technical indicators for a given NIFTY 50 symbol.
    Returns a dict with all indicator values and their source tag.
    """
    stock = stock_by_symbol(symbol)
    if not stock:
        raise ValueError(f"Unknown NIFTY 50 symbol: {symbol}")

    df = get_ohlcv_history(stock["yf_symbol"])
    if df.empty or len(df) < 5:
        logger.warning("Insufficient OHLCV data for %s — returning demo indicators", symbol)
        return {**_demo_indicators(symbol), "symbol": symbol, "name": stock["name"]}

    close = df["Close"]
    current_price = float(close.iloc[-1])

    rsi = calc_rsi(close)
    macd = calc_macd(close)
    vwap = calc_vwap(df)
    ema20 = calc_ema(close, 20)
    ema50 = calc_ema(close, 50)
    atr = calc_atr(df)
    volume_change = calc_volume_change(df)
    daily_momentum = calc_daily_momentum(close)

    return {
        "symbol": symbol,
        "name": stock["name"],
        "current_price": round(current_price, 2),
        "rsi": rsi,
        "macd": macd,
        "vwap": vwap,
        "ema20": ema20,
        "ema50": ema50,
        "atr": atr,
        "volume_change": volume_change,
        "daily_momentum": daily_momentum,
        "source": "live",
    }


def generate_signal(
    symbol: str,
    sentiment_score: int | None = None,
    log_to_journal: bool = False,
    sentiment_data: dict | None = None,
) -> dict:
    """
    Generate a full quantitative trading signal for a symbol.

    Steps:
      1. Compute technical indicators from OHLCV.
      2. Fetch current market regime (cached, 5-min TTL).
      3. Apply regime score adjustment.
      4. Override to NO_TRADE if regime is NO_TRADE and score < 40.
      5. Compute ATR targets.
      6. Optionally log to recommendation journal.

    Returns:
        symbol, name, signal, confidence, score, score_breakdown,
        indicators, targets, risk, regime_context, data_source
    """
    indicators = compute_indicators(symbol)
    stock = stock_by_symbol(symbol)
    sector = stock.get("sector", "Unknown") if stock else "Unknown"

    # ── Step 1: base score from indicators ──
    score, breakdown = _score_indicators(
        current_price=indicators["current_price"],
        vwap=indicators["vwap"],
        macd=indicators["macd"],
        rsi=indicators["rsi"],
        volume_change=indicators["volume_change"],
        sentiment_score=sentiment_score,
        ema20=indicators["ema20"],
        ema50=indicators["ema50"],
    )

    # ── Step 2: fetch regime (non-blocking) ──
    regime_context: dict = {}
    try:
        from .regime import get_market_regime  # lazy import avoids circular
        regime_context = get_market_regime(use_cache_seconds=300)
    except Exception as exc:
        logger.warning("Regime fetch failed for %s: %s", symbol, exc)

    # ── Step 3: apply regime score adjustment ──
    regime_adj = int(regime_context.get("score_adjustment", 0))
    raw_score = score
    score = max(0, min(100, score + regime_adj))
    breakdown["regime_adjustment"] = regime_adj

    # ── Step 4: determine signal label ──
    regime_name = regime_context.get("regime", "NEUTRAL")
    if regime_name == "NO_TRADE" and raw_score < 40:
        signal_info = _no_trade_signal()
    else:
        signal_info = _score_to_signal(score)

    targets = _calc_targets(indicators["current_price"], indicators["atr"])

    result = {
        "symbol": symbol,
        "name": indicators.get("name", symbol),
        "sector": sector,
        "signal": signal_info["signal"],
        "confidence": signal_info["confidence"],
        "score": score,
        "raw_score": raw_score,
        "score_breakdown": breakdown,
        "indicators": {
            "rsi": indicators["rsi"],
            "macd": indicators["macd"],
            "vwap": indicators["vwap"],
            "ema20": indicators["ema20"],
            "ema50": indicators["ema50"],
            "atr": indicators["atr"],
            "volume_change": indicators["volume_change"],
            "daily_momentum": indicators["daily_momentum"],
            "current_price": indicators["current_price"],
        },
        "targets": targets,
        "risk": _risk_label(score),
        "regime_context": {
            "regime": regime_name,
            "score_adjustment": regime_adj,
            "volatility_20d": regime_context.get("volatility_20d"),
            "rsi": regime_context.get("rsi"),
            "data_available": regime_context.get("data_available", False),
        },
        "data_source": indicators.get("source", "unknown"),
    }

    # ── Step 5: optional journal logging ──
    if log_to_journal:
        try:
            from .journal import log_recommendation  # lazy import
            log_recommendation(result, regime=regime_context, sentiment=sentiment_data)
        except Exception as exc:
            logger.warning("Journal log failed for %s: %s", symbol, exc)

    return result
