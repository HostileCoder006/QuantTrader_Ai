from flask import Blueprint, jsonify, request

from .ai_analyst import (
    analyse_portfolio,
    explain_signal_enriched,
    generate_market_brief,
)
from .backtester import run_backtest
from .journal import (
    get_journal,
    get_journal_stats,
    log_recommendation,
    resolve_pending_outcomes,
)
from .market import get_market, get_nifty_index, get_quote
from .news_ai import analyze_sentiment
from .news_tracker import (
    get_reaction_stats,
    record_news_reaction,
    resolve_pending_reactions,
)
from .pattern_search import find_similar_patterns
from .portfolio import enrich_holdings, get_analytics, get_portfolio_summary
from .regime import get_market_regime, get_regime_history
from .risk import get_portfolio_risk, get_stock_risk
from .scanner import scan_market
from .signals import generate_signal
from .storage import execute_trade, get_transactions
from .strategy_lab import get_available_indicators, run_custom_backtest

api = Blueprint("api", __name__)


def error_response(message: str, status: int = 400):
    return jsonify({"error": message}), status


# ---------------------------------------------------------------------------
# Market endpoints
# ---------------------------------------------------------------------------

@api.get("/market")
def market():
    return jsonify(get_market())


# NOTE: /market/brief must be registered BEFORE /market/<symbol>
@api.get("/market/brief")
def market_brief():
    """Daily AI-generated market intelligence report."""
    try:
        nifty = get_nifty_index()
        scan = scan_market()
        top_gainers = sorted(
            scan["all_signals"],
            key=lambda s: s["indicators"]["daily_momentum"],
            reverse=True,
        )[:5]
        top_losers = sorted(
            scan["all_signals"],
            key=lambda s: s["indicators"]["daily_momentum"],
        )[:5]
        brief = generate_market_brief(nifty, top_gainers, top_losers, scan["all_signals"])
        return jsonify({**brief, "nifty": nifty})
    except Exception as exc:
        return error_response(f"Market brief failed: {exc}", 502)


@api.get("/market/<symbol>")
def quote(symbol: str):
    try:
        return jsonify(get_quote(symbol))
    except ValueError as exc:
        return error_response(str(exc), 404)


@api.get("/nifty")
def nifty_index():
    return jsonify(get_nifty_index())


# ---------------------------------------------------------------------------
# Market Regime
# ---------------------------------------------------------------------------

@api.get("/regime")
def regime():
    """Current NIFTY 50 market regime."""
    try:
        cache_secs = int(request.args.get("cache", 300))
        return jsonify(get_market_regime(use_cache_seconds=cache_secs))
    except Exception as exc:
        return error_response(f"Regime calculation failed: {exc}", 502)


@api.get("/regime/history")
def regime_history():
    """Last N regime readings."""
    limit = min(int(request.args.get("limit", 30)), 200)
    return jsonify(get_regime_history(limit=limit))


# ---------------------------------------------------------------------------
# Quantitative signal endpoints
# ---------------------------------------------------------------------------

@api.get("/signal/<symbol>")
def signal(symbol: str):
    """Full quantitative signal + regime context for a single stock."""
    try:
        log = request.args.get("log", "false").lower() == "true"
        return jsonify(generate_signal(symbol.upper(), log_to_journal=log))
    except ValueError as exc:
        return error_response(str(exc), 404)
    except Exception as exc:
        return error_response(f"Signal computation failed: {exc}", 502)


@api.get("/signal/<symbol>/explain")
def signal_explain(symbol: str):
    """
    Generate a quantitative signal then pass ALL structured evidence to DeepSeek.
    Optionally fetches pattern context and sentiment for richer explanation.
    """
    try:
        sig = generate_signal(symbol.upper(), log_to_journal=True)

        # Optionally enrich with pattern + sentiment (can be slow — skip if needed)
        include_pattern = request.args.get("pattern", "true").lower() == "true"
        include_sentiment = request.args.get("sentiment", "true").lower() == "true"

        pattern_ctx = None
        sentiment_data = None

        if include_pattern:
            try:
                pattern_ctx = find_similar_patterns(symbol.upper())
            except Exception:
                pass

        if include_sentiment:
            try:
                sentiment_data = analyze_sentiment(symbol.upper())
            except Exception:
                pass

        regime_ctx = sig.get("regime_context")
        explanation = explain_signal_enriched(
            sig,
            regime=regime_ctx,
            pattern_context=pattern_ctx,
            sentiment=sentiment_data,
        )
        return jsonify({**sig, "ai_explanation": explanation, "pattern_context": pattern_ctx})
    except ValueError as exc:
        return error_response(str(exc), 404)
    except Exception as exc:
        return error_response(f"Signal explanation failed: {exc}", 502)


