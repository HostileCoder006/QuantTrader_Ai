from __future__ import annotations

from .config import STARTING_BALANCE
from .market import get_quote
from .nifty50 import stock_by_symbol
from .storage import get_balance, get_holdings, get_transactions


def enrich_holdings() -> list[dict]:
    holdings = get_holdings()
    enriched = []
    for holding in holdings:
        quote = get_quote(holding["stock_symbol"])
        current_value = holding["quantity"] * quote["current_price"]
        cost_basis = holding["quantity"] * holding["average_price"]
        pl = current_value - cost_basis
        stock_meta = stock_by_symbol(holding["stock_symbol"]) or {}
        enriched.append(
            {
                **holding,
                "name": stock_meta.get("name", holding["stock_symbol"]),
                "sector": stock_meta.get("sector", "Unknown"),
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


def _calc_sector_concentration(holdings: list[dict]) -> dict:
    """Returns a dict of sector → allocation percentage."""
    total = sum(h["current_value"] for h in holdings)
    if total == 0:
        return {}
    sectors: dict[str, float] = {}
    for h in holdings:
        sector = h.get("sector", "Unknown")
        sectors[sector] = sectors.get(sector, 0) + h["current_value"]
    return {k: round((v / total) * 100, 2) for k, v in sorted(sectors.items(), key=lambda x: -x[1])}


def _calc_diversification_score(holdings: list[dict], sector_conc: dict) -> int:
    """
    Scores portfolio diversification 0–100.

    - Max 40 pts for number of holdings (1=4pts, 10+=40pts)
    - Max 40 pts for sector diversity (1=5pts, 8+=40pts)
    - Max 20 pts for avoiding concentration (top sector < 40% → +20, < 60% → +10)
    """
    if not holdings:
        return 0

    score = 0
    n = len(holdings)
    score += min(40, n * 4)

    n_sectors = len(sector_conc)
    score += min(40, n_sectors * 5)

    top_concentration = max(sector_conc.values(), default=100)
    if top_concentration < 40:
        score += 20
    elif top_concentration < 60:
        score += 10

    return min(100, score)


def _calc_health_score(
    total_return_percent: float,
    diversification_score: int,
    cash_utilization: float,
    risk_exposure: float,
) -> int:
    """
    Portfolio Health Score 0–100.

    Components:
      - Performance (30 pts): based on total return
      - Diversification (30 pts): from diversification score
      - Cash utilization (20 pts): having 10–40% cash is healthy
      - Risk exposure (20 pts): not too concentrated in single positions
    """
    score = 0

    # Performance
    if total_return_percent >= 15:
        score += 30
    elif total_return_percent >= 5:
        score += 20
    elif total_return_percent >= 0:
        score += 10
    elif total_return_percent >= -10:
        score += 5

    # Diversification
    score += int(diversification_score * 0.30)

    # Cash utilization: 10–40% is healthy
    if 10 <= cash_utilization <= 40:
        score += 20
    elif cash_utilization > 90:
        score += 8
    elif cash_utilization < 5:
        score += 5
    else:
        score += 14

    # Risk exposure (lower max single-position concentration = better)
    if risk_exposure <= 25:
        score += 20
    elif risk_exposure <= 40:
        score += 12
    elif risk_exposure <= 60:
        score += 6

    return min(100, score)


def get_portfolio_summary() -> dict:
    cash = get_balance()
    holdings = enrich_holdings()
    invested_value = sum(item["current_value"] for item in holdings)
    portfolio_value = cash + invested_value
    total_pl = portfolio_value - STARTING_BALANCE
    top_stock = max(holdings, key=lambda item: item["return_percent"], default=None)

    sector_concentration = _calc_sector_concentration(holdings)
    diversification_score = _calc_diversification_score(holdings, sector_concentration)
    cash_utilization = round((cash / portfolio_value) * 100, 2) if portfolio_value > 0 else 100.0
    max_single_alloc = max((h["allocation_percent"] for h in holdings), default=0)

    health_score = _calc_health_score(
        total_return_percent=round((total_pl / STARTING_BALANCE) * 100, 2),
        diversification_score=diversification_score,
        cash_utilization=cash_utilization,
        risk_exposure=max_single_alloc,
    )

    return {
        "portfolio_value": round(portfolio_value, 2),
        "available_cash": round(cash, 2),
        "invested_value": round(invested_value, 2),
        "total_profit_loss": round(total_pl, 2),
        "total_return_percent": round((total_pl / STARTING_BALANCE) * 100, 2),
        "top_performing_stock": top_stock,
        "holdings": holdings,
        # Intelligence fields
        "health_score": health_score,
        "diversification_score": diversification_score,
        "cash_utilization": cash_utilization,
        "sector_concentration": sector_concentration,
        "max_single_allocation": round(max_single_alloc, 2),
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
