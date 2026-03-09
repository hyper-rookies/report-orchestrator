"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const FUNNEL_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

interface InstallFunnelChartProps {
  data: Array<{ stage: string; count: number }>;
  loading?: boolean;
}

export default function InstallFunnelChart({
  data,
  loading = false,
}: InstallFunnelChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">설치 이벤트 퍼널</CardTitle>
        </CardHeader>
        <CardContent className="h-[240px] animate-pulse rounded bg-muted" />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">설치 이벤트 퍼널</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="stage"
              tick={{ fontSize: 10, fill: "hsl(var(--foreground))" }}
            />
            <YAxis
              tickFormatter={(value) => Number(value).toLocaleString()}
              tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
            />
            <Tooltip
              formatter={(value) => [Number(value ?? 0).toLocaleString(), "이벤트 수"]}
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
              }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {data.map((item, index) => (
                <Cell
                  key={`${item.stage}-${index}`}
                  fill={FUNNEL_COLORS[index % FUNNEL_COLORS.length]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