# ---------------------------------------------------------------------------
# Historical Pattern Search
# ---------------------------------------------------------------------------

@api.get("/pattern/<symbol>")
def pattern_search(symbol: str):
    """Find historical setups similar to today's indicator fingerprint."""
    try:
        return jsonify(find_similar_patterns(symbol.upper()))
    except ValueError as exc:
        return error_response(str(exc), 404)
    except Exception as exc:
        return error_response(f"Pattern search failed: {exc}", 502)


# ---------------------------------------------------------------------------
# Scanner
# ---------------------------------------------------------------------------

@api.get("/scanner")
def scanner():
    """Full NIFTY 50 market scan with regime context."""
    try:
        result = scan_market()
        # Attach current regime to the scan result
        try:
            regime_data = get_market_regime(use_cache_seconds=300)
            result["regime"] = regime_data
        except Exception:
            result["regime"] = None
        return jsonify(result)
    except Exception as exc:
        return error_response(f"Market scan failed: {exc}", 502)


# ---------------------------------------------------------------------------
# Recommendation Journal
# ---------------------------------------------------------------------------

@api.get("/journal")
def journal():
    """All recommendation journal entries with outcomes."""
    limit = min(int(request.args.get("limit", 200)), 500)
    # Trigger outcome resolution on each fetch (non-blocking best-effort)
    try:
        resolve_pending_outcomes()
    except Exception:
        pass
    return jsonify(get_journal(limit=limit))


@api.post("/journal")
def journal_log():
    """Manually log a recommendation to the journal."""
    payload = request.get_json(force=True)
    try:
        symbol = str(payload.get("symbol", "")).upper()
        sig = generate_signal(symbol, log_to_journal=False)
        jid = log_recommendation(sig)
        return jsonify({"id": jid, "status": "logged"}), 201
    except ValueError as exc:
        return error_response(str(exc), 400)
    except Exception as exc:
        return error_response(f"Journal log failed: {exc}", 502)


@api.get("/journal/stats")
def journal_stats():
    """Aggregate journal performance statistics."""
    try:
        resolve_pending_outcomes()
    except Exception:
        pass
    return jsonify(get_journal_stats())


# ---------------------------------------------------------------------------
# News → Price Reactions
# ---------------------------------------------------------------------------

@api.get("/news-reactions/<symbol>")
def news_reactions(symbol: str):
    """Historical news sentiment and price reaction stats for a symbol."""
    try:
        # Resolve any pending reactions
        try:
            resolve_pending_reactions()
        except Exception:
            pass
        return jsonify(get_reaction_stats(symbol.upper()))
    except ValueError as exc:
        return error_response(str(exc), 404)
    except Exception as exc:
        return error_response(f"News reaction stats failed: {exc}", 502)


# ---------------------------------------------------------------------------
# Portfolio endpoints
# ---------------------------------------------------------------------------

@api.get("/portfolio")
def portfolio():
    return jsonify(get_portfolio_summary())


@api.get("/holdings")
def holdings():
    return jsonify(enrich_holdings())


@api.get("/transactions")
def transactions():
    return jsonify(get_transactions())


@api.post("/trade")
def trade():
    payload = request.get_json(force=True)
    try:
        symbol = str(payload.get("stock_symbol", "")).upper()
        side = str(payload.get("buy_or_sell", "")).upper()
        quantity = int(payload.get("quantity", 0))
        price = float(payload.get("price", 0))
        result = execute_trade(symbol, side, quantity, price)
        return jsonify(result), 201
    except (TypeError, ValueError) as exc:
        return error_response(str(exc), 400)


@api.get("/analytics")
def analytics():
    return jsonify(get_analytics())


# ---------------------------------------------------------------------------
# Portfolio intelligence
# ---------------------------------------------------------------------------

@api.get("/portfolio/intelligence")
def portfolio_intelligence():
    """Portfolio health score + AI analysis."""
    try:
        summary = get_portfolio_summary()
        ai_analysis = analyse_portfolio(summary)
        return jsonify({**summary, "ai_analysis": ai_analysis})
    except Exception as exc:
        return error_response(f"Portfolio intelligence failed: {exc}", 502)


