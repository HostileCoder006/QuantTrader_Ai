import { useEffect, useState } from "react";
import { Layout } from "./components/Layout";
import { api } from "./lib/api";
import type { PortfolioSummary, Stock } from "./lib/types";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { BacktestPage } from "./pages/BacktestPage";
import { DashboardPage } from "./pages/DashboardPage";
import { JournalPage } from "./pages/JournalPage";
import { MarketPage } from "./pages/MarketPage";
import { PortfolioPage } from "./pages/PortfolioPage";
import { ScannerPage } from "./pages/ScannerPage";
import { StrategyLabPage } from "./pages/StrategyLabPage";

export type Page =
  | "dashboard"
  | "market"
  | "scanner"
  | "portfolio"
  | "analytics"
  | "backtest"
  | "journal"
  | "strategylab";

// Auto-refresh interval: 5 minutes (market data)
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [market, setMarket] = useState<Stock[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = async () => {
    setError("");
    try {
      const [marketData, portfolioData] = await Promise.all([
        api.market(),
        api.portfolio(),
      ]);
      setMarket(marketData);
      setSummary(portfolioData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load app data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const content = () => {
    if (loading) {
      return (
        <div className="panel p-6 text-slate-300">
          Loading QuantTrader AI Market Intelligence Platform...
        </div>
      );
    }
    if (error) {
      return (
        <div className="panel p-6 space-y-3">
          <p className="text-red-300 font-semibold">Connection Error</p>
          <p className="text-sm text-slate-400">{error}</p>
          <button className="button-primary" onClick={refresh}>
            Retry
          </button>
        </div>
      );
    }
    if (!summary) {
      return <div className="panel p-6 text-slate-300">Portfolio data unavailable.</div>;
    }

    switch (page) {
      case "dashboard":
        return <DashboardPage summary={summary} />;
      case "market":
        return <MarketPage market={market} onTrade={refresh} />;
      case "scanner":
        return <ScannerPage />;
      case "portfolio":
        return <PortfolioPage summary={summary} />;
      case "analytics":
        return <AnalyticsPage />;
      case "backtest":
        return <BacktestPage />;
      case "journal":
        return <JournalPage />;
      case "strategylab":
        return <StrategyLabPage />;
      default:
        return null;
    }
  };

  return (
    <Layout page={page} setPage={setPage}>
      {content()}
    </Layout>
  );
}

export default App;
