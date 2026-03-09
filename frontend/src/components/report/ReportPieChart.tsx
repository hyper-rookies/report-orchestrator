"use client";

import { useMemo } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export interface PieSpec {
  type: "pie";
  data: Record<string, unknown>[];
  nameKey: string;
  valueKey: string;
  title?: string;
}

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

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export default function ReportPieChart({ spec }: { spec: PieSpec }) {
  if (!Array.isArray(spec.data) || spec.data.length === 0) return null;
  if (!spec.nameKey || !spec.valueKey) return null;

  const pieData = useMemo(
    () =>
      spec.data.map((row) => ({
        ...row,
        [spec.valueKey]: toNumber(row[spec.valueKey]),
      })),
    [spec.data, spec.valueKey]
  );

  const total = useMemo(
    () =>
      pieData.reduce((sum, row) => {
        return sum + toNumber(row[spec.valueKey]);
      }, 0),
    [pieData, spec.valueKey]
  );

  return (
    <div className="space-y-2 rounded-xl border border-border/90 bg-background p-3 shadow-[0_12px_30px_-22px_rgba(25,25,25,0.45)]">
      {spec.title && <p className="text-sm font-semibold text-foreground">{spec.title}</p>}
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={pieData}
            dataKey={spec.valueKey}
            nameKey={spec.nameKey}
            cx="50%"
            cy="50%"
            outerRadius={86}
            label={({ name, percent }) =>
              `${String(name)} ${(((percent as number) ?? 0) * 100).toFixed(1)}%`
            }
            labelLine={false}
          >
            {pieData.map((_, idx) => (
              <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: unknown) => {
              const numericValue = toNumber(value);
              const ratio = total > 0 ? (numericValue / total) * 100 : 0;
              const valueText = new Intl.NumberFormat("ko-KR").format(Math.round(numericValue));
              return `${valueText} (${ratio.toFixed(1)}%)`;
            }}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
