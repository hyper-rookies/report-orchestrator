"use client";

import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = [
  "#0F172A",
  "#2563EB",
  "#0E9F6E",
  "#D946EF",
  "#F59E0B",
  "#E11D48",
  "#14B8A6",
  "#6D28D9",
  "#EA580C",
  "#4B5563",
];

function formatNumber(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(Math.round(value));
}

export default function ChannelPieChart({
  data,
  totalValue,
}: {
  data: Array<{ name: string; value: number }>;
  totalValue?: number | null;
}) {
  const total = useMemo(() => data.reduce((sum, item) => sum + item.value, 0), [data]);

  return (
    <div className="grid gap-3 md:grid-cols-[210px_1fr] md:items-center">
      <div className="order-2 space-y-1.5 text-sm md:order-1">
        {data.map((item, idx) => {
          const ratio = total > 0 ? (item.value / total) * 100 : 0;
          return (
            <div key={item.name} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                />
                <span className="text-foreground/90">{item.name}</span>
              </div>
              <span className="tabular-nums text-muted-foreground">{ratio.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
      <div className="order-1 h-[250px] md:order-2">
        <div className="relative h-full w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={90}
                innerRadius={58}
                label={false}
                labelLine={false}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number | string | undefined) => {
                  const numeric = Number(value);
                  const ratio = total > 0 ? (numeric / total) * 100 : 0;
                  return `${ratio.toFixed(1)}%`;
                }}
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  color: "var(--foreground)",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-sm font-semibold text-foreground">
              {totalValue != null ? formatNumber(totalValue) : `${total.toFixed(1)}%`}
            </p>
            <p className="text-xs tracking-wide text-muted-foreground">TOTAL</p>
          </div>
        </div>
      </div>
    </div>
  );
}
