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
    "You are a quantitative equity analyst explaining deterministic signals to retail traders. "
    "You receive structured quantitative evidence: technical indicators, market regime, "
    "historical pattern statistics, and news sentiment. "
    "Your ONLY job is to explain, NOT to generate signals or predict prices. "
    "Clearly state supporting evidence, contradictions, and risks. "
    "If data is unavailable for any component, say so explicitly. "
    "Return valid JSON only."
)

_SIGNAL_SCHEMA = {
    "recommendation_summary": "2-sentence plain-English summary of the signal and its basis",
    "supporting_evidence": "Key indicators and data points that support this signal",
    "contradictions": "Any indicators or conditions that contradict or weaken the signal",
    "regime_context": "How the current market regime affects this signal",
    "pattern_context": "What historical similar setups suggest (if data available)",
    "risk_assessment": "Key risks a trader must be aware of",
    "trade_rationale": "Why the quant model assigned this score right now",
}


def explain_signal(signal: dict) -> dict:
    """
    Legacy wrapper — calls explain_signal_enriched with no extra context.
    Kept for backward compatibility with existing /signal/<symbol>/explain route.
    """
    return explain_signal_enriched(signal, regime=None, pattern_context=None, sentiment=None)


def explain_signal_enriched(
    signal: dict,
    regime: dict | None = None,
    pattern_context: dict | None = None,
    sentiment: dict | None = None,
) -> dict:
    """
    Full enriched explanation. DeepSeek receives ALL structured evidence:
      - signal indicators and score breakdown
      - market regime
      - historical pattern statistics (if available)
      - news sentiment (if available)

    DeepSeek explains the evidence — it does NOT generate or modify the signal.
    Falls back to deterministic demo if OPENROUTER_API_KEY is not set.
    """
    if not OPENROUTER_API_KEY:
        return _demo_signal_explanation(signal)

    ind = signal.get("indicators", {})
    payload = {
        "task": "Explain this quantitative trading signal. Do NOT generate or alter the signal — only explain the evidence.",
        "stock": signal.get("symbol"),
        "company": signal.get("name"),
        "sector": signal.get("sector"),
        # ── Quant signal ──
        "quant_signal": {
            "signal": signal.get("signal"),
            "score": signal.get("score"),
            "raw_score_before_regime_adj": signal.get("raw_score"),
            "confidence": signal.get("confidence"),
            "score_breakdown": signal.get("score_breakdown", {}),
        },
        # ── Technical indicators ──
        "indicators": {
            "rsi": ind.get("rsi"),
            "macd_crossover": ind.get("macd", {}).get("crossover"),
            "macd_histogram": ind.get("macd", {}).get("histogram"),
            "price_vs_vwap": "above" if ind.get("current_price", 0) > ind.get("vwap", 0) else "below",
            "price_vs_ema50": "above" if ind.get("current_price", 0) > ind.get("ema50", 0) else "below",
            "price_vs_ema20": "above" if ind.get("current_price", 0) > ind.get("ema20", 0) else "below",
            "volume_change_pct": ind.get("volume_change"),
            "daily_momentum_pct": ind.get("daily_momentum"),
            "atr": ind.get("atr"),
        },
        # ── Market regime ──
        "market_regime": {
            "regime": regime.get("regime") if regime else "DATA_UNAVAILABLE",
            "volatility_20d_pct": regime.get("volatility_20d") if regime else None,
            "nifty_rsi": regime.get("rsi") if regime else None,
            "score_adjustment_applied": regime.get("score_adjustment", 0) if regime else 0,
            "data_available": regime.get("data_available", False) if regime else False,
        },
        # ── Historical patterns ──
        "historical_patterns": (
            {
                "similar_setups": pattern_context.get("similar_count"),
                "data_available": pattern_context.get("data_available", False),
                "5d_win_rate": pattern_context.get("horizon_stats", {}).get("5d", {}).get("win_rate"),
                "20d_win_rate": pattern_context.get("horizon_stats", {}).get("20d", {}).get("win_rate"),
                "20d_avg_return": pattern_context.get("horizon_stats", {}).get("20d", {}).get("avg_return"),
                "message": pattern_context.get("message"),
            }
            if pattern_context else {"data_available": False}
        ),
        # ── News sentiment ──
        "news_sentiment": (
            {
                "classification": sentiment.get("classification"),
                "score": sentiment.get("score"),
                "data_available": True,
            }
            if sentiment else {"data_available": False}
        ),
        "targets": signal.get("targets"),
        "risk": signal.get("risk"),
        "output_schema": _SIGNAL_SCHEMA,
    }

    try:
        content = _call_llm(_SIGNAL_SYSTEM, payload)
        parsed = json.loads(content)
        return {
            "recommendation_summary": parsed.get("recommendation_summary", ""),
            "supporting_evidence": parsed.get("supporting_evidence", ""),
            "contradictions": parsed.get("contradictions", ""),
            "regime_context": parsed.get("regime_context", ""),
            "pattern_context": parsed.get("pattern_context", ""),
            "risk_assessment": parsed.get("risk_assessment", ""),
            "trade_rationale": parsed.get("trade_rationale", ""),
            # Keep legacy keys so existing frontend components don't break
            "confidence_commentary": parsed.get("supporting_evidence", ""),
            "model": OPENROUTER_MODEL,
        }
    except Exception as exc:
        logger.warning("Signal explanation LLM call failed: %s", exc)
        return _demo_signal_explanation(signal)


