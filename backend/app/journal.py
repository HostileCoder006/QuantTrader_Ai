"""
Recommendation Journal
-----------------------
Stores every BUY/SELL/HOLD/NO_TRADE recommendation with its full context,
then automatically tracks forward outcomes and computes performance stats.

Every time generate_signal() fires for a stock, we log the recommendation.
A background resolution job (called on GET /api/journal) fills in the
actual price outcomes as they become available.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from .market import get_ohlcv_history
from .nifty50 import NIFTY_INDEX, stock_by_symbol
from .storage import get_connection

logger = logging.getLogger(__name__)

OUTCOME_HORIZONS = [1, 5, 20, 60]  # trading days


# ── Logging ──────────────────────────────────────────────────────────────────

def log_recommendation(signal: dict, regime: dict | None = None, sentiment: dict | None = None) -> int:
    """
    Persist a recommendation to the journal.
    Returns the new row ID.
    """
    symbol = signal.get("symbol", "")
    targets = signal.get("targets", {})
    indicators = signal.get("indicators", {})

    # Serialise complex fields
    indicators_json = json.dumps({
        "rsi": indicators.get("rsi"),
        "macd_crossover": indicators.get("macd", {}).get("crossover"),
        "macd_histogram": indicators.get("macd", {}).get("histogram"),
        "vwap": indicators.get("vwap"),
        "ema20": indicators.get("ema20"),
        "ema50": indicators.get("ema50"),
        "atr": indicators.get("atr"),
        "volume_change": indicators.get("volume_change"),
        "daily_momentum": indicators.get("daily_momentum"),
        "score_breakdown": signal.get("score_breakdown", {}),
    })

    sentiment_json = json.dumps({
        "classification": sentiment.get("classification") if sentiment else None,
        "score": sentiment.get("score") if sentiment else None,
    })

    regime_str = regime.get("regime", "UNKNOWN") if regime else "UNKNOWN"

    with get_connection() as db:
        cursor = db.execute(
            """
            INSERT INTO recommendation_journal
                (symbol, timestamp, signal, confidence, score, price_at_signal,
                 indicators_json, sentiment_json, regime, target, stop_loss, data_source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                symbol,
                datetime.now(timezone.utc).isoformat(),
                signal.get("signal", "Hold"),
                signal.get("confidence", "Low"),
                signal.get("score", 0),
                indicators.get("current_price", 0.0),
                indicators_json,
                sentiment_json,
                regime_str,
                targets.get("target"),
                targets.get("stop_loss"),
                signal.get("data_source", "unknown"),
            ),
        )
        return cursor.lastrowid


# ── Outcome resolution ───────────────────────────────────────────────────────

def _get_price_n_days_after(symbol: str, base_timestamp: str, n_days: int) -> float | None:
    """
    Fetches OHLCV and returns the closing price approximately n_days trading
    days AFTER the base_timestamp. Returns None if insufficient data.

    No lookahead: we look FORWARD from a past timestamp.
    """
    stock = stock_by_symbol(symbol)
    if not stock:
        return None

    # Fetch a wide enough window to cover n_days + some buffer
    periods_map = {1: "5d", 5: "15d", 20: "45d", 60: "120d"}
    period = periods_map.get(n_days, "180d")

    df = get_ohlcv_history(stock["yf_symbol"], period="6mo")
    if df.empty:
        return None

    # Find the bar closest to base_timestamp
    base_dt = datetime.fromisoformat(base_timestamp.replace("Z", "+00:00"))
    base_date = base_dt.date()

    # Filter to bars on or after the base date
    df.index = pd.DatetimeIndex(df.index).normalize()
    future_bars = df[df.index.date >= base_date]  # type: ignore[attr-defined]

    if len(future_bars) < n_days + 1:
        return None

    try:
        exit_price = float(future_bars["Close"].iloc[n_days])
        return exit_price
    except (IndexError, ValueError):
        return None


