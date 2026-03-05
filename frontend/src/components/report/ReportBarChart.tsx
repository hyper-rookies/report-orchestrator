"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface ChartSpec {
  xKey: string;
  yKey: string;
  title?: string;
}

interface Props {
  rows: Record<string, unknown>[];
  spec: ChartSpec;
}

export default function ReportBarChart({ rows, spec }: Props) {
  return (
    <div className="space-y-1">
      {spec.title && <p className="text-sm font-medium">{spec.title}</p>}
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={spec.xKey} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey={spec.yKey} fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

