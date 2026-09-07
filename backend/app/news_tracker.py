from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone

import pandas as pd

from .market import get_ohlcv_history
from .nifty50 import stock_by_symbol
from .storage import get_connection

logger = logging.getLogger(__name__)

REACTION_HORIZONS = [1, 5, 20]  # trading days


def _headlines_cache_key(symbol: str, headlines: list[dict]) -> str:
    text = symbol + "|".join(sorted(h.get("title", "") for h in headlines))
    return hashlib.sha256(text.encode()).hexdigest()[:32]


def get_cached_sentiment(symbol: str, headlines: list[dict]) -> dict | None:
    """Return cached sentiment if it exists, else None."""
    key = _headlines_cache_key(symbol, headlines)
    try:
        with get_connection() as db:
            row = db.execute(
                "SELECT sentiment_json FROM news_cache WHERE symbol=? AND cache_key=?",
                (symbol, key),
            ).fetchone()
            if row:
                return json.loads(row["sentiment_json"])
    except Exception as exc:
        logger.warning("Cache read failed: %s", exc)
    return None


def store_sentiment_cache(symbol: str, headlines: list[dict], sentiment: dict) -> None:
    """Persist a sentiment result keyed by symbol + headline hash."""
    key = _headlines_cache_key(symbol, headlines)
    try:
        with get_connection() as db:
            db.execute(
                """
                INSERT OR REPLACE INTO news_cache
                    (symbol, cache_key, headlines_json, sentiment_json, fetched_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    symbol,
                    key,
                    json.dumps(headlines),
                    json.dumps(sentiment),
                    datetime.now(timezone.utc).isoformat(),
                ),
            )
    except Exception as exc:
        logger.warning("Cache write failed: %s", exc)


def record_news_reaction(
    symbol: str,
    headline: str,
    sentiment_score: int,
    sentiment_class: str,
    current_price: float,
) -> int | None:
    """
    Store a news event with current price for later resolution.
    Returns the inserted row ID.
    """
    article_hash = hashlib.sha256(
        (symbol + headline).encode()
    ).hexdigest()[:32]

    try:
        with get_connection() as db:
            # Avoid duplicates
            existing = db.execute(
                "SELECT id FROM news_price_reactions WHERE article_hash=?",
                (article_hash,),
            ).fetchone()
            if existing:
                return existing["id"]

            cursor = db.execute(
                """
                INSERT INTO news_price_reactions
                    (symbol, article_hash, headline, sentiment_score, sentiment_class,
                     price_at_news, recorded_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    symbol, article_hash, headline[:500], sentiment_score, sentiment_class,
                    round(current_price, 2), datetime.now(timezone.utc).isoformat(),
                ),
            )
            return cursor.lastrowid
    except Exception as exc:
        logger.warning("Record news reaction failed: %s", exc)
        return None


def resolve_pending_reactions() -> int:
    """
    Fill in price_1d / price_5d / price_20d and return_Xd columns
    for reactions that are old enough.
    Returns count filled.
    """
    filled = 0
    try:
        with get_connection() as db:
            # Get reactions missing at least one horizon
            rows = db.execute(
                """
                SELECT id, symbol, recorded_at, price_at_news
                FROM news_price_reactions
                WHERE return_20d IS NULL
                ORDER BY recorded_at DESC
                LIMIT 200
                """
            ).fetchall()

            now_utc = datetime.now(timezone.utc)

            for row in rows:
                rid = row["id"]
                symbol = row["symbol"]
                recorded = row["recorded_at"]
                price_at_news = row["price_at_news"]

                if not price_at_news or price_at_news <= 0:
                    continue

                try:
                    rec_dt = datetime.fromisoformat(recorded.replace("Z", "+00:00"))
                    rec_dt = rec_dt.replace(tzinfo=timezone.utc) if rec_dt.tzinfo is None else rec_dt
                except ValueError:
                    continue

                # Need at least 30 calendar days for 20d trading horizon
                days_elapsed = (now_utc - rec_dt).days
                if days_elapsed < 5:
                    continue

                stock = stock_by_symbol(symbol)
                if not stock:
                    continue

                df = get_ohlcv_history(stock["yf_symbol"], period="6mo")
                if df.empty:
                    continue

                df.index = pd.DatetimeIndex(df.index).normalize()
                rec_date = rec_dt.date()
                future = df[df.index.date >= rec_date]

                updates: dict[str, object] = {}
                for h in REACTION_HORIZONS:
                    col_p = f"price_{h}d"
                    col_r = f"return_{h}d"
                    col_a = f"resolved_{h}d_at"

                    if len(future) >= h + 1:
                        exit_price = float(future["Close"].iloc[h])
                        ret = round(((exit_price - price_at_news) / price_at_news) * 100, 3)
                        updates[col_p] = round(exit_price, 2)
                        updates[col_r] = ret
                        updates[col_a] = datetime.now(timezone.utc).isoformat()
                        filled += 1

                if updates:
                    set_clause = ", ".join(f"{k} = ?" for k in updates)
                    db.execute(
                        f"UPDATE news_price_reactions SET {set_clause} WHERE id = ?",
                        list(updates.values()) + [rid],
                    )
    except Exception as exc:
        logger.warning("Reaction resolution failed: %s", exc)

    return filled


