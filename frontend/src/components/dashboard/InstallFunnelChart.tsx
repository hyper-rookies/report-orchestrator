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
  CHART_SERIES_1,
  CHART_SERIES_2,
  CHART_SERIES_3,
  CHART_SERIES_4,
  CHART_SERIES_5,
  CHART_TICK_LINE_STYLE,
  CHART_TICK_STYLE,
  CHART_TICK_STYLE_SMALL,
  CHART_TOOLTIP_STYLE,
} from "./chartTheme";

const FUNNEL_COLORS = [
  CHART_SERIES_1,
  CHART_SERIES_2,
  CHART_SERIES_3,
  CHART_SERIES_4,
  CHART_SERIES_5,
];

interface InstallFunnelChartProps {
  data: Array<{ stage: string; count: number }>;
  loading?: boolean;
}

export default function InstallFunnelChart({ data, loading = false }: InstallFunnelChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Install Funnel</CardTitle>
        </CardHeader>
        <CardContent className="h-[240px] animate-pulse rounded bg-muted" />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Install Funnel</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
            <XAxis
              dataKey="stage"
              tick={CHART_TICK_STYLE_SMALL}
              tickLine={CHART_TICK_LINE_STYLE}
              axisLine={CHART_AXIS_LINE_STYLE}
              tickMargin={8}
            />
            <YAxis
              tickFormatter={(value) => Number(value).toLocaleString()}
              tick={CHART_TICK_STYLE}
              tickLine={CHART_TICK_LINE_STYLE}
              axisLine={CHART_AXIS_LINE_STYLE}
              tickMargin={8}
            />
            <Tooltip
              formatter={(value) => [Number(value ?? 0).toLocaleString(), "Events"]}
              contentStyle={CHART_TOOLTIP_STYLE}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((item, index) => (
                <Cell key={`${item.stage}-${index}`} fill={FUNNEL_COLORS[index % FUNNEL_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
