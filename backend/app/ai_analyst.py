"""
AI Trade Analyst & Market Brief
--------------------------------
DeepSeek V3.2 is used ONLY to:
  1. Explain quantitative signals in plain English
  2. Summarise market conditions
  3. Analyse portfolio health
  4. Generate a daily market intelligence report

AI never generates signals. All signals come from signals.py.
"""
from __future__ import annotations

import json
import logging
from random import Random

import requests

from .config import OPENROUTER_API_KEY, OPENROUTER_MODEL
from .news_ai import fetch_news

logger = logging.getLogger(__name__)

_OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
_HEADERS = {
    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
    "Content-Type": "application/json",
    "HTTP-Referer": "http://localhost:5173",
    "X-Title": "QuantTrader AI",
}


def _call_llm(system_prompt: str, user_payload: dict, timeout: int = 45) -> str:
    """
    Call OpenRouter DeepSeek V3.2.
    Returns the raw content string.
    Raises on HTTP errors.
    """
    response = requests.post(
        _OPENROUTER_URL,
        headers={**_HEADERS, "Authorization": f"Bearer {OPENROUTER_API_KEY}"},
        json={
            "model": OPENROUTER_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(user_payload)},
            ],
            "response_format": {"type": "json_object"},
        },
        timeout=timeout,
    )
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"]


# ---------------------------------------------------------------------------
# 1. Trade signal explanation
# ---------------------------------------------------------------------------

_SIGNAL_SYSTEM = (
    "You are a quantitative equity analyst. "
    "You receive deterministic technical signals computed from price data. "
    "Your role is to EXPLAIN signals to retail traders — NOT to generate signals or predict prices. "
    "Be concise, educational, and risk-aware. Return valid JSON only."
)

_SIGNAL_SCHEMA = {
    "recommendation_summary": "2-sentence plain-English summary of the signal",
    "confidence_commentary": "Why the confidence level is high/medium/low based on the indicators",
    "risk_assessment": "Key risks a trader should be aware of",
    "trade_rationale": "Why the quant model flagged this stock right now",
}


def explain_signal(signal: dict) -> dict:
    """
    Takes a signal dict from signals.generate_signal() and returns an AI explanation.
    Falls back to a deterministic demo if OPENROUTER_API_KEY is not set.
    """
    if not OPENROUTER_API_KEY:
        return _demo_signal_explanation(signal)

    payload = {
        "task": "Explain this quantitative trading signal to a retail paper trader.",
        "stock": signal.get("symbol"),
        "company": signal.get("name"),
        "sector": signal.get("sector"),
        "signal": signal.get("signal"),
        "score": signal.get("score"),
        "confidence": signal.get("confidence"),
        "indicators": {
            "rsi": signal["indicators"]["rsi"],
            "macd_crossover": signal["indicators"]["macd"]["crossover"],
            "macd_histogram": signal["indicators"]["macd"]["histogram"],
            "price_vs_vwap": "above" if signal["indicators"]["current_price"] > signal["indicators"]["vwap"] else "below",
            "price_vs_ema50": "above" if signal["indicators"]["current_price"] > signal["indicators"]["ema50"] else "below",
            "volume_change_pct": signal["indicators"]["volume_change"],
            "daily_momentum_pct": signal["indicators"]["daily_momentum"],
        },
        "targets": signal.get("targets"),
        "risk": signal.get("risk"),
        "output_schema": _SIGNAL_SCHEMA,
    }

    try:
        content = _call_llm(_SIGNAL_SYSTEM, payload)
        parsed = json.loads(content)
        return {
            "recommendation_summary": parsed.get("recommendation_summary", ""),
            "confidence_commentary": parsed.get("confidence_commentary", ""),
            "risk_assessment": parsed.get("risk_assessment", ""),
            "trade_rationale": parsed.get("trade_rationale", ""),
            "model": OPENROUTER_MODEL,
        }
    except Exception as exc:
        logger.warning("Signal explanation LLM call failed: %s", exc)
        return _demo_signal_explanation(signal)


