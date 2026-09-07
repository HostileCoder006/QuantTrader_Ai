"""
Short-Term Opportunity Scanner
================================
Purely deterministic quantitative engine — no AI involved here.
Ranks the NIFTY 50 by a composite Opportunity Score tailored to the
user's horizon and risk profile.

Pipeline
--------
1.  Fetch regime (cached) → sets universe-wide regime context.
2.  Scan all 50 stocks in parallel (re-uses existing compute_indicators).
3.  Score each stock on 8 quantitative factors (0-100).
4.  Apply horizon-specific weights.
5.  Apply risk-profile filter / penalty.
6.  Add historical pattern evidence for top-30 (re-uses find_similar_patterns
    but with a lightweight 2-year fetch instead of 10-year for speed).
7.  Return top-30 ranked candidates with full quant detail.
8.  Separately return top-10 for committee analysis (called by routes).

Horizon IDs
-----------
  "1-5d"    1–5 trading days
  "1-2w"    1–2 weeks (~5–10 days)
  "2-4w"    2–4 weeks (~10–20 days)
  "1-3m"    1–3 months (~20–60 days)

Risk Profiles
-------------
  "conservative"   Low volatility, high RS, positive regime only
  "balanced"       Default — no strong filter
  "aggressive"     Higher scores to volatile momentum plays
"""
from __future__ import annotations

import logging
import math
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from .market import get_ohlcv_history
from .nifty50 import NIFTY_50_STOCKS, NIFTY_INDEX, stock_by_symbol
from .regime import get_market_regime
from .signals import (
    calc_atr,
    calc_ema,
    calc_macd,
    calc_rsi,
    calc_volume_change,
    calc_daily_momentum,
    compute_indicators,
)

logger = logging.getLogger(__name__)

# ── Horizon config ─────────────────────────────────────────────────────────

HORIZONS: dict[str, dict] = {
    "1-5d": {
        "label": "1–5 Days",
        "days": 5,
        "pattern_horizon": "5d",
        "weights": {
            "momentum":    0.30,
            "macd":        0.20,
            "rsi":         0.15,
            "volume":      0.20,
            "vwap":        0.10,
            "trend":       0.05,
            "risk_reward": 0.00,
            "sector":      0.00,
        },
    },
    "1-2w": {
        "label": "1–2 Weeks",
        "days": 10,
        "pattern_horizon": "5d",
        "weights": {
            "momentum":    0.20,
            "macd":        0.20,
            "rsi":         0.20,
            "volume":      0.15,
            "vwap":        0.10,
            "trend":       0.10,
            "risk_reward": 0.05,
            "sector":      0.00,
        },
    },
    "2-4w": {
        "label": "2–4 Weeks",
        "days": 20,
        "pattern_horizon": "20d",
        "weights": {
            "momentum":    0.15,
            "macd":        0.15,
            "rsi":         0.20,
            "volume":      0.10,
            "vwap":        0.10,
            "trend":       0.20,
            "risk_reward": 0.05,
            "sector":      0.05,
        },
    },
    "1-3m": {
        "label": "1–3 Months",
        "days": 60,
        "pattern_horizon": "60d",
        "weights": {
            "momentum":    0.10,
            "macd":        0.10,
            "rsi":         0.15,
            "volume":      0.10,
            "vwap":        0.05,
            "trend":       0.30,
            "risk_reward": 0.10,
            "sector":      0.10,
        },
    },
}

# ── Indicator series helpers (for sector-strength breadth) ─────────────────

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


# ── Factor scorers (0–100 each) ─────────────────────────────────────────────

def _score_momentum(daily_mom: float, atr_pct: float) -> float:
    """Score based on recent price momentum normalised by ATR."""
    if atr_pct <= 0:
        return 50.0
    z = daily_mom / max(atr_pct, 0.1)
    # sigmoid-ish: z in [-3,+3] maps to [10, 90]
    score = 50 + 35 * math.tanh(z / 1.5)
    return round(min(100, max(0, score)), 1)


