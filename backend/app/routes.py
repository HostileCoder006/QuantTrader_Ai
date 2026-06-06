from flask import Blueprint, jsonify, request

from .market import get_market, get_quote
from .news_ai import analyze_sentiment
from .portfolio import enrich_holdings, get_analytics, get_portfolio_summary
from .storage import execute_trade, get_transactions

api = Blueprint("api", __name__)


def error_response(message: str, status: int = 400):
    return jsonify({"error": message}), status


@api.get("/market")
def market():
    return jsonify(get_market())


@api.get("/market/<symbol>")
def quote(symbol: str):
    try:
        return jsonify(get_quote(symbol))
    except ValueError as exc:
        return error_response(str(exc), 404)


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


@api.get("/sentiment/<symbol>")
def sentiment(symbol: str):
    try:
        return jsonify(analyze_sentiment(symbol.upper()))
    except ValueError as exc:
        return error_response(str(exc), 404)
    except Exception as exc:
        return error_response(f"Unable to analyze sentiment: {exc}", 502)


@api.get("/analytics")
def analytics():
    return jsonify(get_analytics())
