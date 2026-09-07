from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from .ai_analyst import _call_llm
from .config import OPENROUTER_API_KEY, OPENROUTER_MODEL
from .storage import get_connection

logger = logging.getLogger(__name__)


def _safe_int(value: object, default: int = 50) -> int:
    try:
        return max(0, min(100, int(float(str(value)))))
    except (ValueError, TypeError):
        return default


def _safe_recommendation(value: object) -> str:
    v = str(value).strip().upper()
    if "BUY" in v:
        return "BUY"
    if "SELL" in v:
        return "SELL"
    return "HOLD"


ANALYSTS = {
    "technical": {
        "role":   "Senior Technical Analyst",
        "focus":  "price action, chart patterns, RSI/MACD/EMA momentum, volume, ATR, trend structure",
        "bias":   "data-driven, pattern-based, short-to-medium timeframe",
    },
    "fundamental": {
        "role":   "Equity Fundamental Analyst",
        "focus":  "sector positioning, relative strength within sector, business cycle stage",
        "bias":   "macro-sector alignment, reasonable valuation proxies",
    },
    "sentiment": {
        "role":   "Market Sentiment Analyst",
        "focus":  "news sentiment, market breadth, volume conviction, investor positioning",
        "bias":   "crowd psychology, contrarian signals, news flow",
    },
    "macro": {
        "role":   "Macro & Regime Analyst",
        "focus":  "market regime, NIFTY trend, sector rotation, risk-off/risk-on environment",
        "bias":   "top-down, regime-aware, risk-adjusted",
    },
    "contrarian": {
        "role":   "Contrarian Risk Analyst",
        "focus":  "overbought/oversold extremes, crowded trades, hidden risks, invalidation conditions",
        "bias":   "skeptical, risk-first, challenge consensus",
    },
}


_ANALYST_SCHEMA = {
    "recommendation": "BUY / HOLD / SELL (for this horizon)",
    "confidence":     "integer 0-100",
    "thesis":         "2-3 sentence core thesis",
    "evidence":       "key data points supporting the thesis (bullet list as array of strings)",
    "risks":          "main risks to the thesis (array of strings)",
    "invalidation":   "conditions that would invalidate this view (1-2 sentences)",
}

_DEBATE_SCHEMA = {
    "bull_case":     "strongest 2-3 sentence bull argument",
    "bear_case":     "strongest 2-3 sentence bear argument",
    "bull_rebuttal": "bull response to the bear case",
    "bear_rebuttal": "bear response to the bull case",
    "key_tension":   "the single most important unresolved disagreement",
}

_SYNTHESIS_SCHEMA = {
    "final_recommendation": "BUY / HOLD / SELL",
    "conviction":           "HIGH / MEDIUM / LOW",
    "consensus_score":      "integer 0-100 (weighted view, NOT a simple vote count)",
    "thesis":               "3-4 sentence synthesis of all views",
    "strongest_bull":       "the most compelling bull argument",
    "strongest_bear":       "the most compelling bear argument",
    "key_risks":            "array of 2-3 most important risks",
    "conditions_to_watch":  "array of 2-3 triggers that would change the view",
    "disclaimer":           "must state this is for educational paper-trading only",
}


def _cache_get(scan_id: str, symbol: str, step: str) -> dict | None:
    try:
        with get_connection() as db:
            row = db.execute(
                """
                SELECT result_json FROM opportunity_committee_cache
                WHERE scan_id=? AND symbol=? AND step=?
                """,
                (scan_id, symbol, step),
            ).fetchone()
            if row:
                return json.loads(row["result_json"])
    except Exception as exc:
        logger.debug("Cache read failed: %s", exc)
    return None