def _demo_signal_explanation(signal: dict) -> dict:
    symbol = signal.get("symbol", "UNKNOWN")
    sig = signal.get("signal", "Hold")
    score = signal.get("score", 50)
    rng = Random(symbol + sig + str(score))

    templates = {
        "Strong Buy": (
            f"{symbol} shows strong bullish momentum with a score of {score}/100. "
            "The MACD histogram turned positive while price is trading above VWAP and EMA50.",
            "High confidence backed by multiple confirming indicators across price, volume, and trend.",
            "Watch for intraday reversals near resistance. Use the stop-loss level strictly.",
            "Volume spike above the 20-day average confirms genuine buying interest.",
        ),
        "Buy": (
            f"{symbol} has a buy signal (score: {score}/100) with price above key moving averages. "
            "RSI is in a healthy zone suggesting momentum without overbought risk.",
            "Medium-high confidence. Most indicators are bullish but not all aligned.",
            "Broader market weakness could negate this signal. Monitor NIFTY direction.",
            "EMA crossover and MACD suggest an emerging uptrend.",
        ),
        "Hold": (
            f"{symbol} scores {score}/100 — signals are mixed. No strong directional bias. "
            "Price is near VWAP with neutral RSI.",
            "Low directional confidence. Waiting for clearer signal is advisable.",
            "No urgency but no clear edge either. Avoid chasing if price moves sharply.",
            "Indicators lack confluence. Momentum and volume are inconclusive.",
        ),
        "Sell": (
            f"{symbol} shows bearish signals with score {score}/100. "
            "Price is below VWAP and MACD histogram is negative.",
            "Medium confidence for downward pressure. Risk-reward favors reduction of exposure.",
            "Could see a relief bounce before continuing lower. Use stop-loss on any short.",
            "Volume declining with negative MACD crossover signals distribution.",
        ),
        "Strong Sell": (
            f"{symbol} has a weak signal (score: {score}/100). "
            "Multiple indicators aligned bearishly — price below VWAP, EMA50, and negative MACD.",
            "High confidence in bearish bias. Indicators are uniformly negative.",
            "High risk if holding long positions. Stop-loss placement is critical.",
            "Broad selling pressure confirmed by volume and trend indicators.",
        ),
    }

    tpl = templates.get(sig, templates["Hold"])
    return {
        "recommendation_summary": tpl[0],
        "confidence_commentary": tpl[1],
        "risk_assessment": tpl[2],
        "trade_rationale": tpl[3],
        "model": "demo-fallback",
    }


# ---------------------------------------------------------------------------
# 2. Portfolio intelligence
# ---------------------------------------------------------------------------

_PORTFOLIO_SYSTEM = (
    "You are a portfolio analyst for a paper trading simulation platform. "
    "Analyse the portfolio's composition, diversification, and risk. "
    "Be constructive and educational. Return valid JSON only."
)

_PORTFOLIO_SCHEMA = {
    "analysis": "Overall portfolio assessment in 2-3 sentences",
    "strengths": ["list of 2-3 portfolio strengths"],
    "weaknesses": ["list of 2-3 portfolio weaknesses or risks"],
    "recommendations": ["list of 2-3 actionable suggestions"],
}


def analyse_portfolio(portfolio_data: dict) -> dict:
    """Generates AI portfolio intelligence. Fallback to demo if no API key."""
    if not OPENROUTER_API_KEY:
        return _demo_portfolio_analysis(portfolio_data)

    payload = {
        "task": "Analyse this paper trading portfolio and provide intelligence.",
        "portfolio_value": portfolio_data.get("portfolio_value"),
        "available_cash": portfolio_data.get("available_cash"),
        "invested_value": portfolio_data.get("invested_value"),
        "total_return_percent": portfolio_data.get("total_return_percent"),
        "health_score": portfolio_data.get("health_score"),
        "sector_concentration": portfolio_data.get("sector_concentration"),
        "diversification_score": portfolio_data.get("diversification_score"),
        "holdings_count": len(portfolio_data.get("holdings", [])),
        "output_schema": _PORTFOLIO_SCHEMA,
    }

    try:
        content = _call_llm(_PORTFOLIO_SYSTEM, payload)
        parsed = json.loads(content)
        return {
            "analysis": parsed.get("analysis", ""),
            "strengths": parsed.get("strengths", []),
            "weaknesses": parsed.get("weaknesses", []),
            "recommendations": parsed.get("recommendations", []),
            "model": OPENROUTER_MODEL,
        }
    except Exception as exc:
        logger.warning("Portfolio analysis LLM call failed: %s", exc)
        return _demo_portfolio_analysis(portfolio_data)


def _demo_portfolio_analysis(portfolio_data: dict) -> dict:
    holdings_count = len(portfolio_data.get("holdings", []))
    health = portfolio_data.get("health_score", 50)
    div_score = portfolio_data.get("diversification_score", 50)

    if holdings_count == 0:
        return {
            "analysis": "The portfolio is currently empty. Deploy virtual capital to begin tracking performance and building diversification.",
            "strengths": ["No unrealized losses", "Full capital available"],
            "weaknesses": ["No market exposure", "No diversification"],
            "recommendations": [
                "Start with 3-5 stocks across different sectors",
                "Limit any single stock to under 25% of portfolio",
                "Use the scanner to identify momentum opportunities",
            ],
            "model": "demo-fallback",
        }

    return {
        "analysis": (
            f"Portfolio health score is {health}/100 with {holdings_count} holdings. "
            f"Diversification score is {div_score}/100. "
            "Monitor sector concentration to avoid correlated drawdowns."
        ),
        "strengths": [
            f"{holdings_count} holdings provide some diversification",
            "Active position management opportunity available",
            "Cash reserve available for opportunistic buys",
        ],
        "weaknesses": [
            "Concentration risk if multiple stocks are from the same sector",
            "Paper trading removes real market psychology pressure",
            "No stop-loss automation — manual discipline required",
        ],
        "recommendations": [
            "Rebalance if any single sector exceeds 40% allocation",
            "Set a 7-8% stop-loss rule for each position",
            "Review signal scores weekly to rotate out of weak holdings",
        ],
        "model": "demo-fallback",
    }


