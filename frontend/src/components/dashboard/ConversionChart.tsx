"use client";

import type { ReactNode } from "react";
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

interface ConversionChartProps {
  data: Array<{ channel: string; conversionRate: number }>;
  loading?: boolean;
  title?: string;
  actionSlot?: ReactNode;
  renderCard?: boolean;
}

export default function ConversionChart({
  data,
  loading = false,
  title = "Conversion by Channel",
  actionSlot,
  renderCard = true,
}: ConversionChartProps) {
  if (loading) {
    return renderCard ? (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {actionSlot}
        </CardHeader>
        <CardContent className="h-[240px] animate-pulse rounded bg-muted" />
      </Card>
    ) : (
      <div className="h-[240px] animate-pulse rounded bg-muted" />
    );
  }

  const chart = (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
        <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" />
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
          tickFormatter={(value: number | string) => `${(Number(value) * 100).toFixed(1)}%`}
        />
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          formatter={(value: number | string | undefined) => [
            `${(Number(value ?? 0) * 100).toFixed(2)}%`,
            "Conversion Rate",
          ]}
        />
        <Bar dataKey="conversionRate" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {data.map((item, index) => (
            <Cell key={`${item.channel}-${index}`} fill={getChannelColor(item.channel)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );

  return renderCard ? (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {actionSlot}
      </CardHeader>
      <CardContent>{chart}</CardContent>
    </Card>
  ) : (
    chart
  );
}
