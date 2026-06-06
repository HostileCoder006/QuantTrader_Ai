from .config import STARTING_BALANCE
from .market import get_quote
from .storage import get_balance, get_holdings, get_transactions


def enrich_holdings() -> list[dict]:
    holdings = get_holdings()
    enriched = []
    for holding in holdings:
        quote = get_quote(holding["stock_symbol"])
        current_value = holding["quantity"] * quote["current_price"]
        cost_basis = holding["quantity"] * holding["average_price"]
        pl = current_value - cost_basis
        enriched.append(
            {
                **holding,
                "current_price": quote["current_price"],
                "daily_change_percent": quote["daily_change_percent"],
                "current_value": round(current_value, 2),
                "profit_loss": round(pl, 2),
                "return_percent": round((pl / cost_basis) * 100, 2) if cost_basis else 0,
            }
        )
    total_value = sum(item["current_value"] for item in enriched)
    for item in enriched:
        item["allocation_percent"] = (
            round((item["current_value"] / total_value) * 100, 2) if total_value else 0
        )
    return enriched


def get_portfolio_summary() -> dict:
    cash = get_balance()
    holdings = enrich_holdings()
    invested_value = sum(item["current_value"] for item in holdings)
    portfolio_value = cash + invested_value
    total_pl = portfolio_value - STARTING_BALANCE
    top_stock = max(holdings, key=lambda item: item["return_percent"], default=None)
    return {
        "portfolio_value": round(portfolio_value, 2),
        "available_cash": round(cash, 2),
        "invested_value": round(invested_value, 2),
        "total_profit_loss": round(total_pl, 2),
        "total_return_percent": round((total_pl / STARTING_BALANCE) * 100, 2),
        "top_performing_stock": top_stock,
        "holdings": holdings,
    }


def get_analytics() -> dict:
    transactions = get_transactions()
    summary = get_portfolio_summary()
    sells = [trade for trade in transactions if trade["buy_or_sell"] == "SELL"]
    best = max(sells, key=lambda trade: trade["realized_pl"], default=None)
    worst = min(sells, key=lambda trade: trade["realized_pl"], default=None)

    growth = []
    running_cash = STARTING_BALANCE
    for trade in reversed(transactions):
        value_delta = trade["quantity"] * trade["price"]
        running_cash += -value_delta if trade["buy_or_sell"] == "BUY" else value_delta
        growth.append(
            {
                "timestamp": trade["timestamp"],
                "portfolio_value": round(running_cash, 2),
            }
        )
    if not growth:
        growth.append({"timestamp": "Start", "portfolio_value": STARTING_BALANCE})
    growth.append(
        {
            "timestamp": "Now",
            "portfolio_value": summary["portfolio_value"],
        }
    )

    return {
        "growth": growth,
        "best_trade": best,
        "worst_trade": worst,
        "total_return_percent": summary["total_return_percent"],
        "transactions": transactions,
    }
