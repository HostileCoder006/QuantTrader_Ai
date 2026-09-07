from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from .market import get_ohlcv_history
from .nifty50 import NIFTY_INDEX
from .storage import get_connection

logger = logging.getLogger(__name__)

REGIME_BULLISH = "BULLISH"
REGIME_NEUTRAL = "NEUTRAL"
REGIME_BEARISH = "BEARISH"
REGIME_HIGH_VOL = "HIGH_VOLATILITY"
REGIME_NO_TRADE = "NO_TRADE"

# Score adjustments applied to individual stock signal scores
_REGIME_ADJUSTMENTS: dict[str, int] = {
    REGIME_BULLISH: +10,
    REGIME_NEUTRAL: 0,
    REGIME_BEARISH: -15,
    REGIME_HIGH_VOL: -10,
    REGIME_NO_TRADE: -25,
}


def _ema_series(close: pd.Series, span: int) -> pd.Series:
    return close.ewm(span=span, adjust=False).mean()


def _rsi_series(close: pd.Series, period: int = 14) -> float:
    """Returns the latest RSI scalar."""
    if len(close) < period + 1:
        return 50.0
    delta = close.diff().dropna()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(com=period - 1, min_periods=period).mean().iloc[-1]
    avg_loss = loss.ewm(com=period - 1, min_periods=period).mean().iloc[-1]
    if avg_loss == 0:
        return 100.0
    return round(float(100 - (100 / (1 + avg_gain / avg_loss))), 2)


def _annualised_volatility(close: pd.Series, window: int = 20) -> float:
    """Annualised historical volatility over a rolling window."""
    if len(close) < window + 1:
        return 0.0
    daily_returns = close.pct_change().dropna()
    vol = daily_returns.tail(window).std() * (252 ** 0.5)
    return round(float(vol) * 100, 2)  # as percentage


def _compute_regime_from_df(df: pd.DataFrame) -> dict:
    """
    Compute regime from a NIFTY OHLCV DataFrame.
    All computations use only data available up to the last bar (no lookahead).
    """
    if df.empty or len(df) < 30:
        return _unavailable_regime()

    close = df["Close"]
    current_price = float(close.iloc[-1])

    ema20 = float(_ema_series(close, 20).iloc[-1])
    ema50 = float(_ema_series(close, 50).iloc[-1])
    ema200 = float(_ema_series(close, 200).iloc[-1]) if len(close) >= 200 else None

    rsi = _rsi_series(close)
    vol_20d = _annualised_volatility(close, 20)

    trend_score = 0
    if current_price > ema20:
        trend_score += 1
    if current_price > ema50:
        trend_score += 1
    if ema200 is not None and current_price > ema200:
        trend_score += 1

    ema_aligned_bullish = ema20 > ema50
    ema_aligned_bearish = ema20 < ema50

    high_vol = vol_20d > 25.0   # >25% annualised = high volatility
    extreme_vol = vol_20d > 40.0

    rsi_bullish = 50 < rsi < 75
    rsi_bearish = rsi < 40
    rsi_overbought = rsi >= 75

    if extreme_vol:
        regime = REGIME_NO_TRADE
    elif high_vol:
        regime = REGIME_HIGH_VOL
    elif trend_score >= 2 and ema_aligned_bullish and rsi_bullish:
        regime = REGIME_BULLISH
    elif trend_score == 0 and ema_aligned_bearish and rsi_bearish:
        regime = REGIME_BEARISH
    elif trend_score <= 1 and ema_aligned_bearish:
        regime = REGIME_BEARISH
    else:
        regime = REGIME_NEUTRAL

    # Additional NO_TRADE: deep bear + overbought RSI (bear trap)
    if ema_aligned_bearish and rsi_overbought:
        regime = REGIME_NO_TRADE

    details = {
        "trend_score": trend_score,
        "ema_aligned": "bullish" if ema_aligned_bullish else "bearish",
        "rsi_zone": (
            "overbought" if rsi >= 75
            else "bullish" if rsi_bullish
            else "bearish" if rsi_bearish
            else "neutral"
        ),
        "volatility_regime": (
            "extreme" if extreme_vol
            else "high" if high_vol
            else "normal"
        ),
    }

    return {
        "regime": regime,
        "nifty_price": round(current_price, 2),
        "ema20": round(ema20, 2),
        "ema50": round(ema50, 2),
        "ema200": round(ema200, 2) if ema200 is not None else None,
        "rsi": rsi,
        "volatility_20d": vol_20d,
        "score_adjustment": _REGIME_ADJUSTMENTS[regime],
        "details": details,
        "data_available": True,
    }


