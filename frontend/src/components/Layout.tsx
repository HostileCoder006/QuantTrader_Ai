import { BarChart3, BriefcaseBusiness, LineChart, Radar, Wallet } from "lucide-react";
import type { Page } from "../App";

const navItems: { id: Page; label: string; icon: typeof BarChart3 }[] = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "market", label: "Market", icon: LineChart },
  { id: "portfolio", label: "Portfolio", icon: BriefcaseBusiness },
  { id: "analytics", label: "Analytics", icon: Radar }
];

type LayoutProps = {
  page: Page;
  setPage: (page: Page) => void;
  children: React.ReactNode;
};

export function Layout({ page, setPage, children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-ink">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-line bg-panel px-4 py-6 lg:block">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-mint text-ink">
            <Wallet size={22} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">QuantTrader AI</h1>
            <p className="text-xs text-slate-400">NIFTY 50 paper trading</p>
          </div>
        </div>
        <nav className="mt-8 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = page === item.id;
            return (
              <button
                key={item.id}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium transition ${
                  active
                    ? "bg-mint text-ink"
                    : "text-slate-300 hover:bg-panel2 hover:text-white"
                }`}
                onClick={() => setPage(item.id)}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <header className="sticky top-0 z-10 border-b border-line bg-ink/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-semibold">QuantTrader AI</h1>
            <p className="text-xs text-slate-400">Manual paper trading</p>
          </div>
          <select
            className="input max-w-36"
            value={page}
            onChange={(event) => setPage(event.target.value as Page)}
          >
            {navItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
