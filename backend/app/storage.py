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
        # ── Original tables ────────────────────────────────────────────────
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

        # ── New tables (safe migrations — CREATE IF NOT EXISTS) ────────────

        # 1. Market regime history
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS market_regime (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp        TEXT    NOT NULL,
                regime           TEXT    NOT NULL,
                nifty_value      REAL,
                ema20            REAL,
                ema50            REAL,
                ema200           REAL,
                rsi              REAL,
                volatility_20d   REAL,
                score_adjustment INTEGER NOT NULL DEFAULT 0,
                details_json     TEXT
            )
            """
        )

        # 2. Recommendation journal
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS recommendation_journal (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol          TEXT    NOT NULL,
                timestamp       TEXT    NOT NULL,
                signal          TEXT    NOT NULL,
                confidence      TEXT    NOT NULL,
                score           INTEGER NOT NULL,
                price_at_signal REAL,
                indicators_json TEXT,
                sentiment_json  TEXT,
                regime          TEXT,
                target          REAL,
                stop_loss       REAL,
                data_source     TEXT
            )
            """
        )

        # 3. Journal outcomes (forward return tracking)
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS journal_outcomes (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                journal_id      INTEGER NOT NULL REFERENCES recommendation_journal(id),
                outcome_period  INTEGER NOT NULL,
                price_at_outcome REAL,
                return_pct      REAL,
                vs_nifty_return REAL,
                outcome_date    TEXT,
                computed_at     TEXT
            )
            """
        )

        # 4. News sentiment cache (avoid re-sending same headlines to DeepSeek)
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS news_cache (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol         TEXT NOT NULL,
                cache_key      TEXT NOT NULL,
                headlines_json TEXT,
                sentiment_json TEXT,
                fetched_at     TEXT NOT NULL,
                UNIQUE(symbol, cache_key)
            )
            """
        )

        # 5. News → price reaction tracker
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS news_price_reactions (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol           TEXT NOT NULL,
                article_hash     TEXT NOT NULL UNIQUE,
                headline         TEXT,
                sentiment_score  INTEGER,
                sentiment_class  TEXT,
                price_at_news    REAL,
                price_1d         REAL,
                price_5d         REAL,
                price_20d        REAL,
                return_1d        REAL,
                return_5d        REAL,
                return_20d       REAL,
                recorded_at      TEXT NOT NULL,
                resolved_1d_at   TEXT,
                resolved_5d_at   TEXT,
                resolved_20d_at  TEXT
            )
            """
        )

        # Indexes for common query patterns
        db.execute(
            "CREATE INDEX IF NOT EXISTS idx_regime_ts ON market_regime(timestamp DESC)"
        )
        db.execute(
            "CREATE INDEX IF NOT EXISTS idx_journal_symbol ON recommendation_journal(symbol)"
        )
        db.execute(
            "CREATE INDEX IF NOT EXISTS idx_journal_ts ON recommendation_journal(timestamp DESC)"
        )
        db.execute(
            "CREATE INDEX IF NOT EXISTS idx_outcomes_jid ON journal_outcomes(journal_id)"
        )
        db.execute(
            "CREATE INDEX IF NOT EXISTS idx_reactions_symbol ON news_price_reactions(symbol)"
        )
        db.execute(
            "CREATE INDEX IF NOT EXISTS idx_news_cache_key ON news_cache(symbol, cache_key)"
        )

        # ── Opportunity Scanner tables ─────────────────────────────────────

        # 6. Full scan results (JSON blob per scan run, for history + self-eval)
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS opportunity_scan_results (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                scan_id          TEXT    NOT NULL UNIQUE,
                horizon          TEXT    NOT NULL,
                risk_profile     TEXT    NOT NULL,
                regime           TEXT,
                scanned_at       TEXT    NOT NULL,
                candidates_json  TEXT    NOT NULL,
                meta_json        TEXT
            )
            """
        )

        # 7. Committee analysis cache — keyed by (scan_id, symbol, step)
        #    step: "analyst_technical" | "analyst_fundamental" | ... |
        #          "synthesis" | "debate" | "full_committee" | "full_committee_deep"
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS opportunity_committee_cache (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                scan_id     TEXT NOT NULL,
                symbol      TEXT NOT NULL,
                step        TEXT NOT NULL,
                result_json TEXT NOT NULL,
                created_at  TEXT NOT NULL,
                UNIQUE(scan_id, symbol, step)
            )
            """
        )

        # 8. Opportunity self-evaluation — stores the final ranked rec for
        #    later accuracy measurement once outcomes are known
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS opportunity_recommendations (
                id                   INTEGER PRIMARY KEY AUTOINCREMENT,
                scan_id              TEXT NOT NULL,
                symbol               TEXT NOT NULL,
                rank                 INTEGER NOT NULL,
                horizon              TEXT NOT NULL,
                risk_profile         TEXT NOT NULL,
                opportunity_score    REAL,
                committee_rec        TEXT,
                committee_conviction TEXT,
                predicted_lo         REAL,
                predicted_hi         REAL,
                price_at_rec         REAL,
                regime               TEXT,
                recorded_at          TEXT NOT NULL,
                -- outcome fields (filled later)
                outcome_price        REAL,
                actual_return_pct    REAL,
                outcome_date         TEXT,
                was_correct          INTEGER
            )
            """
        )

        db.execute(
            "CREATE INDEX IF NOT EXISTS idx_opp_scan_id ON opportunity_scan_results(scan_id)"
        )
        db.execute(
            "CREATE INDEX IF NOT EXISTS idx_opp_cache ON opportunity_committee_cache(scan_id, symbol)"
        )
        db.execute(
            "CREATE INDEX IF NOT EXISTS idx_opp_rec_symbol ON opportunity_recommendations(symbol)"
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
