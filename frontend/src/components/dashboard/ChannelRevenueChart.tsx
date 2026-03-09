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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ChannelRevenueChartProps {
  data: Array<{ channel: string; revenue: number }>;
  loading?: boolean;
}

export default function ChannelRevenueChart({ data, loading = false }: ChannelRevenueChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">채널별 매출</CardTitle>
        </CardHeader>
        <CardContent className="h-[240px] animate-pulse rounded bg-muted" />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">채널별 매출</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="channel"
              tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
            />
            <YAxis
              tickFormatter={(v) => `₩${(Number(v) / 1000).toFixed(0)}k`}
              tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
            />
            <Tooltip
              formatter={(value) => [`₩${Number(value ?? 0).toLocaleString()}`, "매출"]}
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
              }}
            />
            <Bar dataKey="revenue" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
