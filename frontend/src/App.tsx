import { useEffect, useState } from "react";
import { Layout } from "./components/Layout";
import { api } from "./lib/api";
import type { PortfolioSummary, Stock } from "./lib/types";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { MarketPage } from "./pages/MarketPage";
import { PortfolioPage } from "./pages/PortfolioPage";

export type Page = "dashboard" | "market" | "portfolio" | "analytics";

function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [market, setMarket] = useState<Stock[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = async () => {
    setError("");
    try {
      const [marketData, portfolioData] = await Promise.all([api.market(), api.portfolio()]);
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
  }, []);

  const content = () => {
    if (loading) {
      return <div className="panel p-6 text-slate-300">Loading QuantTrader AI...</div>;
    }
    if (error) {
      return <div className="panel p-6 text-red-300">{error}</div>;
    }
    if (!summary) {
      return <div className="panel p-6 text-slate-300">Portfolio data unavailable.</div>;
    }

    switch (page) {
      case "dashboard":
        return <DashboardPage summary={summary} />;
      case "market":
        return <MarketPage market={market} onTrade={refresh} />;
      case "portfolio":
        return <PortfolioPage summary={summary} />;
      case "analytics":
        return <AnalyticsPage />;
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
