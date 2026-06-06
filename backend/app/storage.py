import sqlite3
from contextlib import contextmanager
from datetime import datetime

from .config import DATABASE_PATH, STARTING_BALANCE


@contextmanager
def get_connection():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def init_database() -> None:
    with get_connection() as db:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                virtual_balance REAL NOT NULL
            )
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS holdings (
                stock_symbol TEXT PRIMARY KEY,
                quantity INTEGER NOT NULL,
                average_price REAL NOT NULL
            )
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stock_symbol TEXT NOT NULL,
                buy_or_sell TEXT NOT NULL CHECK (buy_or_sell IN ('BUY', 'SELL')),
                quantity INTEGER NOT NULL,
                price REAL NOT NULL,
                timestamp TEXT NOT NULL,
                realized_pl REAL NOT NULL DEFAULT 0
            )
            """
        )
        user = db.execute("SELECT id FROM users WHERE id = 1").fetchone()
        if not user:
            db.execute(
                "INSERT INTO users (id, virtual_balance) VALUES (1, ?)",
                (STARTING_BALANCE,),
            )


def get_balance() -> float:
    with get_connection() as db:
        row = db.execute("SELECT virtual_balance FROM users WHERE id = 1").fetchone()
        return float(row["virtual_balance"])


def get_holdings() -> list[dict]:
    with get_connection() as db:
        rows = db.execute(
            "SELECT stock_symbol, quantity, average_price FROM holdings ORDER BY stock_symbol"
        ).fetchall()
        return [dict(row) for row in rows]


def get_transactions() -> list[dict]:
    with get_connection() as db:
        rows = db.execute(
            """
            SELECT id, stock_symbol, buy_or_sell, quantity, price, timestamp, realized_pl
            FROM transactions
            ORDER BY datetime(timestamp) DESC, id DESC
            """
        ).fetchall()
        return [dict(row) for row in rows]


def execute_trade(symbol: str, side: str, quantity: int, price: float) -> dict:
    if quantity <= 0:
        raise ValueError("Quantity must be greater than zero.")
    if price <= 0:
        raise ValueError("Price must be greater than zero.")

    normalized_side = side.upper()
    if normalized_side not in {"BUY", "SELL"}:
        raise ValueError("Trade side must be BUY or SELL.")

    with get_connection() as db:
        balance = float(
            db.execute("SELECT virtual_balance FROM users WHERE id = 1").fetchone()[
                "virtual_balance"
            ]
        )
        holding = db.execute(
            "SELECT quantity, average_price FROM holdings WHERE stock_symbol = ?",
            (symbol,),
        ).fetchone()
        current_quantity = int(holding["quantity"]) if holding else 0
        average_price = float(holding["average_price"]) if holding else 0.0
        realized_pl = 0.0

        if normalized_side == "BUY":
            cost = quantity * price
            if cost > balance:
                raise ValueError("Insufficient virtual cash for this buy order.")
            new_quantity = current_quantity + quantity
            new_average = (
                (current_quantity * average_price) + cost
            ) / new_quantity
            balance -= cost
            db.execute(
                """
                INSERT INTO holdings (stock_symbol, quantity, average_price)
                VALUES (?, ?, ?)
                ON CONFLICT(stock_symbol) DO UPDATE SET
                    quantity = excluded.quantity,
                    average_price = excluded.average_price
                """,
                (symbol, new_quantity, new_average),
            )
        else:
            if quantity > current_quantity:
                raise ValueError("Cannot sell more shares than currently held.")
            proceeds = quantity * price
            realized_pl = (price - average_price) * quantity
            balance += proceeds
            remaining = current_quantity - quantity
            if remaining == 0:
                db.execute("DELETE FROM holdings WHERE stock_symbol = ?", (symbol,))
            else:
                db.execute(
                    "UPDATE holdings SET quantity = ? WHERE stock_symbol = ?",
                    (remaining, symbol),
                )

        db.execute(
            "UPDATE users SET virtual_balance = ? WHERE id = 1",
            (balance,),
        )
        timestamp = datetime.utcnow().isoformat(timespec="seconds")
        cursor = db.execute(
            """
            INSERT INTO transactions
                (stock_symbol, buy_or_sell, quantity, price, timestamp, realized_pl)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (symbol, normalized_side, quantity, price, timestamp, realized_pl),
        )
        return {
            "id": cursor.lastrowid,
            "stock_symbol": symbol,
            "buy_or_sell": normalized_side,
            "quantity": quantity,
            "price": price,
            "timestamp": timestamp,
            "realized_pl": realized_pl,
            "virtual_balance": balance,
        }