def get_reaction_stats(symbol: str) -> dict:
    """
    Return sentiment/price reaction analysis for a symbol.
    Only uses rows with resolved outcomes (no lookahead).
    """
    try:
        with get_connection() as db:
            # Recent sentiment trend (last 30 records regardless of resolution)
            trend_rows = db.execute(
                """
                SELECT sentiment_score, sentiment_class, recorded_at
                FROM news_price_reactions
                WHERE symbol = ?
                ORDER BY recorded_at DESC
                LIMIT 30
                """,
                (symbol,),
            ).fetchall()

            # Resolved reactions for return analysis
            resolved_rows = db.execute(
                """
                SELECT sentiment_score, sentiment_class,
                       return_1d, return_5d, return_20d, recorded_at
                FROM news_price_reactions
                WHERE symbol = ? AND return_20d IS NOT NULL
                ORDER BY recorded_at DESC
                """,
                (symbol,),
            ).fetchall()

        if not trend_rows:
            return {
                "symbol": symbol,
                "data_available": False,
                "message": "No news reaction data stored yet for this symbol.",
                "sentiment_trend": [],
                "reaction_stats": {},
                "divergence": None,
            }

        # Sentiment trend (chronological for chart)
        sentiment_trend = [
            {
                "date": r["recorded_at"][:10],
                "score": r["sentiment_score"],
                "class": r["sentiment_class"],
            }
            for r in reversed(trend_rows)
        ]

        # Avg sentiment 7D / 30D / 90D
        import numpy as np
        scores = [r["sentiment_score"] for r in trend_rows if r["sentiment_score"] is not None]
        trend_7d = round(float(np.mean(scores[:7])), 1) if len(scores) >= 7 else None
        trend_30d = round(float(np.mean(scores[:30])), 1) if len(scores) >= 30 else None

        # Reaction stats by horizon and sentiment class
        reaction_stats: dict[str, dict] = {}
        if resolved_rows:
            for h, col in [(1, "return_1d"), (5, "return_5d"), (20, "return_20d")]:
                by_class: dict[str, list[float]] = {
                    "Bullish": [], "Neutral": [], "Bearish": []
                }
                for row in resolved_rows:
                    ret = row[col]
                    cls = row["sentiment_class"]
                    if ret is not None and cls in by_class:
                        by_class[cls].append(ret)

                stats_by_class: dict[str, dict] = {}
                for cls, returns in by_class.items():
                    if returns:
                        arr = np.array(returns)
                        stats_by_class[cls] = {
                            "count": len(returns),
                            "avg_return": round(float(arr.mean()), 2),
                            "win_rate": round(float((arr > 0).mean()) * 100, 1),
                        }

                reaction_stats[f"{h}d"] = {
                    "data_available": bool(any(by_class.values())),
                    "sample_size": len(resolved_rows),
                    "by_sentiment_class": stats_by_class,
                }

        # Sentiment/Price divergence: recent bullish news but negative price reaction
        divergence = None
        if resolved_rows:
            last = resolved_rows[0]
            if last["sentiment_class"] == "Bullish" and last["return_5d"] is not None and last["return_5d"] < -2:
                divergence = {
                    "type": "BULLISH_NEWS_BEARISH_PRICE",
                    "note": f"Recent bullish sentiment, but 5D price reaction was {last['return_5d']:.1f}%.",
                }
            elif last["sentiment_class"] == "Bearish" and last["return_5d"] is not None and last["return_5d"] > 2:
                divergence = {
                    "type": "BEARISH_NEWS_BULLISH_PRICE",
                    "note": f"Recent bearish sentiment, but 5D price reaction was +{last['return_5d']:.1f}%.",
                }

        return {
            "symbol": symbol,
            "data_available": True,
            "total_events": len(trend_rows),
            "resolved_events": len(resolved_rows),
            "sentiment_trend": sentiment_trend,
            "avg_sentiment_7d": trend_7d,
            "avg_sentiment_30d": trend_30d,
            "reaction_stats": reaction_stats,
            "divergence": divergence,
            "message": (
                f"{len(resolved_rows)} news events with resolved price reactions. "
                "Results are historical observations, not predictions."
            ),
        }

    except Exception as exc:
        logger.warning("Reaction stats failed for %s: %s", symbol, exc)
        return {
            "symbol": symbol,
            "data_available": False,
            "message": f"Error: {exc}",
            "sentiment_trend": [],
            "reaction_stats": {},
            "divergence": None,
        }