# ---------------------------------------------------------------------------
# 3. Daily AI Market Brief
# ---------------------------------------------------------------------------

_BRIEF_SYSTEM = (
    "You are a market intelligence analyst. "
    "Generate a concise daily market brief for NIFTY 50 based on the provided data. "
    "Focus on actionable insights, not price predictions. Return valid JSON only."
)

_BRIEF_SCHEMA = {
    "market_summary": "2-3 sentence overview of today's market",
    "market_mood": "Bullish / Neutral / Bearish with one-line justification",
    "key_events": ["list of 2-3 key market events or themes"],
    "opportunities": ["list of 2 potential opportunities"],
    "risks": ["list of 2 key risks to watch"],
    "sectors_in_focus": ["list of sectors showing notable activity"],
}


def generate_market_brief(
    nifty_data: dict,
    top_gainers: list[dict],
    top_losers: list[dict],
    top_signals: list[dict],
) -> dict:
    """Generate daily AI market brief. Fallback to demo if no API key."""
    if not OPENROUTER_API_KEY:
        return _demo_market_brief(nifty_data)

    # Fetch a few market headlines for context
    try:
        headlines = fetch_news("RELIANCE")[:3]
    except Exception:
        headlines = []

    payload = {
        "task": "Generate a daily NIFTY 50 market intelligence brief.",
        "nifty_index": {
            "value": nifty_data.get("value"),
            "change_percent": nifty_data.get("change_percent"),
        },
        "top_gainers": [
            {"symbol": s.get("symbol"), "change": s.get("indicators", {}).get("daily_momentum")}
            for s in top_gainers[:5]
        ],
        "top_losers": [
            {"symbol": s.get("symbol"), "change": s.get("indicators", {}).get("daily_momentum")}
            for s in top_losers[:5]
        ],
        "strong_buy_count": len([s for s in top_signals if s.get("signal") == "Strong Buy"]),
        "buy_count": len([s for s in top_signals if s.get("signal") == "Buy"]),
        "sell_count": len([s for s in top_signals if s.get("signal") in ("Sell", "Strong Sell")]),
        "market_headlines": [h["title"] for h in headlines],
        "output_schema": _BRIEF_SCHEMA,
    }

    try:
        content = _call_llm(_BRIEF_SYSTEM, payload)
        parsed = json.loads(content)
        return {
            "market_summary": parsed.get("market_summary", ""),
            "market_mood": parsed.get("market_mood", "Neutral"),
            "key_events": parsed.get("key_events", []),
            "opportunities": parsed.get("opportunities", []),
            "risks": parsed.get("risks", []),
            "sectors_in_focus": parsed.get("sectors_in_focus", []),
            "model": OPENROUTER_MODEL,
        }
    except Exception as exc:
        logger.warning("Market brief LLM call failed: %s", exc)
        return _demo_market_brief(nifty_data)


def _demo_market_brief(nifty_data: dict) -> dict:
    change_pct = nifty_data.get("change_percent", 0)
    if change_pct > 0.5:
        mood = "Bullish — NIFTY advancing with broad buying interest"
    elif change_pct < -0.5:
        mood = "Bearish — NIFTY under selling pressure today"
    else:
        mood = "Neutral — NIFTY consolidating in a tight range"

    return {
        "market_summary": (
            f"NIFTY 50 is {'up' if change_pct >= 0 else 'down'} "
            f"{abs(change_pct):.2f}% today. "
            "Markets are showing mixed signals across sectors. "
            "Configure your OpenRouter API key for AI-generated market intelligence."
        ),
        "market_mood": mood,
        "key_events": [
            "FII/DII activity driving sector rotation",
            "Global cues influencing IT and Metal sectors",
            "RBI policy stance impacting Banking sector",
        ],
        "opportunities": [
            "Momentum stocks showing RSI in healthy 50-70 zone",
            "Volume spikes indicating institutional accumulation",
        ],
        "risks": [
            "Global macro uncertainty affecting FII flows",
            "Overbought RSI levels in select large-caps",
        ],
        "sectors_in_focus": ["Banking", "IT", "Energy"],
        "model": "demo-fallback",
    }
