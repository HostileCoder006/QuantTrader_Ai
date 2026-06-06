"""
NIFTY 50 Market Scanner
-----------------------
Scans all 50 stocks and ranks them by signal strength, momentum, and volume.
All ranking is deterministic — no AI involved.
"""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

from .nifty50 import NIFTY_50_STOCKS
from .signals import generate_signal

logger = logging.getLogger(__name__)

# How many top results to return per category
TOP_N = 8


def _safe_generate(symbol: str) -> dict | None:
    try:
        return generate_signal(symbol)
    except Exception as exc:
        logger.warning("Scanner failed for %s: %s", symbol, exc)
        return None


def scan_market() -> dict:
    """
    Scan all NIFTY 50 stocks in parallel and return categorised results:
      - top_buy:      highest score stocks (Buy / Strong Buy)
      - top_sell:     lowest score stocks  (Sell / Strong Sell)
      - top_momentum: highest absolute daily_momentum
      - top_volume:   highest volume_change (spikes)
      - all_signals:  full list sorted by score descending
    """
    signals: list[dict] = []

    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(_safe_generate, s["symbol"]): s["symbol"] for s in NIFTY_50_STOCKS}
        for future in as_completed(futures):
            result = future.result()
            if result is not None:
                signals.append(result)

    # Sort by score descending for the full list
    signals.sort(key=lambda s: s["score"], reverse=True)

    top_buy = [s for s in signals if s["signal"] in ("Strong Buy", "Buy")][:TOP_N]
    top_sell = sorted(
        [s for s in signals if s["signal"] in ("Strong Sell", "Sell")],
        key=lambda s: s["score"],
    )[:TOP_N]
    top_momentum = sorted(
        signals,
        key=lambda s: abs(s["indicators"]["daily_momentum"]),
        reverse=True,
    )[:TOP_N]
    top_volume = sorted(
        signals,
        key=lambda s: s["indicators"]["volume_change"],
        reverse=True,
    )[:TOP_N]

    return {
        "top_buy": top_buy,
        "top_sell": top_sell,
        "top_momentum": top_momentum,
        "top_volume": top_volume,
        "all_signals": signals,
        "total_scanned": len(signals),
    }
