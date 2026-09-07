from __future__ import annotations

import logging
import math
from random import Random

import numpy as np
import pandas as pd

from .market import get_ohlcv_history
from .nifty50 import NIFTY_INDEX, stock_by_symbol

logger = logging.getLogger(__name__)

RISK_FREE_RATE_ANNUAL = 0.065   # 6.5% — approx Indian 10-yr Gsec yield
TRADING_DAYS_PER_YEAR = 252


def _daily_returns(close: pd.Series) -> pd.Series:
    return close.pct_change().dropna()


def calc_volatility(returns: pd.Series) -> float:
    """Annualised daily return volatility (std dev × √252)."""
    if len(returns) < 2:
        return 0.0
    return round(float(returns.std() * math.sqrt(TRADING_DAYS_PER_YEAR) * 100), 2)


def calc_sharpe(returns: pd.Series) -> float:
    """Sharpe Ratio: (mean_annual_return - risk_free) / annual_vol"""
    if len(returns) < 2:
        return 0.0
    mean_daily = returns.mean()
    std_daily = returns.std()
    if std_daily == 0:
        return 0.0
    daily_rf = RISK_FREE_RATE_ANNUAL / TRADING_DAYS_PER_YEAR
    sharpe = (mean_daily - daily_rf) / std_daily * math.sqrt(TRADING_DAYS_PER_YEAR)
    return round(float(sharpe), 3)


def calc_sortino(returns: pd.Series) -> float:
    """Sortino Ratio: penalises only downside volatility."""
    if len(returns) < 2:
        return 0.0
    mean_daily = returns.mean()
    daily_rf = RISK_FREE_RATE_ANNUAL / TRADING_DAYS_PER_YEAR
    downside = returns[returns < daily_rf]
    if len(downside) == 0:
        return 0.0
    downside_std = downside.std() * math.sqrt(TRADING_DAYS_PER_YEAR)
    if downside_std == 0:
        return 0.0
    return round(float((mean_daily * TRADING_DAYS_PER_YEAR - RISK_FREE_RATE_ANNUAL) / downside_std), 3)


def calc_max_drawdown(close: pd.Series) -> float:
    """Maximum peak-to-trough drawdown as a percentage."""
    if len(close) < 2:
        return 0.0
    rolling_max = close.cummax()
    drawdown = (close - rolling_max) / rolling_max
    return round(float(drawdown.min() * 100), 2)  # negative value


def calc_beta(stock_returns: pd.Series, benchmark_returns: pd.Series) -> float:
    """Beta of stock vs benchmark."""
    aligned = pd.concat([stock_returns, benchmark_returns], axis=1).dropna()
    if len(aligned) < 10:
        return 1.0
    cov = np.cov(aligned.iloc[:, 0], aligned.iloc[:, 1])
    bench_var = cov[1, 1]
    if bench_var == 0:
        return 1.0
    return round(float(cov[0, 1] / bench_var), 3)


def _risk_score(volatility: float, sharpe: float, max_dd: float, beta: float) -> int:
    """
    Composite Risk Score 0–100 (higher = lower risk / better risk-adjusted return).
    """
    score = 50

    # Volatility (annualised %). < 20% is fine, > 40% is high risk
    if volatility < 15:
        score += 15
    elif volatility < 25:
        score += 5
    elif volatility > 35:
        score -= 15
    elif volatility > 45:
        score -= 25

    # Sharpe Ratio — > 1.5 is excellent
    if sharpe > 2.0:
        score += 20
    elif sharpe > 1.0:
        score += 10
    elif sharpe > 0:
        score += 3
    elif sharpe < -1.0:
        score -= 20
    elif sharpe < 0:
        score -= 8

    # Max Drawdown — magnitude (max_dd is negative)
    dd = abs(max_dd)
    if dd < 10:
        score += 15
    elif dd < 20:
        score += 5
    elif dd > 30:
        score -= 15
    elif dd > 45:
        score -= 25

    # Beta — close to 1 is neutral; > 1.5 adds risk
    if 0.8 <= beta <= 1.2:
        score += 0
    elif beta > 1.5:
        score -= 10
    elif beta < 0.5:
        score -= 5

    return max(0, min(100, score))


