# QuantTrader AI

AI-powered paper trading platform for NIFTY 50 stocks. Users invest virtual money, track portfolio performance, and review AI-assisted news sentiment. No real trading occurs.

## Stack

- Frontend: React, TypeScript, Tailwind CSS, Recharts
- Backend: Python Flask, SQLite
- Data: yfinance, NewsAPI, OpenRouter DeepSeek

## Quick Start

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
flask --app app run --debug --port 5000
```

If `NEWSAPI_KEY` or `OPENROUTER_API_KEY` are not configured, the API returns deterministic demo sentiment so the app remains fully usable for portfolio demos.

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## Environment

Backend `.env`:

```text
NEWSAPI_KEY=
OPENROUTER_API_KEY=
OPENROUTER_MODEL=deepseek/deepseek-chat
DATABASE_PATH=quanttrader.db
```

## Notes

- Version 1 is manual paper trading only.
- The AI analyzes market sentiment from news and provides explanatory insights.
- The app does not predict prices, execute trades, use crypto, or implement reinforcement learning.
