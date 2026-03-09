"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export interface PieSpec {
  type: "pie";
  data: Record<string, unknown>[];
  nameKey: string;
  valueKey: string;
  title?: string;
}

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export default function ReportPieChart({ spec }: { spec: PieSpec }) {
  if (!Array.isArray(spec.data) || spec.data.length === 0) return null;
  if (!spec.nameKey || !spec.valueKey) return null;

  return (
    <div className="space-y-2 rounded-xl border border-border/90 bg-background p-3 shadow-[0_12px_30px_-22px_rgba(25,25,25,0.45)]">
      {spec.title && <p className="text-sm font-semibold text-foreground">{spec.title}</p>}
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={spec.data}
            dataKey={spec.valueKey}
            nameKey={spec.nameKey}
            cx="50%"
            cy="50%"
            outerRadius={86}
            labelLine={false}
          >
            {spec.data.map((_, idx) => (
              <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

