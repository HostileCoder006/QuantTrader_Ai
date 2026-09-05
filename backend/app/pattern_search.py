"""
Historical Pattern Search
--------------------------
Finds historical OHLCV windows whose normalized indicator fingerprints
are most similar to the *current* setup.

Method:
  1. Fetch up to 10 years of daily OHLCV for the symbol.
  2. Build a rolling indicator matrix: RSI(14), MACD histogram,
     price_vs_vwap_pct, price_vs_ema50_pct, volume_vs_avg_pct.
  3. Normalize each feature to [0,1] across the full history.
  4. Compute the current feature vector from the LAST bar.
  5. Slide a window backward and compute Euclidean distance.
  6. Select the closest N historical matches.
  7. For each match, compute FORWARD returns at 5D/20D/60D
     using only data AFTER the match date (strict no-lookahead).
  8. Aggregate: win rates, avg/median/best/worst returns.

IMPORTANT: The match window ENDS at least 60 days before the current
bar so that forward-return windows don't overlap with the present.
"""
from __future__ import annotations

import logging
from datetime import datetime

import numpy as np
import pandas as pd

from .market import get_ohlcv_history
from .nifty50 import stock_by_symbol

logger = logging.getLogger(__name__)

# How many similar patterns to find
TOP_N = 20
# Minimum separation in trading days from current date
MIN_LOOKBACK_GUARD = 65  # ensure 60D fwd window doesn't bleed into present
# Minimum history needed for meaningful search
MIN_HISTORY_DAYS = 252  # ~1 year


# ── Rolling indicator builders (series, no lookahead) ──────────────────────