def _score_macd(macd_dict: dict) -> float:
    crossover = macd_dict.get("crossover", "neutral")
    hist = float(macd_dict.get("histogram", 0))
    if crossover == "bullish":
        base = 75.0
    elif crossover == "bearish":
        base = 25.0
    else:
        base = 50.0
    # bonus/penalty for histogram magnitude (capped at ±15)
    hist_bonus = min(15.0, max(-15.0, hist * 20))
    return round(min(100, max(0, base + hist_bonus)), 1)


def _score_rsi(rsi: float) -> float:
    """Sweet spot 50–70; deductions for overbought/oversold extremes."""
    if 55 <= rsi <= 68:
        return 85.0
    if 50 <= rsi < 55:
        return 70.0
    if 68 < rsi <= 75:
        return 60.0
    if 40 <= rsi < 50:
        return 45.0
    if rsi > 75:           # overbought
        return 30.0
    if 30 <= rsi < 40:
        return 35.0
    return 20.0            # oversold / falling knife


def _score_volume(vol_change: float) -> float:
    """Volume spike vs 20-day average."""
    if vol_change >= 80:
        return 95.0
    if vol_change >= 40:
        return 82.0
    if vol_change >= 20:
        return 70.0
    if vol_change >= 0:
        return 55.0
    if vol_change >= -20:
        return 40.0
    return 25.0


def _score_vwap(price: float, vwap: float) -> float:
    if vwap <= 0:
        return 50.0
    pct = (price - vwap) / vwap * 100
    if pct >= 2:
        return 85.0
    if pct >= 0:
        return 70.0
    if pct >= -2:
        return 40.0
    return 20.0


def _score_trend(price: float, ema20: float, ema50: float) -> float:
    """EMA alignment — strongest when price > EMA20 > EMA50."""
    if price > ema20 > ema50:
        return 90.0
    if price > ema20 and price > ema50:
        return 75.0
    if price > ema50:
        return 60.0
    if price > ema20:
        return 50.0
    if price < ema20 < ema50:
        return 15.0
    return 30.0


def _score_risk_reward(atr: float, price: float) -> float:
    """
    Proxy risk/reward: higher ATR relative to price = more potential swing.
    ATR/price % sweet spot: 1.5–3.5 % for short-term plays.
    """
    if price <= 0:
        return 50.0
    atr_pct = (atr / price) * 100
    if 1.5 <= atr_pct <= 3.5:
        return 80.0
    if 1.0 <= atr_pct < 1.5 or 3.5 < atr_pct <= 5.0:
        return 65.0
    if atr_pct > 5.0:
        return 45.0  # too volatile
    return 40.0       # too low volatility


def _score_sector(sector: str, sector_strength: dict[str, float]) -> float:
    """Sector momentum score (0–100) based on average member momentum."""
    if not sector or not sector_strength:
        return 50.0
    strength = sector_strength.get(sector, 50.0)
    return round(min(100, max(0, strength)), 1)


# ── Sector strength computation ─────────────────────────────────────────────

def _compute_sector_strength(all_indicators: list[dict]) -> dict[str, float]:
    """
    Average the raw quant score (0-100) for each sector using the
    already-computed indicator dicts.  Quick proxy for sector breadth.
    """
    sector_scores: dict[str, list[float]] = {}
    for ind in all_indicators:
        sector = ind.get("sector", "Unknown")
        score = ind.get("_raw_score", 50.0)
        sector_scores.setdefault(sector, []).append(score)
    return {s: round(float(np.mean(v)), 1) for s, v in sector_scores.items()}


# ── Per-stock opportunity score ─────────────────────────────────────────────