def _get_nifty_return_n_days(base_timestamp: str, n_days: int) -> float | None:
    """Return NIFTY % return over n_days from base_timestamp (for alpha calc)."""
    df = get_ohlcv_history(NIFTY_INDEX["yf_symbol"], period="6mo")
    if df.empty:
        return None

    base_dt = datetime.fromisoformat(base_timestamp.replace("Z", "+00:00"))
    base_date = base_dt.date()

    df.index = pd.DatetimeIndex(df.index).normalize()
    future_bars = df[df.index.date >= base_date]  # type: ignore

    if len(future_bars) < n_days + 1:
        return None

    try:
        entry = float(future_bars["Close"].iloc[0])
        exit_ = float(future_bars["Close"].iloc[n_days])
        if entry <= 0:
            return None
        return round(((exit_ - entry) / entry) * 100, 3)
    except (IndexError, ValueError):
        return None



def resolve_pending_outcomes() -> int:
    """
    For every journal entry that is missing outcomes, attempt to resolve them.
    Only resolves outcomes for entries that are old enough (n_days have passed).
    Returns number of outcomes filled in.
    """
    filled = 0
    try:
        with get_connection() as db:
            # Get all journal entries that have at least one missing outcome
            rows = db.execute(
                """
                SELECT j.id, j.symbol, j.timestamp, j.price_at_signal
                FROM recommendation_journal j
                WHERE j.id NOT IN (
                    SELECT DISTINCT journal_id FROM journal_outcomes
                    WHERE outcome_period = 60
                    AND return_pct IS NOT NULL
                )
                ORDER BY j.timestamp DESC
                LIMIT 100
                """
            ).fetchall()

            now_utc = datetime.now(timezone.utc)

            for row in rows:
                jid = row["id"]
                symbol = row["symbol"]
                ts = row["timestamp"]
                price_at_signal = row["price_at_signal"]

                try:
                    signal_dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                    signal_dt = signal_dt.replace(tzinfo=timezone.utc) if signal_dt.tzinfo is None else signal_dt
                except ValueError:
                    continue

                for horizon in OUTCOME_HORIZONS:
                    # Check if this outcome already exists
                    existing = db.execute(
                        "SELECT id FROM journal_outcomes WHERE journal_id=? AND outcome_period=?",
                        (jid, horizon),
                    ).fetchone()
                    if existing:
                        continue

                    # Check if enough calendar days have passed (approx: horizon * 1.5)
                    days_elapsed = (now_utc - signal_dt).days
                    required_calendar_days = int(horizon * 1.5)
                    if days_elapsed < required_calendar_days:
                        continue

                    # Resolve
                    exit_price = _get_price_n_days_after(symbol, ts, horizon)
                    if exit_price is None or price_at_signal is None or price_at_signal <= 0:
                        continue

                    ret_pct = round(((exit_price - price_at_signal) / price_at_signal) * 100, 3)
                    nifty_ret = _get_nifty_return_n_days(ts, horizon)

                    db.execute(
                        """
                        INSERT INTO journal_outcomes
                            (journal_id, outcome_period, price_at_outcome, return_pct,
                             vs_nifty_return, outcome_date, computed_at)
                        VALUES (?, ?, ?, ?, ?, date('now'), ?)
                        """,
                        (
                            jid, horizon, round(exit_price, 2), ret_pct,
                            nifty_ret, datetime.now(timezone.utc).isoformat(),
                        ),
                    )
                    filled += 1

    except Exception as exc:
        logger.warning("Outcome resolution failed: %s", exc)

    return filled


# ── Read operations ──────────────────────────────────────────────────────────