# ---------------------------------------------------------------------------
# Risk analytics
# ---------------------------------------------------------------------------

@api.get("/risk/<symbol>")
def stock_risk(symbol: str):
    """Risk analytics for a single stock."""
    try:
        return jsonify(get_stock_risk(symbol.upper()))
    except ValueError as exc:
        return error_response(str(exc), 404)
    except Exception as exc:
        return error_response(f"Risk analysis failed: {exc}", 502)


@api.get("/risk/portfolio/aggregate")
def portfolio_risk():
    """Aggregate risk analytics for the current portfolio."""
    try:
        enriched = enrich_holdings()
        risk = get_portfolio_risk(enriched)
        return jsonify(risk)
    except Exception as exc:
        return error_response(f"Portfolio risk calculation failed: {exc}", 502)


# ---------------------------------------------------------------------------
# Backtesting (existing)
# ---------------------------------------------------------------------------

@api.get("/backtest/<symbol>")
def backtest(symbol: str):
    """
    Run a backtest for a NIFTY 50 symbol.
    Query params: strategy, period
    """
    strategy = request.args.get("strategy", "momentum")
    period = request.args.get("period", "1y")
    try:
        result = run_backtest(symbol.upper(), strategy=strategy, period=period)  # type: ignore[arg-type]
        return jsonify(result)
    except ValueError as exc:
        return error_response(str(exc), 400)
    except Exception as exc:
        return error_response(f"Backtest failed: {exc}", 502)


# ---------------------------------------------------------------------------
# Strategy Lab — custom backtester
# ---------------------------------------------------------------------------

@api.get("/strategy-lab/indicators")
def strategy_lab_indicators():
    """List of available indicators and entry/exit rules for Strategy Lab."""
    return jsonify(get_available_indicators())


@api.post("/strategy-lab/run")
def strategy_lab_run():
    """
    Run a custom Strategy Lab backtest.

    POST body (JSON):
      symbol, entry_rule, entry_value, exit_rule, exit_value,
      ema_fast, ema_slow, stop_loss_pct, take_profit_pct,
      max_holding_days, trade_capital, initial_capital,
      cost_pct, slippage_pct, period
    """
    payload = request.get_json(force=True)
    try:
        symbol = str(payload.get("symbol", "RELIANCE")).upper()
        config = {k: v for k, v in payload.items() if k != "symbol"}
        result = run_custom_backtest(symbol, config)
        return jsonify(result)
    except ValueError as exc:
        return error_response(str(exc), 400)
    except Exception as exc:
        return error_response(f"Strategy Lab backtest failed: {exc}", 502)


# ---------------------------------------------------------------------------
# Sentiment (existing — now with caching + reaction recording)
# ---------------------------------------------------------------------------

@api.get("/sentiment/<symbol>")
def sentiment(symbol: str):
    """
    News sentiment for a symbol.
    Results are cached by headline hash. New events are recorded for
    price-reaction tracking.
    """
    try:
        from .news_tracker import get_cached_sentiment, store_sentiment_cache
        from .news_ai import fetch_news

        sym = symbol.upper()
        headlines = fetch_news(sym)

        # Check cache first
        cached = get_cached_sentiment(sym, headlines)
        if cached:
            return jsonify({"headlines": headlines, **cached, "from_cache": True})

        # Full analysis
        result = analyze_sentiment(sym)

        # Cache it
        try:
            store_sentiment_cache(sym, headlines, {
                "classification": result.get("classification"),
                "score": result.get("score"),
                "explanation": result.get("explanation"),
                "model": result.get("model"),
            })
        except Exception:
            pass

        # Record each headline for price-reaction tracking
        try:
            from .market import get_quote
            quote_data = get_quote(sym)
            current_price = quote_data.get("current_price", 0)
            for h in headlines[:3]:
                record_news_reaction(
                    symbol=sym,
                    headline=h.get("title", ""),
                    sentiment_score=int(result.get("score", 0)),
                    sentiment_class=result.get("classification", "Neutral"),
                    current_price=current_price,
                )
        except Exception:
            pass

        return jsonify({**result, "from_cache": False})
    except ValueError as exc:
        return error_response(str(exc), 404)
    except Exception as exc:
        return error_response(f"Unable to analyze sentiment: {exc}", 502)