def _demo_signal_explanation(signal: dict) -> dict:
    symbol = signal.get("symbol", "UNKNOWN")
    sig = signal.get("signal", "Hold")
    score = signal.get("score", 50)
    regime = signal.get("regime_context", {}).get("regime", "NEUTRAL")
    rng = Random(symbol + sig + str(score))

    templates = {
        "Strong Buy": (
            f"{symbol} shows strong bullish momentum with a score of {score}/100. "
            "The MACD histogram turned positive while price is trading above VWAP and EMA50.",
            "MACD bullish crossover, price above VWAP and EMA50, RSI in healthy 50-70 zone, volume spike.",
            "Most indicators are aligned but watch for reversals near resistance zones.",
            f"Market regime is {regime}. Regime adjustment has been applied to the raw score.",
            "Historical pattern data not available in demo mode.",
            "Watch for intraday reversals near resistance. Use the stop-loss level strictly.",
            "Volume spike above the 20-day average confirms genuine buying interest.",
        ),
        "Buy": (
            f"{symbol} has a buy signal (score: {score}/100) with price above key moving averages. "
            "RSI is in a healthy zone suggesting momentum without overbought risk.",
            "EMA crossover and positive MACD histogram. Price above VWAP.",
            "Not all indicators are aligned — some neutral readings weaken conviction.",
            f"Market is in {regime} regime. Score was adjusted by {signal.get('score_breakdown', {}).get('regime_adjustment', 0)} pts.",
            "Historical pattern data not available in demo mode.",
            "Broader market weakness could negate this signal. Monitor NIFTY direction.",
            "EMA crossover and MACD suggest an emerging uptrend.",
        ),
        "Hold": (
            f"{symbol} scores {score}/100 — signals are mixed. No strong directional bias. "
            "Price is near VWAP with neutral RSI.",
            "Some indicators are positive but insufficient for a buy conviction.",
            "Multiple conflicting signals: RSI neutral, MACD near zero, price near VWAP.",
            f"Regime is {regime} — no clear tailwind from market conditions.",
            "Historical pattern data not available in demo mode.",
            "No urgency but no clear edge either. Avoid chasing if price moves sharply.",
            "Indicators lack confluence. Momentum and volume are inconclusive.",
        ),
        "Sell": (
            f"{symbol} shows bearish signals with score {score}/100. "
            "Price is below VWAP and MACD histogram is negative.",
            "Negative MACD, price below VWAP, RSI below 50.",
            "RSI has not yet entered oversold territory which could indicate continued decline.",
            f"Regime is {regime}. Bearish regime likely contributed to score reduction.",
            "Historical pattern data not available in demo mode.",
            "Could see a relief bounce before continuing lower. Use stop-loss on any short.",
            "Volume declining with negative MACD crossover signals distribution.",
        ),
        "Strong Sell": (
            f"{symbol} has a weak signal (score: {score}/100). "
            "Multiple indicators aligned bearishly — price below VWAP, EMA50, and negative MACD.",
            "All major indicators bearish: price below EMA20/50, VWAP; MACD negative; RSI falling.",
            "No meaningful contradictions — broad weakness across all metrics.",
            f"Regime is {regime}. NO_TRADE or BEARISH regime amplifying the sell signal.",
            "Historical pattern data not available in demo mode.",
            "High risk if holding long positions. Stop-loss placement is critical.",
            "Broad selling pressure confirmed by volume and trend indicators.",
        ),
        "No Trade": (
            f"{symbol} score is {score}/100 but market regime ({regime}) makes trading inadvisable. "
            "Extreme volatility or bearish breadth overrides individual stock signals.",
            "Individual indicators may show promise but regime conditions dominate.",
            "Individual stock signal conflicts with overall market conditions.",
            f"Regime is {regime}. System recommends waiting for clearer market conditions.",
            "Historical pattern data not available in demo mode.",
            "Do not trade against regime. Wait for NEUTRAL or BULLISH market conditions.",
            "Market regime override: conditions do not support new positions.",
        ),
    }

    tpl = templates.get(sig, templates["Hold"])
    return {
        "recommendation_summary": tpl[0],
        "supporting_evidence": tpl[1],
        "contradictions": tpl[2],
        "regime_context": tpl[3],
        "pattern_context": tpl[4],
        "risk_assessment": tpl[5],
        "trade_rationale": tpl[6],
        "confidence_commentary": tpl[1],  # legacy compat
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
