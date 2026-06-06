import logging
from random import Random

import yfinance as yf

from .config import BASE_DIR
from .nifty50 import NIFTY_50_STOCKS, stock_by_symbol

logger = logging.getLogger(__name__)
YFINANCE_CACHE_DIR = BASE_DIR / ".yfinance-cache"
YFINANCE_CACHE_DIR.mkdir(exist_ok=True)
yf.set_tz_cache_location(str(YFINANCE_CACHE_DIR))


def _fallback_price(symbol: str) -> dict:
    rng = Random(symbol)
    base = round(rng.uniform(180, 4200), 2)
    change = round(rng.uniform(-2.8, 2.8), 2)
    previous_close = round(base / (1 + change / 100), 2)
    return {
        "current_price": base,
        "daily_change_percent": change,
        "previous_close": previous_close,
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
    return {
        "current_price": round(current_price, 2),
        "daily_change_percent": round(daily_change_percent, 2),
        "previous_close": round(previous_close, 2),
        "source": "yfinance",
    }


def _get_quote(yf_symbol: str, symbol: str) -> dict:
    try:
        quote = _get_live_quote(yf_symbol)
        logger.info("Market quote for %s loaded from yfinance", yf_symbol)
        return quote
    except Exception as exc:
        logger.warning(
            "Market quote for %s fell back to demo data: %s",
            yf_symbol,
            exc,
        )
        return _fallback_price(symbol)


def get_quote(symbol: str) -> dict:
    stock = stock_by_symbol(symbol)
    if not stock:
        raise ValueError("Unknown NIFTY 50 symbol.")
    quote = _get_quote(stock["yf_symbol"], stock["symbol"])
    return {**stock, **quote}


def get_market() -> list[dict]:
    return [get_quote(stock["symbol"]) for stock in NIFTY_50_STOCKS]
