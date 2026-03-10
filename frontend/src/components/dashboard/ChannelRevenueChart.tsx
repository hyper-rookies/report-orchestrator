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
import {
  CHART_AXIS_LINE_STYLE,
  CHART_GRID_STROKE,
  CHART_TICK_LINE_STYLE,
  CHART_TICK_STYLE,
  CHART_TOOLTIP_STYLE,
  getChannelColor,
} from "./chartTheme";

interface ChannelRevenueChartProps {
  data: Array<{ channel: string; revenue: number }>;
  loading?: boolean;
}

export default function ChannelRevenueChart({ data, loading = false }: ChannelRevenueChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Revenue by Channel</CardTitle>
        </CardHeader>
        <CardContent className="h-[240px] animate-pulse rounded bg-muted" />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Revenue by Channel</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
            <XAxis
              dataKey="channel"
              tick={CHART_TICK_STYLE}
              tickLine={CHART_TICK_LINE_STYLE}
              axisLine={CHART_AXIS_LINE_STYLE}
              tickMargin={8}
            />
            <YAxis
              tick={CHART_TICK_STYLE}
              tickLine={CHART_TICK_LINE_STYLE}
              axisLine={CHART_AXIS_LINE_STYLE}
              tickMargin={8}
              tickFormatter={(value) => `₩${(Number(value) / 1000).toFixed(0)}k`}
            />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              formatter={(value) => [`₩${Number(value ?? 0).toLocaleString("ko-KR")}`, "Revenue"]}
            />
            <Bar dataKey="revenue" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((item, index) => (
                <Cell key={`${item.channel}-${index}`} fill={getChannelColor(item.channel)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
