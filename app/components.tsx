import type { Source } from "@/lib/core";

export const usd = (v: number, dp = 0) =>
  "$" + v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

export const pretty = (s: string) => s.replace(/_/g, " ").toLowerCase();

export function Delta({ cur, prev, days }: { cur: number; prev: number; days: number }) {
  if (!prev) return <>&nbsp;</>;
  const p = ((cur - prev) / prev) * 100;
  return (
    <>
      <span className={p >= 0 ? "up" : "down"}>
        {p >= 0 ? "▲" : "▼"} {Math.abs(p).toFixed(0)}%
      </span>{" "}
      vs previous {days} days
    </>
  );
}

/** Renders a section's body only when its source is connected and loaded. */
export function SourceGate<T>({ src, name, children }: { src: Source<T>; name: string; children: (data: T) => React.ReactNode }) {
  if (src.state === "off")
    return (
      <p className="off">
        {name} isn&apos;t connected yet. Add {src.missing.map((m, i) => (
          <span key={m}>
            {i ? ", " : ""}
            <code>{m}</code>
          </span>
        ))}{" "}
        in Vercel → Settings → Environment Variables, then redeploy.
      </p>
    );
  if (src.state === "error") return <p className="err">{src.message}</p>;
  return <>{children(src.data)}</>;
}

export function SalesChart({ cur, prev }: { cur: { day: string; sales: number; orders: number }[]; prev: { sales: number }[] }) {
  const W = 760, H = 220, L = 56, R = 12, T = 12, B = 28;
  const raw = Math.max(10, ...cur.map((x) => x.sales), ...prev.map((x) => x.sales));
  const step = Math.pow(10, Math.floor(Math.log10(raw / 3)));
  const unit = [1, 2, 2.5, 5, 10].map((m) => m * step).find((u) => u * 4 >= raw) || step * 10;
  const max = unit * 4;
  const x = (i: number) => L + (cur.length <= 1 ? 0 : (i * (W - L - R)) / (cur.length - 1));
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const path = (arr: { sales: number }[]) => arr.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.sales).toFixed(1)}`).join(" ");
  const label = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const ticks = cur.length > 2 ? [0, Math.floor((cur.length - 1) / 2), cur.length - 1] : cur.map((_, i) => i);
  const last = cur[cur.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily sales, this period against the previous period">
      {[0, 1, 2, 3, 4].map((k) => (
        <g key={k}>
          <line x1={L} x2={W - R} y1={y(unit * k)} y2={y(unit * k)} stroke="var(--line)" />
          <text x={L - 8} y={y(unit * k) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" fontFamily="var(--mono)">
            {usd(unit * k)}
          </text>
        </g>
      ))}
      {ticks.map((i, j) => (
        <text key={i} x={x(i)} y={H - 8} fontSize="11" fill="var(--muted)" textAnchor={j === 0 ? "start" : j === ticks.length - 1 ? "end" : "middle"}>
          {label(cur[i].day)}
        </text>
      ))}
      {prev.length === cur.length && <path d={path(prev)} fill="none" stroke="var(--prev)" strokeWidth="1.5" strokeDasharray="4 4" />}
      {cur.length > 0 && (
        <path d={`${path(cur)} L${x(cur.length - 1)} ${y(0)} L${x(0)} ${y(0)} Z`} fill="var(--accent)" fillOpacity=".12" />
      )}
      <path d={path(cur)} fill="none" stroke="var(--accent)" strokeWidth="2.25" strokeLinejoin="round" />
      {last && <circle cx={x(cur.length - 1)} cy={y(last.sales)} r="4" fill="var(--accent)" />}
      {cur.map((p, i) => (
        <circle key={p.day} cx={x(i)} cy={y(p.sales)} r="8" fill="transparent">
          <title>{`${label(p.day)}: ${usd(p.sales, 2)} · ${p.orders} orders`}</title>
        </circle>
      ))}
    </svg>
  );
}