def _cache_set(scan_id: str, symbol: str, step: str, result: dict) -> None:
    try:
        with get_connection() as db:
            db.execute(
                """
                INSERT OR REPLACE INTO opportunity_committee_cache
                    (scan_id, symbol, step, result_json, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    scan_id, symbol, step,
                    json.dumps(result),
                    datetime.now(timezone.utc).isoformat(),
                ),
            )
    except Exception as exc:
        logger.debug("Cache write failed: %s", exc)


def _build_stock_summary(candidate: dict, regime: dict) -> dict:
    """
    Build a compact evidence dict for DeepSeek.
    Sends only calculated stats — no raw price arrays.
    """
    ind = candidate
    pattern = candidate.get("pattern", {})
    primary_stat = pattern.get("primary_stat", {}) if pattern.get("data_available") else {}

    return {
        "symbol":           candidate.get("symbol"),
        "name":             candidate.get("name"),
        "sector":           candidate.get("sector"),
        "current_price":    candidate.get("current_price"),
        "opportunity_score": candidate.get("opportunity_score"),
        "rank":             candidate.get("rank"),
        "horizon":          candidate.get("_horizon_label", "2–4 Weeks"),
        "indicators": {
            "rsi":              candidate.get("rsi"),
            "macd_crossover":   candidate.get("macd", {}).get("crossover"),
            "macd_histogram":   candidate.get("macd", {}).get("histogram"),
            "price_vs_ema20":   "above" if candidate.get("current_price", 0) > candidate.get("ema20", 0) else "below",
            "price_vs_ema50":   "above" if candidate.get("current_price", 0) > candidate.get("ema50", 0) else "below",
            "volume_change_pct": candidate.get("volume_change"),
            "daily_momentum_pct": candidate.get("daily_momentum"),
            "atr_pct":          candidate.get("atr_pct"),
        },
        "factor_scores":    candidate.get("factor_scores", {}),
        "targets": {
            "entry":       candidate.get("entry"),
            "target":      candidate.get("target"),
            "stop_loss":   candidate.get("stop_loss"),
            "risk_reward": candidate.get("risk_reward"),
        },
        "estimated_return": {
            "low_pct":  candidate.get("estimated_return_lo"),
            "high_pct": candidate.get("estimated_return_hi"),
        },
        "historical_evidence": {
            "data_available":  primary_stat.get("data_available", False),
            "similar_setups":  pattern.get("similar_setups"),
            "win_rate_pct":    primary_stat.get("win_rate"),
            "avg_return_pct":  primary_stat.get("avg_return"),
            "best_return_pct": primary_stat.get("best_return"),
            "worst_return_pct": primary_stat.get("worst_return"),
        },
        "market_regime": {
            "regime":            regime.get("regime"),
            "rsi":               regime.get("rsi"),
            "volatility_20d":    regime.get("volatility_20d"),
            "score_adjustment":  regime.get("score_adjustment"),
        },
    }


def _analyst_review(
    analyst_key: str,
    stock_summary: dict,
    scan_id: str,
) -> dict:
    """Single analyst reviews one stock. Returns structured analysis."""
    symbol = stock_summary["symbol"]
    cached = _cache_get(scan_id, symbol, f"analyst_{analyst_key}")
    if cached:
        return cached

    analyst = ANALYSTS[analyst_key]
    system_prompt = (
        f"You are a {analyst['role']} on an investment committee for a paper-trading educational platform. "
        f"Your expertise covers: {analyst['focus']}. "
        f"Your analytical bias: {analyst['bias']}. "
        "You receive structured quantitative data — no raw prices. "
        "Give a concise, evidence-based analysis. DO NOT invent data. "
        "If data is absent, say DATA UNAVAILABLE. "
        "This is for educational paper trading only. Return valid JSON only."
    )

    payload = {
        "task":        f"Analyze this short-term opportunity from your {analyst['role']} perspective.",
        "stock_data":  stock_summary,
        "output_schema": _ANALYST_SCHEMA,
    }

    try:
        raw = _call_llm(system_prompt, payload, timeout=40)
        parsed = json.loads(raw)
        result = {
            "analyst":        analyst_key,
            "role":           analyst["role"],
            "recommendation": _safe_recommendation(parsed.get("recommendation", "HOLD")),
            "confidence":     _safe_int(parsed.get("confidence", 50)),
            "thesis":         parsed.get("thesis", ""),
            "evidence":       parsed.get("evidence", []),
            "risks":          parsed.get("risks", []),
            "invalidation":   parsed.get("invalidation", ""),
            "model":          OPENROUTER_MODEL,
        }
    except Exception as exc:
        logger.warning("Analyst %s failed for %s: %s", analyst_key, symbol, exc)
        result = _demo_analyst_review(analyst_key, stock_summary)

    _cache_set(scan_id, symbol, f"analyst_{analyst_key}", result)
    return result


def _committee_synthesis(
    symbol: str,
    stock_summary: dict,
    analyst_results: list[dict],
    debate: dict | None,
    scan_id: str,
) -> dict:
    """Final committee synthesis combining all analyst views."""
    cached = _cache_get(scan_id, symbol, "synthesis")
    if cached:
        return cached

    # Build compact analyst summary for the synthesis call
    analyst_summary = [
        {
            "analyst":        r["analyst"],
            "role":           r["role"],
            "recommendation": r["recommendation"],
            "confidence":     r["confidence"],
            "thesis":         r["thesis"],
            "top_risk":       r["risks"][0] if r.get("risks") else "",
        }
        for r in analyst_results
    ]

    system_prompt = (
        "You are the chairman of an investment committee for a paper-trading educational platform. "
        "You have received independent analyses from five specialist analysts. "
        "Synthesize their views into a final committee decision. "
        "DO NOT simply count votes — weigh the quality of evidence. "
        "BE intellectually honest about disagreements. "
        "Confidence reflects evidence quality, not just consensus. "
        "Always include a disclaimer that this is for paper trading education only. "
        "Return valid JSON only."
    )

    payload = {
        "task":            "Produce the final committee synthesis for this short-term opportunity.",
        "stock_summary":   stock_summary,
        "analyst_views":   analyst_summary,
        "debate_summary":  debate,
        "output_schema":   _SYNTHESIS_SCHEMA,
    }

    try:
        raw = _call_llm(system_prompt, payload, timeout=50)
        parsed = json.loads(raw)
        result = {
            "final_recommendation": _safe_recommendation(parsed.get("final_recommendation", "HOLD")),
            "conviction":           parsed.get("conviction", "MEDIUM"),
            "consensus_score":      _safe_int(parsed.get("consensus_score", 50)),
            "thesis":               parsed.get("thesis", ""),
            "strongest_bull":       parsed.get("strongest_bull", ""),
            "strongest_bear":       parsed.get("strongest_bear", ""),
            "key_risks":            parsed.get("key_risks", []),
            "conditions_to_watch":  parsed.get("conditions_to_watch", []),
            "disclaimer":           parsed.get("disclaimer", "For educational paper trading only."),
            "model":                OPENROUTER_MODEL,
        }
    except Exception as exc:
        logger.warning("Synthesis failed for %s: %s", symbol, exc)
        result = _demo_synthesis(stock_summary, analyst_results)

    _cache_set(scan_id, symbol, "synthesis", result)
    return result


def _bull_bear_debate(
    symbol: str,
    stock_summary: dict,
    bull_analysts: list[dict],
    bear_analysts: list[dict],
    scan_id: str,
) -> dict:
    """Bull vs bear structured debate. Only for top 3 candidates."""
    cached = _cache_get(scan_id, symbol, "debate")
    if cached:
        return cached

    system_prompt = (
        "You are a moderator of an investment committee debate for a paper-trading platform. "
        "Present the strongest possible arguments on both sides. "
        "Do not invent data — only use what is provided. "
        "Return valid JSON only."
    )

    # Compact bull/bear evidence
    bull_args = [
        {"analyst": a["analyst"], "thesis": a["thesis"]}
        for a in bull_analysts
    ]
    bear_args = [
        {"analyst": a["analyst"], "thesis": a["thesis"]}
        for a in bear_analysts
    ]

    payload = {
        "task":          "Structure a bull vs bear debate for this opportunity.",
        "stock_summary": stock_summary,
        "bull_positions": bull_args,
        "bear_positions": bear_args,
        "output_schema": _DEBATE_SCHEMA,
    }

    try:
        raw = _call_llm(system_prompt, payload, timeout=40)
        parsed = json.loads(raw)
        result = {
            "bull_case":     parsed.get("bull_case", ""),
            "bear_case":     parsed.get("bear_case", ""),
            "bull_rebuttal": parsed.get("bull_rebuttal", ""),
            "bear_rebuttal": parsed.get("bear_rebuttal", ""),
            "key_tension":   parsed.get("key_tension", ""),
            "model":         OPENROUTER_MODEL,
        }
    except Exception as exc:
        logger.warning("Debate failed for %s: %s", symbol, exc)
        result = {
            "bull_case":     "Positive technical momentum and volume confirm buying interest.",
            "bear_case":     "Market regime uncertainty and overextended RSI pose risks.",
            "bull_rebuttal": "Short-term momentum historically precedes sustained moves.",
            "bear_rebuttal": "Regime headwinds can override individual stock signals.",
            "key_tension":   "Whether regime risk outweighs individual stock strength.",
            "model":         "demo-fallback",
        }

    _cache_set(scan_id, symbol, "debate", result)
    return result


def run_committee_quick(candidates: list[dict], scan_id: str, regime: dict) -> dict:
    """
    Quick mode: 1 LLM call — synthesis of top-3 without individual analyst calls.
    """
    top3 = candidates[:3]
    if not top3 or not OPENROUTER_API_KEY:
        return _demo_quick(candidates[:3], regime)

    # Attach horizon label
    for c in top3:
        c["_horizon_label"] = candidates[0].get("_horizon_label", "2–4 Weeks")

    summaries = [_build_stock_summary(c, regime) for c in top3]

    system_prompt = (
        "You are a senior investment analyst on a paper-trading educational platform. "
        "Quickly rank and comment on these 3 short-term opportunities. "
        "Be concise — 2-3 sentences per stock. "
        "State clearly these are for educational purposes only. "
        "Return valid JSON only."
    )
    payload = {
        "task":        "Quick-rank these 3 short-term opportunities.",
        "candidates":  summaries,
        "output_schema": {
            "rankings": [
                {
                    "rank": "integer",
                    "symbol": "string",
                    "recommendation": "BUY/HOLD/SELL",
                    "confidence": "integer 0-100",
                    "one_line_thesis": "string",
                    "key_risk": "string",
                }
            ],
            "market_comment": "1 sentence on overall market conditions",
            "disclaimer": "must state for educational paper trading only",
        },
    }

    try:
        raw = _call_llm(system_prompt, payload, timeout=45)
        parsed = json.loads(raw)
        # Normalise each ranking entry defensively
        rankings = parsed.get("rankings", [])
        safe_rankings = []
        for r in rankings:
            safe_rankings.append({
                "rank":             _safe_int(r.get("rank", 1), 1),
                "symbol":           str(r.get("symbol", "")),
                "recommendation":   _safe_recommendation(r.get("recommendation", "HOLD")),
                "confidence":       _safe_int(r.get("confidence", 50)),
                "one_line_thesis":  str(r.get("one_line_thesis", "")),
                "key_risk":         str(r.get("key_risk", "")),
            })
        return {
            "mode": "quick",
            "rankings": safe_rankings,
            "market_comment": parsed.get("market_comment", ""),
            "disclaimer": parsed.get("disclaimer", "For educational paper trading only."),
            "model": OPENROUTER_MODEL,
        }
    except Exception as exc:
        logger.warning("Quick committee failed: %s", exc)
        return _demo_quick(candidates[:3], regime)


def run_committee_standard(
    candidates: list[dict],
    scan_id: str,
    regime: dict,
    horizon_label: str = "2–4 Weeks",
) -> list[dict]:
    """
    Standard mode: full 5-analyst review + synthesis for each of top-5.
    Returns list of committee results, one per stock.
    """
    top5 = candidates[:5]
    results = []

    for candidate in top5:
        candidate["_horizon_label"] = horizon_label
        symbol = candidate["symbol"]
        stock_summary = _build_stock_summary(candidate, regime)

        # Check if full committee result is already cached
        cached_full = _cache_get(scan_id, symbol, "full_committee")
        if cached_full:
            results.append(cached_full)
            continue

        if not OPENROUTER_API_KEY:
            result = _demo_full_committee(candidate, regime)
            results.append(result)
            continue

        # Run all 5 analysts
        analyst_results = []
        for analyst_key in ANALYSTS:
            ar = _analyst_review(analyst_key, stock_summary, scan_id)
            analyst_results.append(ar)

        # Determine bull / bear split
        buy_analysts  = [a for a in analyst_results if a["recommendation"] == "BUY"]
        sell_analysts = [a for a in analyst_results if a["recommendation"] == "SELL"]
        hold_analysts = [a for a in analyst_results if a["recommendation"] == "HOLD"]

        synthesis = _committee_synthesis(
            symbol, stock_summary, analyst_results, None, scan_id
        )

        full = {
            "symbol":          symbol,
            "name":            candidate.get("name"),
            "sector":          candidate.get("sector"),
            "opportunity_score": candidate.get("opportunity_score"),
            "rank":            candidate.get("rank"),
            "analyst_results": analyst_results,
            "synthesis":       synthesis,
            "vote_summary": {
                "buy":  len(buy_analysts),
                "hold": len(hold_analysts),
                "sell": len(sell_analysts),
            },
        }

        _cache_set(scan_id, symbol, "full_committee", full)
        results.append(full)

    return results


def run_committee_deep(
    candidates: list[dict],
    scan_id: str,
    regime: dict,
    horizon_label: str = "2–4 Weeks",
) -> list[dict]:
    """
    Deep mode: full committee + bull/bear debate for top-3, standard for 4-5.
    """
    top5 = candidates[:5]
    results = []

    for i, candidate in enumerate(top5):
        candidate["_horizon_label"] = horizon_label
        symbol = candidate["symbol"]
        stock_summary = _build_stock_summary(candidate, regime)

        cached_full = _cache_get(scan_id, symbol, "full_committee_deep")
        if cached_full:
            results.append(cached_full)
            continue

        if not OPENROUTER_API_KEY:
            result = _demo_full_committee(candidate, regime)
            results.append(result)
            continue

        # All 5 analysts
        analyst_results = []
        for analyst_key in ANALYSTS:
            ar = _analyst_review(analyst_key, stock_summary, scan_id)
            analyst_results.append(ar)

        buy_analysts  = [a for a in analyst_results if a["recommendation"] == "BUY"]
        sell_analysts = [a for a in analyst_results if a["recommendation"] == "SELL"]
        hold_analysts = [a for a in analyst_results if a["recommendation"] == "HOLD"]

        # Bull/bear debate for top 3 only
        debate = None
        if i < 3 and (buy_analysts or sell_analysts):
            debate = _bull_bear_debate(
                symbol, stock_summary,
                buy_analysts or hold_analysts,
                sell_analysts or hold_analysts,
                scan_id,
            )

        synthesis = _committee_synthesis(
            symbol, stock_summary, analyst_results, debate, scan_id
        )

        full = {
            "symbol":          symbol,
            "name":            candidate.get("name"),
            "sector":          candidate.get("sector"),
            "opportunity_score": candidate.get("opportunity_score"),
            "rank":            candidate.get("rank"),
            "analyst_results": analyst_results,
            "debate":          debate,
            "synthesis":       synthesis,
            "vote_summary": {
                "buy":  len(buy_analysts),
                "hold": len(hold_analysts),
                "sell": len(sell_analysts),
            },
        }

        _cache_set(scan_id, symbol, "full_committee_deep", full)
        results.append(full)

    return results


def run_committee(
    scan_result: dict,
    mode: str = "standard",
) -> dict:
    candidates    = scan_result.get("candidates", [])
    scan_id       = scan_result.get("scan_id", "unknown")
    regime        = scan_result.get("regime", {})
    horizon_label = scan_result.get("horizon_label", "2–4 Weeks")

    if not candidates:
        return {**scan_result, "committee": [], "committee_mode": mode}

    if mode == "quick":
        committee_result = run_committee_quick(candidates, scan_id, regime)
        return {
            **scan_result,
            "committee": committee_result,
            "committee_mode": "quick",
        }
    elif mode == "deep":
        committee_results = run_committee_deep(
            candidates, scan_id, regime, horizon_label
        )
    else:
        committee_results = run_committee_standard(
            candidates, scan_id, regime, horizon_label
        )

    return {
        **scan_result,
        "committee": committee_results,
        "committee_mode": mode,
    }


def _demo_analyst_review(analyst_key: str, stock_summary: dict) -> dict:
    analyst = ANALYSTS[analyst_key]
    symbol  = stock_summary.get("symbol", "UNKNOWN")
    score   = stock_summary.get("opportunity_score", 50)
    rec     = "BUY" if score >= 65 else "HOLD" if score >= 45 else "SELL"
    conf    = min(80, max(30, int(score * 0.8)))

    theses = {
        "technical":   f"{symbol} shows {'positive' if rec=='BUY' else 'mixed'} technical structure. RSI in {'healthy' if rec=='BUY' else 'neutral'} zone with MACD {'bullish' if rec=='BUY' else 'neutral'} momentum.",
        "fundamental": f"Sector positioning for {symbol} is {'supportive' if rec=='BUY' else 'neutral'}. Business cycle aligns with the current market environment.",
        "sentiment":   f"News flow for {symbol} is {'constructive' if rec=='BUY' else 'neutral'}. Volume conviction {'supports' if rec=='BUY' else 'does not strongly support'} the move.",
        "macro":       f"Macro regime is {stock_summary.get('market_regime',{}).get('regime','NEUTRAL')}. {symbol} {'benefits from' if rec=='BUY' else 'faces headwinds from'} the current environment.",
        "contrarian":  f"Risk check: {'No extreme overbought readings.' if rec!='SELL' else 'Watch for reversal signals.'} Stop-loss discipline is essential.",
    }

    return {
        "analyst":        analyst_key,
        "role":           analyst["role"],
        "recommendation": rec,
        "confidence":     conf,
        "thesis":         theses.get(analyst_key, "Analysis pending API key configuration."),
        "evidence":       ["Opportunity score: " + str(score), "Configure OPENROUTER_API_KEY for real analysis"],
        "risks":          ["Market regime risk", "Liquidity risk"],
        "invalidation":   "Price breaks below stop-loss level.",
        "model":          "demo-fallback",
    }


def _demo_synthesis(stock_summary: dict, analyst_results: list[dict]) -> dict:
    buys  = sum(1 for a in analyst_results if a.get("recommendation") == "BUY")
    sells = sum(1 for a in analyst_results if a.get("recommendation") == "SELL")
    rec   = "BUY" if buys > sells + 1 else "SELL" if sells > buys + 1 else "HOLD"
    score = stock_summary.get("opportunity_score", 50)

    return {
        "final_recommendation": rec,
        "conviction":           "MEDIUM",
        "consensus_score":      int(score),
        "thesis":               f"Committee review for {stock_summary.get('symbol')}. {buys}/5 analysts bullish, {sells}/5 bearish. Configure OPENROUTER_API_KEY for real committee analysis.",
        "strongest_bull":       "Technical momentum and volume confirm buying interest.",
        "strongest_bear":       "Market regime uncertainty poses risk.",
        "key_risks":            ["Market regime", "Liquidity", "Execution timing"],
        "conditions_to_watch":  ["Price vs stop-loss", "Regime change", "Volume confirmation"],
        "disclaimer":           "For educational paper trading only. Not investment advice.",
        "model":                "demo-fallback",
    }


def _demo_full_committee(candidate: dict, regime: dict) -> dict:
    stock_summary = _build_stock_summary(candidate, regime)
    analyst_results = [
        _demo_analyst_review(k, stock_summary) for k in ANALYSTS
    ]
    synthesis = _demo_synthesis(stock_summary, analyst_results)
    buys  = sum(1 for a in analyst_results if a["recommendation"] == "BUY")
    holds = sum(1 for a in analyst_results if a["recommendation"] == "HOLD")
    sells = sum(1 for a in analyst_results if a["recommendation"] == "SELL")

    return {
        "symbol":          candidate.get("symbol"),
        "name":            candidate.get("name"),
        "sector":          candidate.get("sector"),
        "opportunity_score": candidate.get("opportunity_score"),
        "rank":            candidate.get("rank"),
        "analyst_results": analyst_results,
        "debate":          None,
        "synthesis":       synthesis,
        "vote_summary":    {"buy": buys, "hold": holds, "sell": sells},
    }


def _demo_quick(candidates: list[dict], regime: dict) -> dict:
    rankings = []
    for i, c in enumerate(candidates):
        score = c.get("opportunity_score", 50)
        rec   = "BUY" if score >= 65 else "HOLD" if score >= 45 else "SELL"
        rankings.append({
            "rank":             i + 1,
            "symbol":           c.get("symbol"),
            "recommendation":   rec,
            "confidence":       min(80, max(30, int(score))),
            "one_line_thesis":  f"Opportunity score {score:.0f}/100 with {'positive' if rec=='BUY' else 'neutral'} technical setup.",
            "key_risk":         "Market regime and execution risk.",
        })

    return {
        "mode":           "quick",
        "rankings":       rankings,
        "market_comment": f"Market regime is {regime.get('regime','NEUTRAL')}. Configure OPENROUTER_API_KEY for real AI analysis.",
        "disclaimer":     "For educational paper trading only. Not investment advice.",
        "model":          "demo-fallback",
    }