def _score_stock(
    indicators: dict,
    weights: dict[str, float],
    sector_strength: dict[str, float],
    regime: dict,
    risk_profile: str,
) -> dict:
    """
    Compute weighted Opportunity Score for one stock.
    Returns enriched dict with all factor scores.
    """
    price = indicators.get("current_price", 0.0)
    atr   = indicators.get("atr", price * 0.015)
    rsi   = indicators.get("rsi", 50.0)
    macd  = indicators.get("macd", {})
    vwap  = indicators.get("vwap", price)
    ema20 = indicators.get("ema20", price)
    ema50 = indicators.get("ema50", price)
    vol_chg = indicators.get("volume_change", 0.0)
    mom   = indicators.get("daily_momentum", 0.0)
    sector = indicators.get("sector", "Unknown")
    atr_pct = (atr / price * 100) if price > 0 else 1.5

    factors = {
        "momentum":    _score_momentum(mom, atr_pct),
        "macd":        _score_macd(macd),
        "rsi":         _score_rsi(rsi),
        "volume":      _score_volume(vol_chg),
        "vwap":        _score_vwap(price, vwap),
        "trend":       _score_trend(price, ema20, ema50),
        "risk_reward": _score_risk_reward(atr, price),
        "sector":      _score_sector(sector, sector_strength),
    }

    # Weighted sum
    raw_opp_score = sum(
        factors[k] * weights.get(k, 0.0) for k in factors
    )

    # ── Regime adjustment ──────────────────────────────────────────────────
    regime_name = regime.get("regime", "NEUTRAL")
    if regime_name == "BULLISH":
        raw_opp_score = min(100, raw_opp_score * 1.08)
    elif regime_name == "BEARISH":
        raw_opp_score = raw_opp_score * 0.85
    elif regime_name == "HIGH_VOLATILITY":
        raw_opp_score = raw_opp_score * 0.90
    elif regime_name == "NO_TRADE":
        raw_opp_score = raw_opp_score * 0.70

    # ── Risk-profile adjustment ────────────────────────────────────────────
    if risk_profile == "conservative":
        # Penalise high ATR stocks and oversold RSI
        if atr_pct > 3.0:
            raw_opp_score *= 0.80
        if rsi < 40:
            raw_opp_score *= 0.75
        # Require price above EMA50
        if price < ema50:
            raw_opp_score *= 0.70
    elif risk_profile == "aggressive":
        # Bonus for high momentum + volume spikes
        if mom > 1.0 and vol_chg > 30:
            raw_opp_score = min(100, raw_opp_score * 1.10)

    opp_score = round(min(100, max(0, raw_opp_score)), 1)

    # ── ATR-based targets ──────────────────────────────────────────────────
    entry = price
    target = round(price + 2.0 * atr, 2)
    stop_loss = round(price - 1.5 * atr, 2)
    rr_ratio = 1.33

    return {
        **indicators,
        "opportunity_score": opp_score,
        "factor_scores": factors,
        "entry": entry,
        "target": target,
        "stop_loss": stop_loss,
        "risk_reward": rr_ratio,
        "atr_pct": round(atr_pct, 2),
    }


# ── Historical environment analysis (lightweight version) ──────────────────

