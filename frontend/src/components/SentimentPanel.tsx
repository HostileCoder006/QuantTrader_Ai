import { Brain, Newspaper } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Sentiment, Stock } from "../lib/types";

type SentimentPanelProps = {
  stock: Stock;
};

const sentimentColor = {
  Bullish: "text-mint",
  Neutral: "text-amber",
  Bearish: "text-red-300"
};

export function SentimentPanel({ stock }: SentimentPanelProps) {
  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    api
      .sentiment(stock.symbol)
      .then(setSentiment)
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load sentiment"))
      .finally(() => setLoading(false));
  }, [stock.symbol]);

  return (
    <section className="panel p-5">
      <div className="flex items-center gap-3">
        <div className="rounded-md border border-line bg-panel2 p-2 text-cyan">
          <Brain size={18} />
        </div>
        <div>
          <p className="text-sm text-slate-400">AI Sentiment</p>
          <h3 className="font-semibold text-white">{stock.name}</h3>
        </div>
      </div>
      {loading ? <p className="mt-5 text-sm text-slate-400">Analyzing headlines...</p> : null}
      {error ? <p className="mt-5 text-sm text-red-300">{error}</p> : null}
      {sentiment ? (
        <div className="mt-5 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-line bg-ink p-3">
              <p className="text-xs text-slate-500">Classification</p>
              <p className={`mt-1 text-lg font-semibold ${sentimentColor[sentiment.classification]}`}>
                {sentiment.classification}
              </p>
            </div>
            <div className="rounded-md border border-line bg-ink p-3">
              <p className="text-xs text-slate-500">Score</p>
              <p className="number mt-1 text-lg font-semibold text-white">{sentiment.score}</p>
            </div>
          </div>
          <p className="text-sm leading-6 text-slate-300">{sentiment.explanation}</p>
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-200">
              <Newspaper size={16} />
              Latest Headlines
            </div>
            <div className="space-y-3">
              {sentiment.headlines.map((headline) => (
                <a
                  key={headline.title}
                  className="block rounded-md border border-line bg-ink p-3 text-sm text-slate-300 transition hover:border-cyan hover:text-white"
                  href={headline.url || undefined}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>{headline.title}</span>
                  <span className="mt-1 block text-xs text-slate-500">{headline.source}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
