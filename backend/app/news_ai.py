import json
from random import Random

import requests

from .config import NEWSAPI_KEY, OPENROUTER_API_KEY, OPENROUTER_MODEL
from .nifty50 import stock_by_symbol


def fetch_news(symbol: str) -> list[dict]:
    stock = stock_by_symbol(symbol)
    if not stock:
        raise ValueError("Unknown NIFTY 50 symbol.")

    if not NEWSAPI_KEY:
        return [
            {
                "title": f"{stock['name']} investors track earnings momentum and sector demand",
                "source": "Demo News",
                "url": "",
            },
            {
                "title": f"Brokerages review {stock['name']} after recent market volatility",
                "source": "Demo News",
                "url": "",
            },
            {
                "title": f"{stock['name']} outlook depends on margins, demand, and broader NIFTY trend",
                "source": "Demo News",
                "url": "",
            },
        ]

    response = requests.get(
        "https://newsapi.org/v2/everything",
        params={
            "q": f"{stock['name']} stock India OR NSE",
            "language": "en",
            "sortBy": "publishedAt",
            "pageSize": 5,
            "apiKey": NEWSAPI_KEY,
        },
        timeout=15,
    )
    response.raise_for_status()
    articles = response.json().get("articles", [])
    return [
        {
            "title": article.get("title", ""),
            "source": (article.get("source") or {}).get("name", "NewsAPI"),
            "url": article.get("url", ""),
        }
        for article in articles
        if article.get("title")
    ]


def _demo_sentiment(symbol: str, headlines: list[dict]) -> dict:
    rng = Random(symbol + "".join(item["title"] for item in headlines))
    score = rng.randint(-35, 45)
    classification = "Bullish" if score > 20 else "Bearish" if score < -20 else "Neutral"
    return {
        "classification": classification,
        "score": score,
        "explanation": (
            "Demo sentiment is based on headline tone and recent market context. "
            "The signal is informational only, so review fundamentals and risk before placing paper trades."
        ),
        "model": "demo-fallback",
    }


def analyze_sentiment(symbol: str) -> dict:
    headlines = fetch_news(symbol)
    if not OPENROUTER_API_KEY:
        return {"headlines": headlines, **_demo_sentiment(symbol, headlines)}

    prompt = {
        "task": "Analyze NIFTY 50 stock news sentiment for paper trading education.",
        "symbol": symbol,
        "headlines": [item["title"] for item in headlines],
        "output_schema": {
            "classification": "Bullish, Neutral, or Bearish",
            "score": "integer from -100 to 100",
            "explanation": "2-3 concise lines, no price prediction",
        },
    }
    response = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:5173",
            "X-Title": "QuantTrader AI",
        },
        json={
            "model": OPENROUTER_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a cautious equity news sentiment analyst. "
                        "Do not predict stock prices. Return valid JSON only."
                    ),
                },
                {"role": "user", "content": json.dumps(prompt)},
            ],
            "response_format": {"type": "json_object"},
        },
        timeout=30,
    )
    response.raise_for_status()
    content = response.json()["choices"][0]["message"]["content"]
    parsed = json.loads(content)
    return {
        "headlines": headlines,
        "classification": parsed.get("classification", "Neutral"),
        "score": int(parsed.get("score", 0)),
        "explanation": parsed.get("explanation", "No explanation returned."),
        "model": OPENROUTER_MODEL,
    }