def _pattern_analysis_fast(
    symbol: str,
    horizon_key: str,
    min_history_days: int = 180,
) -> dict:
    """
    Faster variant of find_similar_patterns: uses 5-year history (not 10),
    fewer features, returns horizon-specific stats.
    Called for top-10 candidates only.
    """
    from .pattern_search import (
        _build_feature_matrix,
        _euclidean_distance,
        _forward_return,
        _min_max_normalize,
    )

    stock = stock_by_symbol(symbol)
    if not stock:
        return {"data_available": False, "message": "Unknown symbol"}

    # Map horizon key to number of days
    horizon_days_map = {
        "1-5d": 5,
        "1-2w": 10,
        "2-4w": 20,
        "1-3m": 60,
    }
    # Additional horizons for context
    check_horizons = {
        "1-5d":  [5, 10],
        "1-2w":  [5, 10, 20],
        "2-4w":  [10, 20, 30],
        "1-3m":  [20, 30, 60],
    }.get(horizon_key, [5, 20, 60])

    df = get_ohlcv_history(stock["yf_symbol"], period="5y")
    if df.empty or len(df) < min_history_days:
        return {
            "data_available": False,
            "message": f"Only {len(df)} days of history available",
        }

    feature_matrix_raw = _build_feature_matrix(df)
    if len(feature_matrix_raw) < min_history_days:
        return {"data_available": False, "message": "Insufficient rows after warmup"}

    df_aligned = df.loc[feature_matrix_raw.index]
    normalized = _min_max_normalize(feature_matrix_raw)
    norm_values = normalized.values
    close_aligned = df_aligned["Close"]

    current_idx = len(normalized) - 1
    current_vec = norm_values[current_idx]

    # Guard: leave 60+ days for forward returns
    search_end = current_idx - 65
    if search_end < 40:
        return {"data_available": False, "message": "Not enough historical gap"}

    distances = []
    for i in range(40, search_end):
        dist = _euclidean_distance(current_vec, norm_values[i])
        distances.append((i, dist))

    distances.sort(key=lambda x: x[1])
    top_n = min(20, len(distances))
    top_matches = distances[:top_n]

    horizon_returns: dict[int, list[float]] = {h: [] for h in check_horizons}
    for bar_idx, _ in top_matches:
        for h in check_horizons:
            ret = _forward_return(close_aligned, bar_idx, h)
            if ret is not None:
                horizon_returns[h].append(ret)

    horizon_stats: dict[str, dict] = {}
    for h in check_horizons:
        returns = horizon_returns[h]
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

    primary_horizon = f"{horizon_days_map.get(horizon_key, 20)}d"
    primary_stat = horizon_stats.get(primary_horizon, {"data_available": False})

    return {
        "data_available": True,
        "symbol": symbol,
        "similar_setups": top_n,
        "history_years": round(len(df) / 252, 1),
        "primary_horizon": primary_horizon,
        "primary_stat": primary_stat,
        "all_horizons": horizon_stats,
        "message": (
            f"Found {top_n} similar setups in {round(len(df)/252,1)} years of history. "
            "Past evidence — not a guarantee."
        ),
    }


# ── Risk classification ─────────────────────────────────────────────────────

def _risk_label(atr_pct: float, regime: str, rsi: float) -> str:
    if regime in ("HIGH_VOLATILITY", "NO_TRADE") or atr_pct > 4.0 or rsi > 75:
        return "High"
    if atr_pct > 2.5 or rsi < 35:
        return "Medium"
    return "Low"


def _estimated_return_range(
    opp_score: float,
    atr_pct: float,
    horizon_key: str,
    pattern_stat: dict,
) -> tuple[float, float]:
    """
    Conservative estimate of return range based on ATR and horizon.
    Uses historical pattern data if available.
    If not, uses a simple ATR × holding_period proxy.
    Clearly marked as an ESTIMATE, not a prediction.
    """
    horizon_days = HORIZONS.get(horizon_key, {}).get("days", 20)

    if pattern_stat.get("data_available"):
        avg = pattern_stat.get("avg_return", 0.0)
        std = pattern_stat.get("std_return", abs(avg) * 0.8)
        lo = round(avg - 0.5 * std, 1)
        hi = round(avg + 0.5 * std, 1)
    else:
        # Fallback: scale by ATR and horizon, biased by score
        base = atr_pct * math.sqrt(horizon_days) * 0.4
        bias = (opp_score - 50) / 100 * base
        lo = round(-base + bias, 1)
        hi = round(base + bias, 1)

    return lo, hi


# ── Confidence from quant factors ──────────────────────────────────────────

def _quant_confidence(opp_score: float, regime: str, pattern_stat: dict) -> int:
    """0–100 confidence score from quant evidence."""
    base = opp_score
    if regime == "BULLISH":
        base = min(100, base + 8)
    elif regime == "BEARISH":
        base = max(0, base - 12)
    elif regime in ("HIGH_VOLATILITY", "NO_TRADE"):
        base = max(0, base - 10)

    if pattern_stat.get("data_available"):
        win_rate = pattern_stat.get("win_rate", 50)
        pattern_adj = (win_rate - 50) * 0.3
        base = min(100, max(0, base + pattern_adj))

    return round(base)


