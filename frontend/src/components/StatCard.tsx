import type { ReactNode } from "react";

type StatCardProps = {
  label: string;
  value: string;
  detail?: string;
  icon: ReactNode;
  trend?: "up" | "down" | "flat";
};

export function StatCard({ label, value, detail, icon, trend = "flat" }: StatCardProps) {
  const trendClass =
    trend === "up" ? "text-mint" : trend === "down" ? "text-red-300" : "text-slate-400";

  return (
    <section className="panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-400">{label}</p>
          <p className="number mt-2 text-2xl font-semibold text-white">{value}</p>
        </div>
        <div className="rounded-md border border-line bg-panel2 p-2 text-cyan">{icon}</div>
      </div>
      {detail ? <p className={`number mt-4 text-sm ${trendClass}`}>{detail}</p> : null}
    </section>
  );
}
