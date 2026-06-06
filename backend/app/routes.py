from flask import Blueprint, jsonify, request

from .ai_analyst import analyse_portfolio, explain_signal, generate_market_brief
from .backtester import run_backtest
from .market import get_market, get_nifty_index, get_quote
from .news_ai import analyze_sentiment
from .portfolio import enrich_holdings, get_analytics, get_portfolio_summary
from .risk import get_portfolio_risk, get_stock_risk
from .scanner import scan_market
from .signals import generate_signal
from .storage import execute_trade, get_transactions

api = Blueprint("api", __name__)


def error_response(message: str, status: int = 400):
    return jsonify({"error": message}), status


# ---------------------------------------------------------------------------
# Market endpoints
# ---------------------------------------------------------------------------

@api.get("/market")
def market():
    return jsonify(get_market())


@api.get("/market/<symbol>")
def quote(symbol: str):
    try:
        return jsonify(get_quote(symbol))
    except ValueError as exc:
        return error_response(str(exc), 404)


@api.get("/nifty")
def nifty_index():
    """NIFTY 50 Index — current value, change, change %."""
    return jsonify(get_nifty_index())


# ---------------------------------------------------------------------------
# Quantitative signal endpoints
# ---------------------------------------------------------------------------

@api.get("/signal/<symbol>")
def signal(symbol: str):
    """Full quantitative signal + targets for a single stock."""
    try:
        return jsonify(generate_signal(symbol.upper()))
    except ValueError as exc:
        return error_response(str(exc), 404)
    except Exception as exc:
        return error_response(f"Signal computation failed: {exc}", 502)


@api.get("/signal/<symbol>/explain")
def signal_explain(symbol: str):
    """
    Generate a quantitative signal then pass it to DeepSeek for explanation.
    Returns: signal data + AI explanation.
    """
    try:
        sig = generate_signal(symbol.upper())
        explanation = explain_signal(sig)
        return jsonify({**sig, "ai_explanation": explanation})
    except ValueError as exc:
        return error_response(str(exc), 404)
    except Exception as exc:
        return error_response(f"Signal explanation failed: {exc}", 502)


# ---------------------------------------------------------------------------
# Scanner endpoint
# ---------------------------------------------------------------------------

@api.get("/scanner")
def scanner():
    """
    Full NIFTY 50 market scan.
    Returns top buy/sell/momentum/volume signals.
    """
    try:
        return jsonify(scan_market())
    except Exception as exc:
        return error_response(f"Market scan failed: {exc}", 502)


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
# Backtesting
# ---------------------------------------------------------------------------

@api.get("/backtest/<symbol>")
def backtest(symbol: str):
    """
    Run a backtest for a NIFTY 50 symbol.
    Query params:
      - strategy: momentum | ema_crossover | rsi_reversal | sentiment  (default: momentum)
      - period:   1y | 2y | 5y  (default: 1y)
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
# Sentiment (existing)
# ---------------------------------------------------------------------------

@api.get("/sentiment/<symbol>")
def sentiment(symbol: str):
    try:
        return jsonify(analyze_sentiment(symbol.upper()))
    except ValueError as exc:
        return error_response(str(exc), 404)
    except Exception as exc:
        return error_response(f"Unable to analyze sentiment: {exc}", 502)


# ---------------------------------------------------------------------------
# AI Market Brief
# ---------------------------------------------------------------------------

@api.get("/market/brief")
def market_brief():
    """Daily AI-generated market intelligence report."""
    try:
        nifty = get_nifty_index()
        from .scanner import scan_market as _scan
        scan = _scan()
        top_gainers = sorted(scan["all_signals"], key=lambda s: s["indicators"]["daily_momentum"], reverse=True)[:5]
        top_losers = sorted(scan["all_signals"], key=lambda s: s["indicators"]["daily_momentum"])[:5]
        brief = generate_market_brief(nifty, top_gainers, top_losers, scan["all_signals"])
        return jsonify({**brief, "nifty": nifty})
    except Exception as exc:
        return error_response(f"Market brief failed: {exc}", 502)