def _unavailable_regime() -> dict:
    return {
        "regime": REGIME_NEUTRAL,
        "nifty_price": None,
        "ema20": None,
        "ema50": None,
        "ema200": None,
        "rsi": None,
        "volatility_20d": None,
        "score_adjustment": 0,
        "details": {"note": "DATA UNAVAILABLE — insufficient NIFTY history"},
        "data_available": False,
    }


def get_market_regime(use_cache_seconds: int = 300) -> dict:
    """
    Return the current NIFTY 50 market regime.
    Caches result in DB for `use_cache_seconds` (default 5 min) to avoid
    fetching OHLCV on every single signal call.
    """
    # Try to read from cache
    try:
        with get_connection() as db:
            row = db.execute(
                """
                SELECT regime, nifty_value, ema20, ema50, ema200, rsi,
                       volatility_20d, score_adjustment, details_json, timestamp
                FROM market_regime
                ORDER BY id DESC LIMIT 1
                """
            ).fetchone()
            if row:
                ts = datetime.fromisoformat(row["timestamp"])
                age = (datetime.now(timezone.utc) - ts.replace(tzinfo=timezone.utc)).total_seconds()
                if age < use_cache_seconds:
                    details = json.loads(row["details_json"] or "{}")
                    return {
                        "regime": row["regime"],
                        "nifty_price": row["nifty_value"],
                        "ema20": row["ema20"],
                        "ema50": row["ema50"],
                        "ema200": row["ema200"],
                        "rsi": row["rsi"],
                        "volatility_20d": row["volatility_20d"],
                        "score_adjustment": row["score_adjustment"],
                        "details": details,
                        "data_available": True,
                        "cached_at": row["timestamp"],
                    }
    except Exception as exc:
        logger.warning("Regime cache read failed: %s", exc)

    # Compute fresh
    df = get_ohlcv_history(NIFTY_INDEX["yf_symbol"], period="2y")
    result = _compute_regime_from_df(df)

    # Persist to DB
    try:
        with get_connection() as db:
            db.execute(
                """
                INSERT INTO market_regime
                    (timestamp, regime, nifty_value, ema20, ema50, ema200,
                     rsi, volatility_20d, score_adjustment, details_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    datetime.now(timezone.utc).isoformat(),
                    result["regime"],
                    result.get("nifty_price"),
                    result.get("ema20"),
                    result.get("ema50"),
                    result.get("ema200"),
                    result.get("rsi"),
                    result.get("volatility_20d"),
                    result.get("score_adjustment", 0),
                    json.dumps(result.get("details", {})),
                ),
            )
    except Exception as exc:
        logger.warning("Regime DB write failed: %s", exc)

    return result


def get_regime_history(limit: int = 30) -> list[dict]:
    """Return the last N regime readings from DB."""
    try:
        with get_connection() as db:
            rows = db.execute(
                """
                SELECT timestamp, regime, nifty_value, ema20, ema50,
                       rsi, volatility_20d, score_adjustment
                FROM market_regime
                ORDER BY id DESC LIMIT ?
                """,
                (limit,),
            ).fetchall()
            return [dict(r) for r in rows]
    except Exception as exc:
        logger.warning("Regime history read failed: %s", exc)
        return []