def _rsi_series(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(com=period - 1, min_periods=period).mean()
    avg_loss = loss.ewm(com=period - 1, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi


def _macd_histogram_series(close: pd.Series) -> pd.Series:
    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    macd_line = ema12 - ema26
    signal_line = macd_line.ewm(span=9, adjust=False).mean()
    return macd_line - signal_line


def _vwap_vs_price_pct(df: pd.DataFrame) -> pd.Series:
    """Rolling 20-day VWAP deviation: (price - vwap) / vwap × 100."""
    typical = (df["High"] + df["Low"] + df["Close"]) / 3
    vol = df["Volume"].replace(0, np.nan)
    rolling_tp_vol = (typical * vol).rolling(20).sum()
    rolling_vol = vol.rolling(20).sum()
    vwap = rolling_tp_vol / rolling_vol
    return ((df["Close"] - vwap) / vwap.replace(0, np.nan)) * 100


def _price_vs_ema50_pct(close: pd.Series) -> pd.Series:
    ema50 = close.ewm(span=50, adjust=False).mean()
    return ((close - ema50) / ema50.replace(0, np.nan)) * 100


def _volume_vs_avg_pct(df: pd.DataFrame, window: int = 20) -> pd.Series:
    avg_vol = df["Volume"].rolling(window).mean()
    return ((df["Volume"] - avg_vol) / avg_vol.replace(0, np.nan)) * 100


def _build_feature_matrix(df: pd.DataFrame) -> pd.DataFrame:
    """Build the raw (un-normalized) feature matrix."""
    close = df["Close"]
    features = pd.DataFrame(index=df.index)
    features["rsi"] = _rsi_series(close)
    features["macd_hist"] = _macd_histogram_series(close)
    features["price_vs_vwap"] = _vwap_vs_price_pct(df)
    features["price_vs_ema50"] = _price_vs_ema50_pct(close)
    features["volume_vs_avg"] = _volume_vs_avg_pct(df)
    return features.dropna()


def _min_max_normalize(matrix: pd.DataFrame) -> pd.DataFrame:
    """Min-max normalize each column across the full matrix."""
    result = matrix.copy()
    for col in matrix.columns:
        col_min = matrix[col].min()
        col_max = matrix[col].max()
        rng = col_max - col_min
        if rng == 0:
            result[col] = 0.5
        else:
            result[col] = (matrix[col] - col_min) / rng
    return result


def _euclidean_distance(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.sqrt(np.sum((a - b) ** 2)))


# ── Forward return computation (strict no-lookahead) ───────────────────────

def _forward_return(close: pd.Series, idx: int, horizon: int) -> float | None:
    """
    Compute percentage return horizon days AFTER idx.
    Returns None if insufficient future data.
    """
    if idx + horizon >= len(close):
        return None
    entry_price = float(close.iloc[idx])
    exit_price = float(close.iloc[idx + horizon])
    if entry_price <= 0:
        return None
    return round(((exit_price - entry_price) / entry_price) * 100, 3)


# ── Main search function ────────────────────────────────────────────────────

def find_similar_patterns(symbol: str) -> dict:
    """
    Find historical setups most similar to today's indicator fingerprint.

    Returns:
      - similar_count: number of matches found
      - horizons: dict of 5D/20D/60D stats (win_rate, avg_return, median_return, best, worst)
      - matches: list of individual match dicts
      - current_features: today's normalised feature vector
      - data_available: bool
      - message: human-readable status
    """
    stock = stock_by_symbol(symbol)
    if not stock:
        return _unavailable("Unknown NIFTY 50 symbol")

    # Fetch ~10 years (yfinance max for daily = "10y")
    df = get_ohlcv_history(stock["yf_symbol"], period="10y")

    if df.empty or len(df) < MIN_HISTORY_DAYS:
        return _unavailable(
            f"DATA UNAVAILABLE — only {len(df)} days of history (need ≥{MIN_HISTORY_DAYS})"
        )

    # Build full feature matrix
    feature_matrix_raw = _build_feature_matrix(df)
    if len(feature_matrix_raw) < MIN_HISTORY_DAYS:
        return _unavailable("DATA UNAVAILABLE — insufficient valid rows after indicator warmup")

    # Align df and feature matrix on same index
    df_aligned = df.loc[feature_matrix_raw.index]

    # Normalize across entire history (global min-max — no future info leaks
    # because we're applying it to the historical search space, not predicting)
    normalized = _min_max_normalize(feature_matrix_raw)
    norm_values = normalized.values  # numpy array, shape (N, 5)
    close_aligned = df_aligned["Close"]

    # Current bar is the LAST row
    current_idx = len(normalized) - 1
    current_vec = norm_values[current_idx]

    # Search space: all bars that are at least MIN_LOOKBACK_GUARD days
    # before the current bar AND have enough future data for 60D window
    search_end = current_idx - MIN_LOOKBACK_GUARD

    if search_end < 50:
        return _unavailable("DATA UNAVAILABLE — not enough historical gap for reliable pattern search")

    # Compute distances for all valid historical bars
    distances = []
    for i in range(50, search_end):  # skip first 50 for indicator warmup
        dist = _euclidean_distance(current_vec, norm_values[i])
        distances.append((i, dist))

    # Sort by distance ascending (most similar first)
    distances.sort(key=lambda x: x[1])
    top_matches = distances[:TOP_N]

    # Compute forward returns for each match
    horizons_raw: dict[int, list[float]] = {5: [], 20: [], 60: []}
    matches_out: list[dict] = []

    for bar_idx, dist in top_matches:
        match_date = str(df_aligned.index[bar_idx].date())
        match_price = float(close_aligned.iloc[bar_idx])

        fwd: dict[str, float | None] = {}
        for h in [5, 20, 60]:
            ret = _forward_return(close_aligned, bar_idx, h)
            fwd[f"return_{h}d"] = ret
            if ret is not None:
                horizons_raw[h].append(ret)

        # Get raw indicator values at that bar for display
        raw_at_match = feature_matrix_raw.iloc[bar_idx]

        matches_out.append({
            "date": match_date,
            "price": round(match_price, 2),
            "similarity": round((1 - dist / (5 ** 0.5)) * 100, 1),  # 0-100 similarity score
            "distance": round(dist, 4),
            "rsi": round(float(raw_at_match["rsi"]), 1),
            "macd_hist": round(float(raw_at_match["macd_hist"]), 4),
            "price_vs_ema50_pct": round(float(raw_at_match["price_vs_ema50"]), 2),
            "volume_vs_avg_pct": round(float(raw_at_match["volume_vs_avg"]), 2),
            **fwd,
        })

    # Aggregate horizon statistics
    horizon_stats: dict[str, dict] = {}
    for h, returns in horizons_raw.items():
        if not returns:
            horizon_stats[f"{h}d"] = {"data_available": False}
            continue
        arr = np.array(returns)
        wins = int((arr > 0).sum())
        horizon_stats[f"{h}d"] = {
            "data_available": True,
            "sample_size": len(arr),
            "win_rate": round(wins / len(arr) * 100, 1),
            "avg_return": round(float(arr.mean()), 2),
            "median_return": round(float(np.median(arr)), 2),
            "best_return": round(float(arr.max()), 2),
            "worst_return": round(float(arr.min()), 2),
            "std_return": round(float(arr.std()), 2),
        }

    # Build current feature display
    raw_current = feature_matrix_raw.iloc[current_idx]
    current_features = {
        "rsi": round(float(raw_current["rsi"]), 1),
        "macd_hist": round(float(raw_current["macd_hist"]), 4),
        "price_vs_vwap_pct": round(float(raw_current["price_vs_vwap"]), 2),
        "price_vs_ema50_pct": round(float(raw_current["price_vs_ema50"]), 2),
        "volume_vs_avg_pct": round(float(raw_current["volume_vs_avg"]), 2),
    }

    history_start = str(df_aligned.index[0].date())
    history_end = str(df_aligned.index[current_idx - MIN_LOOKBACK_GUARD].date())

    return {
        "symbol": symbol,
        "similar_count": len(matches_out),
        "history_days": len(df),
        "history_start": history_start,
        "history_end": history_end,
        "current_features": current_features,
        "horizon_stats": horizon_stats,
        "matches": matches_out,
        "data_available": True,
        "message": (
            f"Found {len(matches_out)} similar historical setups from "
            f"{history_start} to {history_end}. "
            "Forward returns are evidence from past data, NOT guaranteed predictions."
        ),
    }


def _unavailable(reason: str) -> dict:
    return {
        "symbol": None,
        "similar_count": 0,
        "history_days": 0,
        "history_start": None,
        "history_end": None,
        "current_features": {},
        "horizon_stats": {},
        "matches": [],
        "data_available": False,
        "message": reason,
    }
