import {
  BarChart3,
  BriefcaseBusiness,
  FlaskConical,
  LineChart,
  Radar,
  Scan,
  Wallet,
} from "lucide-react";
import type { Page } from "../App";

const navItems: { id: Page; label: string; icon: typeof BarChart3 }[] = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "market", label: "Market", icon: LineChart },
  { id: "scanner", label: "Scanner", icon: Scan },
  { id: "portfolio", label: "Portfolio", icon: BriefcaseBusiness },
  { id: "analytics", label: "Analytics", icon: Radar },
  { id: "backtest", label: "Backtester", icon: FlaskConical },
];

type LayoutProps = {
  page: Page;
  setPage: (page: Page) => void;
  children: React.ReactNode;
};

export function Layout({ page, setPage, children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-ink">
      {/* Sidebar — desktop */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-line bg-panel px-4 py-6 lg:block">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-mint text-ink">
            <Wallet size={22} />
          </div>
          <div>
            <h1 className="text-base font-bold text-white">QuantTrader AI</h1>
            <p className="text-xs text-slate-400">Quant Market Intelligence</p>
          </div>
        </div>

        <nav className="mt-8 space-y-1" aria-label="Main navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = page === item.id;
            return (
              <button
                key={item.id}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium transition ${
                  active
                    ? "bg-mint text-ink"
                    : "text-slate-300 hover:bg-panel2 hover:text-white"
                }`}
                onClick={() => setPage(item.id)}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto absolute bottom-6 left-4 right-4">
          <div className="rounded-md border border-line bg-ink/50 px-3 py-2">
            <p className="text-xs text-slate-500">AI: DeepSeek V3 · Data: yfinance</p>
            <p className="text-xs text-slate-600">Paper trading only · No real orders</p>
          </div>
        </div>
      </aside>

      {/* Header — mobile */}
      <header className="sticky top-0 z-10 border-b border-line bg-ink/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-bold">QuantTrader AI</h1>
            <p className="text-xs text-slate-400">Quant Intelligence</p>
          </div>
          <select
            className="input max-w-40"
            value={page}
            onChange={(event) => setPage(event.target.value as Page)}
            aria-label="Navigate to page"
          >
            {navItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* Main content */}
      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