def get_journal(limit: int = 200) -> list[dict]:
    """Return journal entries with any available outcomes joined in."""
    with get_connection() as db:
        rows = db.execute(
            """
            SELECT j.id, j.symbol, j.timestamp, j.signal, j.confidence, j.score,
                   j.price_at_signal, j.regime, j.target, j.stop_loss, j.data_source,
                   j.indicators_json, j.sentiment_json
            FROM recommendation_journal j
            ORDER BY j.timestamp DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

        result = []
        for row in rows:
            entry = dict(row)
            # Parse JSON fields
            try:
                entry["indicators"] = json.loads(entry.pop("indicators_json") or "{}")
            except Exception:
                entry["indicators"] = {}
            try:
                entry["sentiment"] = json.loads(entry.pop("sentiment_json") or "{}")
            except Exception:
                entry["sentiment"] = {}

            # Fetch outcomes
            outcomes_rows = db.execute(
                """
                SELECT outcome_period, price_at_outcome, return_pct, vs_nifty_return, outcome_date
                FROM journal_outcomes
                WHERE journal_id = ?
                ORDER BY outcome_period
                """,
                (entry["id"],),
            ).fetchall()
            entry["outcomes"] = {
                f"{o['outcome_period']}d": {
                    "price": o["price_at_outcome"],
                    "return_pct": o["return_pct"],
                    "vs_nifty": o["vs_nifty_return"],
                    "date": o["outcome_date"],
                }
                for o in outcomes_rows
            }
            result.append(entry)
    return result


def get_journal_stats() -> dict:
    """
    Compute aggregate performance statistics from journal outcomes.
    Only uses entries where outcomes have been resolved.
    """
    with get_connection() as db:
        total = db.execute("SELECT COUNT(*) as c FROM recommendation_journal").fetchone()["c"]

        if total == 0:
            return _empty_stats()

        # Count by signal type
        by_signal = db.execute(
            """
            SELECT signal, COUNT(*) as c
            FROM recommendation_journal
            GROUP BY signal
            """
        ).fetchall()

        # Resolved outcomes stats per horizon
        horizon_stats: dict[str, dict] = {}
        for h in OUTCOME_HORIZONS:
            rows = db.execute(
                """
                SELECT o.return_pct, o.vs_nifty_return, j.signal
                FROM journal_outcomes o
                JOIN recommendation_journal j ON o.journal_id = j.id
                WHERE o.outcome_period = ? AND o.return_pct IS NOT NULL
                """,
                (h,),
            ).fetchall()

            if not rows:
                horizon_stats[f"{h}d"] = {"data_available": False, "sample_size": 0}
                continue

            returns = [r["return_pct"] for r in rows]
            nifty_rets = [r["vs_nifty_return"] for r in rows if r["vs_nifty_return"] is not None]
            arr = np.array(returns)
            wins = int((arr > 0).sum())

            # Per-signal breakdown
            signal_breakdown: dict[str, dict] = {}
            for sig_name in ["Strong Buy", "Buy", "Hold", "Sell", "Strong Sell", "No Trade"]:
                sig_returns = [r["return_pct"] for r in rows if r["signal"] == sig_name]
                if sig_returns:
                    sig_arr = np.array(sig_returns)
                    signal_breakdown[sig_name] = {
                        "count": len(sig_returns),
                        "win_rate": round(float((sig_arr > 0).mean()) * 100, 1),
                        "avg_return": round(float(sig_arr.mean()), 2),
                    }

            horizon_stats[f"{h}d"] = {
                "data_available": True,
                "sample_size": len(returns),
                "win_rate": round(wins / len(returns) * 100, 1),
                "avg_return": round(float(arr.mean()), 2),
                "median_return": round(float(np.median(arr)), 2),
                "best_return": round(float(arr.max()), 2),
                "worst_return": round(float(arr.min()), 2),
                "avg_alpha": round(float(np.mean(nifty_rets)) if nifty_rets else 0.0, 2),
                "by_signal": signal_breakdown,
            }

        # Max drawdown on journal equity curve
        all_5d = db.execute(
            """
            SELECT o.return_pct, j.timestamp
            FROM journal_outcomes o
            JOIN recommendation_journal j ON o.journal_id = j.id
            WHERE o.outcome_period = 5 AND o.return_pct IS NOT NULL
            ORDER BY j.timestamp ASC
            """
        ).fetchall()

        max_dd = _compute_journal_drawdown([r["return_pct"] for r in all_5d])

        return {
            "total_recommendations": total,
            "by_signal": {r["signal"]: r["c"] for r in by_signal},
            "horizon_stats": horizon_stats,
            "max_drawdown_5d": max_dd,
        }


def _compute_journal_drawdown(returns: list[float]) -> float:
    """Compute max drawdown on a cumulative returns series."""
    if not returns:
        return 0.0
    equity = 100.0
    curve = [equity]
    for r in returns:
        equity *= (1 + r / 100)
        curve.append(equity)
    arr = np.array(curve)
    rolling_max = np.maximum.accumulate(arr)
    drawdowns = (arr - rolling_max) / rolling_max
    return round(float(drawdowns.min()) * 100, 2)


def _empty_stats() -> dict:
    return {
        "total_recommendations": 0,
        "by_signal": {},
        "horizon_stats": {
            f"{h}d": {"data_available": False, "sample_size": 0}
            for h in OUTCOME_HORIZONS
        },
        "max_drawdown_5d": 0.0,
    }