# ── Main scan function ──────────────────────────────────────────────────────

def run_opportunity_scan(
    horizon: str = "2-4w",
    risk_profile: str = "balanced",
    top_n_quant: int = 30,
    top_n_pattern: int = 10,
    include_pattern: bool = True,
) -> dict:
    """
    Full opportunity scan for the NIFTY 50.

    Parameters
    ----------
    horizon        : one of "1-5d", "1-2w", "2-4w", "1-3m"
    risk_profile   : "conservative", "balanced", "aggressive"
    top_n_quant    : how many stocks to keep after quant pass (default 30)
    top_n_pattern  : how many to enrich with historical patterns (default 10)
    include_pattern: whether to run pattern analysis

    Returns
    -------
    {
        "scan_id": str,
        "horizon": str,
        "risk_profile": str,
        "regime": dict,
        "scanned_at": str,
        "candidates": list[dict],   # top_n_quant results
        "top_for_committee": list[str],  # top 10 symbols
        "total_scanned": int,
        "message": str,
    }
    """
    if horizon not in HORIZONS:
        horizon = "2-4w"
    if risk_profile not in ("conservative", "balanced", "aggressive"):
        risk_profile = "balanced"

    hz = HORIZONS[horizon]
    weights = hz["weights"]
    scan_id = f"{horizon}_{risk_profile}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"

    # ── Step 1: Regime ──────────────────────────────────────────────────────
    try:
        regime = get_market_regime(use_cache_seconds=300)
    except Exception as exc:
        logger.warning("Regime fetch failed in scanner: %s", exc)
        regime = {"regime": "NEUTRAL", "data_available": False, "score_adjustment": 0}

    regime_name = regime.get("regime", "NEUTRAL")

    # ── Step 2: Scan all 50 in parallel ────────────────────────────────────
    raw_indicators: list[dict] = []

    def _fetch_stock(stock: dict) -> dict | None:
        try:
            ind = compute_indicators(stock["symbol"])
            # Add sector to indicators
            ind["sector"] = stock.get("sector", "Unknown")
            # Quick raw score for sector strength computation
            from .signals import _score_indicators, _calc_targets
            raw_score, _ = _score_indicators(
                current_price=ind["current_price"],
                vwap=ind["vwap"],
                macd=ind["macd"],
                rsi=ind["rsi"],
                volume_change=ind["volume_change"],
                sentiment_score=None,
                ema20=ind["ema20"],
                ema50=ind["ema50"],
            )
            ind["_raw_score"] = raw_score
            return ind
        except Exception as exc:
            logger.warning("Indicator fetch failed for %s: %s", stock["symbol"], exc)
            return None

    with ThreadPoolExecutor(max_workers=10) as ex:
        futures = {ex.submit(_fetch_stock, s): s for s in NIFTY_50_STOCKS}
        for fut in as_completed(futures):
            result = fut.result()
            if result is not None:
                raw_indicators.append(result)

    # ── Step 3: Sector strength ─────────────────────────────────────────────
    sector_strength = _compute_sector_strength(raw_indicators)

    # ── Step 4: Score every stock ───────────────────────────────────────────
    scored: list[dict] = []
    for ind in raw_indicators:
        try:
            scored_stock = _score_stock(
                indicators=ind,
                weights=weights,
                sector_strength=sector_strength,
                regime=regime,
                risk_profile=risk_profile,
            )
            scored_stock["risk_label"] = _risk_label(
                scored_stock["atr_pct"], regime_name, ind.get("rsi", 50)
            )
            scored.append(scored_stock)
        except Exception as exc:
            logger.warning("Scoring failed for %s: %s", ind.get("symbol"), exc)

    # Sort by opportunity score descending
    scored.sort(key=lambda x: x["opportunity_score"], reverse=True)

    # ── Step 5: Apply risk profile hard filters ─────────────────────────────
    if risk_profile == "conservative":
        # Require price above EMA50 and not in NO_TRADE regime
        scored = [
            s for s in scored
            if s.get("current_price", 0) > s.get("ema50", 0)
               and regime_name != "NO_TRADE"
        ]
    elif risk_profile == "aggressive":
        # Keep even if regime is bearish — aggressive traders may short
        pass

    # Keep top N
    top_quant = scored[:top_n_quant]

    # ── Step 6: Pattern analysis for top-10 ────────────────────────────────
    top_10_symbols = [s["symbol"] for s in top_quant[:top_n_pattern]]

    if include_pattern:
        pattern_results: dict[str, dict] = {}

        def _fetch_pattern(sym: str) -> tuple[str, dict]:
            try:
                return sym, _pattern_analysis_fast(sym, horizon)
            except Exception as exc:
                logger.warning("Pattern analysis failed for %s: %s", sym, exc)
                return sym, {"data_available": False, "message": str(exc)}

        with ThreadPoolExecutor(max_workers=5) as ex:
            futures_p = {ex.submit(_fetch_pattern, sym): sym for sym in top_10_symbols}
            for fut in as_completed(futures_p):
                sym, pat = fut.result()
                pattern_results[sym] = pat

        # Merge pattern results into candidates
        for stock in top_quant:
            sym = stock["symbol"]
            if sym in pattern_results:
                stock["pattern"] = pattern_results[sym]
                # Recalculate confidence with pattern data
                primary_stat = (
                    pattern_results[sym].get("primary_stat", {})
                    if pattern_results[sym].get("data_available")
                    else {}
                )
                stock["confidence"] = _quant_confidence(
                    stock["opportunity_score"], regime_name, primary_stat
                )
                # Estimated return range
                lo, hi = _estimated_return_range(
                    stock["opportunity_score"],
                    stock["atr_pct"],
                    horizon,
                    primary_stat,
                )
                stock["estimated_return_lo"] = lo
                stock["estimated_return_hi"] = hi
            else:
                stock["pattern"] = {"data_available": False}
                stock["confidence"] = _quant_confidence(
                    stock["opportunity_score"], regime_name, {}
                )
                lo, hi = _estimated_return_range(
                    stock["opportunity_score"], stock["atr_pct"], horizon, {}
                )
                stock["estimated_return_lo"] = lo
                stock["estimated_return_hi"] = hi
    else:
        # No pattern — compute confidence from quant only
        for stock in top_quant:
            stock["pattern"] = {"data_available": False}
            stock["confidence"] = _quant_confidence(
                stock["opportunity_score"], regime_name, {}
            )
            lo, hi = _estimated_return_range(
                stock["opportunity_score"], stock["atr_pct"], horizon, {}
            )
            stock["estimated_return_lo"] = lo
            stock["estimated_return_hi"] = hi

    # ── Step 7: Clean up internal keys before returning ────────────────────
    for stock in top_quant:
        stock.pop("_raw_score", None)

    # ── Rank labels ────────────────────────────────────────────────────────
    for i, stock in enumerate(top_quant):
        stock["rank"] = i + 1

    return {
        "scan_id": scan_id,
        "horizon": horizon,
        "horizon_label": hz["label"],
        "risk_profile": risk_profile,
        "regime": {
            "regime": regime_name,
            "rsi": regime.get("rsi"),
            "volatility_20d": regime.get("volatility_20d"),
            "score_adjustment": regime.get("score_adjustment", 0),
            "data_available": regime.get("data_available", False),
        },
        "scanned_at": datetime.now(timezone.utc).isoformat(),
        "candidates": top_quant,
        "top_for_committee": top_10_symbols[:5],   # top 5 go to committee
        "total_scanned": len(scored) + max(0, 50 - len(raw_indicators)),
        "sector_strength": sector_strength,
        "message": (
            f"Scanned {len(raw_indicators)} stocks. "
            f"Top {len(top_quant)} candidates ranked for {hz['label']} horizon. "
            f"Market regime: {regime_name}. "
            "These are evidence-based estimates, NOT guaranteed returns."
        ),
    }
