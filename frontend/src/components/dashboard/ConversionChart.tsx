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

interface ConversionChartProps {
  data: Array<{ channel: string; conversionRate: number }>;
  loading?: boolean;
}

export default function ConversionChart({
  data,
  loading = false,
}: ConversionChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">채널별 전환율</CardTitle>
        </CardHeader>
        <CardContent className="h-[240px] animate-pulse rounded bg-muted" />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">채널별 전환율</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis dataKey="channel" tick={{ fontSize: 11, fill: "var(--foreground)" }} />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--foreground)" }}
              tickFormatter={(value: number | string) => `${(Number(value) * 100).toFixed(1)}%`}
            />
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                color: "var(--foreground)",
              }}
              formatter={(value: number | string | undefined) => [
                `${(Number(value ?? 0) * 100).toFixed(2)}%`,
                "전환율",
              ]}
            />
            <Bar dataKey="conversionRate" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