def _demo_risk(symbol: str) -> dict:
    rng = Random(symbol + "risk_v1")
    vol = round(rng.uniform(14, 42), 2)
    sharpe = round(rng.uniform(-0.5, 2.5), 3)
    sortino = round(rng.uniform(-0.3, 3.0), 3)
    max_dd = round(rng.uniform(-38, -4), 2)
    beta = round(rng.uniform(0.5, 1.8), 3)
    risk_sc = _risk_score(vol, sharpe, max_dd, beta)
    return {
        "symbol": symbol,
        "volatility": vol,
        "sharpe_ratio": sharpe,
        "sortino_ratio": sortino,
        "max_drawdown": max_dd,
        "beta": beta,
        "risk_score": risk_sc,
        "source": "demo",
    }


def get_stock_risk(symbol: str) -> dict:
    """Full risk analytics for a single stock."""
    stock = stock_by_symbol(symbol)
    if not stock:
        raise ValueError(f"Unknown NIFTY 50 symbol: {symbol}")

    # Fetch stock history
    df_stock = get_ohlcv_history(stock["yf_symbol"])
    if df_stock.empty or len(df_stock) < 20:
        logger.warning("Insufficient data for risk analysis of %s — using demo", symbol)
        return _demo_risk(symbol)

    # Fetch NIFTY benchmark
    df_nifty = get_ohlcv_history(NIFTY_INDEX["yf_symbol"])

    stock_returns = _daily_returns(df_stock["Close"])
    vol = calc_volatility(stock_returns)
    sharpe = calc_sharpe(stock_returns)
    sortino = calc_sortino(stock_returns)
    max_dd = calc_max_drawdown(df_stock["Close"])

    beta = 1.0
    if not df_nifty.empty and len(df_nifty) >= 20:
        nifty_returns = _daily_returns(df_nifty["Close"])
        beta = calc_beta(stock_returns, nifty_returns)

    risk_sc = _risk_score(vol, sharpe, max_dd, beta)

    return {
        "symbol": symbol,
        "volatility": vol,
        "sharpe_ratio": sharpe,
        "sortino_ratio": sortino,
        "max_drawdown": max_dd,
        "beta": beta,
        "risk_score": risk_sc,
        "source": "live",
    }


def get_portfolio_risk(holdings: list[dict]) -> dict:
    """
    Aggregate risk metrics for the full portfolio.
    Uses weighted average of individual stock metrics.
    """
    if not holdings:
        return {
            "volatility": 0.0,
            "sharpe_ratio": 0.0,
            "sortino_ratio": 0.0,
            "max_drawdown": 0.0,
            "beta": 1.0,
            "risk_score": 50,
        }

    total_value = sum(h.get("current_value", 0) for h in holdings)
    if total_value == 0:
        return {
            "volatility": 0.0,
            "sharpe_ratio": 0.0,
            "sortino_ratio": 0.0,
            "max_drawdown": 0.0,
            "beta": 1.0,
            "risk_score": 50,
        }

    weighted_vol = 0.0
    weighted_sharpe = 0.0
    weighted_sortino = 0.0
    weighted_dd = 0.0
    weighted_beta = 0.0

    for holding in holdings:
        symbol = holding.get("stock_symbol", "")
        weight = holding.get("current_value", 0) / total_value
        risk = _demo_risk(symbol)  # use fast demo for portfolio aggregate
        try:
            risk = get_stock_risk(symbol)
        except Exception:
            pass
        weighted_vol += risk["volatility"] * weight
        weighted_sharpe += risk["sharpe_ratio"] * weight
        weighted_sortino += risk["sortino_ratio"] * weight
        weighted_dd += risk["max_drawdown"] * weight
        weighted_beta += risk["beta"] * weight

    risk_sc = _risk_score(weighted_vol, weighted_sharpe, weighted_dd, weighted_beta)

    return {
        "volatility": round(weighted_vol, 2),
        "sharpe_ratio": round(weighted_sharpe, 3),
        "sortino_ratio": round(weighted_sortino, 3),
        "max_drawdown": round(weighted_dd, 2),
        "beta": round(weighted_beta, 3),
        "risk_score": risk_sc,
    }
