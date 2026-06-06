import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from random import Random

import yfinance as yf
import pandas as pd

from .config import BASE_DIR
from .nifty50 import NIFTY_50_STOCKS, NIFTY_INDEX, stock_by_symbol

logger = logging.getLogger(__name__)
YFINANCE_CACHE_DIR = BASE_DIR / ".yfinance-cache"
YFINANCE_CACHE_DIR.mkdir(exist_ok=True)
yf.set_tz_cache_location(str(YFINANCE_CACHE_DIR))

# Number of historical days to fetch for technical indicators (need ~60 for EMA50)
HISTORY_DAYS = "90d"


def _fallback_price(symbol: str) -> dict:
    rng = Random(symbol)
    base = round(rng.uniform(180, 4200), 2)
    change = round(rng.uniform(-2.8, 2.8), 2)
    previous_close = round(base / (1 + change / 100), 2)
    volume = rng.randint(500_000, 10_000_000)
    avg_volume = rng.randint(400_000, 8_000_000)
    return {
        "current_price": base,
        "daily_change_percent": change,
        "previous_close": previous_close,
        "volume": volume,
        "avg_volume": avg_volume,
        "high": round(base * 1.01, 2),
        "low": round(base * 0.99, 2),
        "open": round(previous_close * (1 + rng.uniform(-0.005, 0.005)), 2),
        "source": "demo",
    }


def _get_live_quote(yf_symbol: str) -> dict:
    ticker = yf.Ticker(yf_symbol)
    fast_info = ticker.fast_info

    current_price = fast_info.get("lastPrice") or fast_info.get("last_price")
    previous_close = fast_info.get("previousClose") or fast_info.get("previous_close")

    if not current_price or not previous_close:
        history = ticker.history(period="5d", interval="1d", auto_adjust=False)
        if history.empty:
            raise RuntimeError("yfinance returned empty price history")
        latest = history.iloc[-1]
        previous = history.iloc[-2] if len(history) > 1 else latest
        current_price = float(latest["Close"])
        previous_close = float(previous["Close"]) or current_price

    current_price = float(current_price)
    previous_close = float(previous_close)
    if current_price <= 0 or previous_close <= 0:
        raise RuntimeError("yfinance returned invalid price values")

    daily_change_percent = ((current_price - previous_close) / previous_close) * 100

    # Fetch today's OHLV
    volume = int(fast_info.get("threeMonthAverageVolume") or fast_info.get("three_month_average_volume") or 0)
    day_high = float(fast_info.get("dayHigh") or fast_info.get("day_high") or current_price)
    day_low = float(fast_info.get("dayLow") or fast_info.get("day_low") or current_price)
    day_open = float(fast_info.get("open") or previous_close)
    last_volume = int(fast_info.get("lastVolume") or fast_info.get("last_volume") or volume)

    return {
        "current_price": round(current_price, 2),
        "daily_change_percent": round(daily_change_percent, 2),
        "previous_close": round(previous_close, 2),
        "volume": last_volume,
        "avg_volume": volume,
        "high": round(day_high, 2),
        "low": round(day_low, 2),
        "open": round(day_open, 2),
        "source": "yfinance",
    }


def _get_quote(yf_symbol: str, symbol: str) -> dict:
    try:
        quote = _get_live_quote(yf_symbol)
        logger.info("Market quote for %s loaded from yfinance", yf_symbol)
        return quote
    except Exception as exc:
        logger.warning("Market quote for %s fell back to demo: %s", yf_symbol, exc)
        return _fallback_price(symbol)


def get_quote(symbol: str) -> dict:
    stock = stock_by_symbol(symbol)
    if not stock:
        raise ValueError("Unknown NIFTY 50 symbol.")
    quote = _get_quote(stock["yf_symbol"], stock["symbol"])
    return {**stock, **quote}


def get_market() -> list[dict]:
    """Fetch all 50 NIFTY stocks in parallel for speed."""
    results: dict[str, dict] = {}

    def fetch(stock: dict) -> tuple[str, dict]:
        quote = _get_quote(stock["yf_symbol"], stock["symbol"])
        return stock["symbol"], {**stock, **quote}

    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(fetch, s): s["symbol"] for s in NIFTY_50_STOCKS}
        for future in as_completed(futures):
            symbol, data = future.result()
            results[symbol] = data

    # Return in original NIFTY_50_STOCKS order
    return [results[s["symbol"]] for s in NIFTY_50_STOCKS if s["symbol"] in results]


def get_nifty_index() -> dict:
    """Fetch NIFTY 50 index value."""
    try:
        ticker = yf.Ticker(NIFTY_INDEX["yf_symbol"])
        fast_info = ticker.fast_info
        current = float(fast_info.get("lastPrice") or fast_info.get("last_price") or 0)
        prev = float(fast_info.get("previousClose") or fast_info.get("previous_close") or 0)
        if current <= 0 or prev <= 0:
            raise RuntimeError("Invalid index values")
        change = current - prev
        change_pct = (change / prev) * 100
        return {
            "value": round(current, 2),
            "previous_close": round(prev, 2),
            "change": round(change, 2),
            "change_percent": round(change_pct, 2),
            "source": "yfinance",
        }
    except Exception as exc:
        logger.warning("NIFTY index fetch failed: %s", exc)
        rng = Random("NIFTY_INDEX")
        base = round(rng.uniform(21000, 25000), 2)
        change_pct = round(rng.uniform(-1.5, 1.5), 2)
        change = round(base * change_pct / 100, 2)
        return {
            "value": base,
            "previous_close": round(base - change, 2),
            "change": change,
            "change_percent": change_pct,
            "source": "demo",
        }


def get_ohlcv_history(yf_symbol: str, period: str = HISTORY_DAYS) -> pd.DataFrame:
    """
    Returns a DataFrame with columns: Open, High, Low, Close, Volume.
    Falls back to an empty DataFrame on error.
    """
    try:
        ticker = yf.Ticker(yf_symbol)
        df = ticker.history(period=period, interval="1d", auto_adjust=True)
        if df.empty:
            raise RuntimeError("Empty OHLCV history")
        df = df[["Open", "High", "Low", "Close", "Volume"]].dropna()
        return df
    except Exception as exc:
        logger.warning("OHLCV history for %s failed: %s", yf_symbol, exc)
        return pd.DataFrame(columns=["Open", "High", "Low", "Close", "Volume"])
