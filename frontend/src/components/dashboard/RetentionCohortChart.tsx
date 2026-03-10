"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CHART_AXIS_LINE_STYLE,
  CHART_GRID_STROKE,
  CHART_SERIES_2,
  CHART_SURFACE_COLOR,
  CHART_TICK_LINE_STYLE,
  CHART_TICK_STYLE,
  CHART_TOOLTIP_STYLE,
} from "./chartTheme";

interface RetentionCohortChartProps {
  data: Array<{ day: number; retentionRate: number }>;
  loading?: boolean;
}

export default function RetentionCohortChart({
  data,
  loading = false,
}: RetentionCohortChartProps) {
  const normalizedData = useMemo(() => {
    const maxRetention = data.reduce(
      (max, item) => Math.max(max, Number(item.retentionRate) || 0),
      0
    );
    const scale = maxRetention > 1 ? 100 : 1;

    return data.map((item) => ({
      ...item,
      retentionRate: (Number(item.retentionRate) || 0) / scale,
    }));
  }, [data]);

  const yAxisMax =
    normalizedData.length > 0
      ? Math.min(
          1,
          Math.max(
            0.1,
            Math.ceil(
              normalizedData.reduce((max, item) => Math.max(max, item.retentionRate), 0) * 10
            ) / 10
          )
        )
      : 1;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Retention Cohort (Day N)</CardTitle>
        </CardHeader>
        <CardContent className="h-[240px] animate-pulse rounded bg-muted" />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Retention Cohort (Day N)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={normalizedData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
            <XAxis
              dataKey="day"
              tickFormatter={(value) => `D${value}`}
              tick={CHART_TICK_STYLE}
              tickLine={CHART_TICK_LINE_STYLE}
              axisLine={CHART_AXIS_LINE_STYLE}
              tickMargin={8}
            />
            <YAxis
              domain={[0, yAxisMax]}
              tickFormatter={(value) => `${(Number(value) * 100).toFixed(0)}%`}
              tick={CHART_TICK_STYLE}
              tickLine={CHART_TICK_LINE_STYLE}
              axisLine={CHART_AXIS_LINE_STYLE}
              tickMargin={8}
            />
            <Tooltip
              formatter={(value) => [`${(Number(value ?? 0) * 100).toFixed(1)}%`, "Retention"]}
              labelFormatter={(label) => `Day ${label}`}
              contentStyle={CHART_TOOLTIP_STYLE}
            />
            <Line
              type="monotone"
              dataKey="retentionRate"
              stroke={CHART_SERIES_2}
              strokeWidth={2.5}
              dot={{ r: 4, fill: CHART_SERIES_2, stroke: CHART_SURFACE_COLOR, strokeWidth: 2 }}
              activeDot={{
                r: 6,
                fill: CHART_SERIES_2,
                stroke: CHART_SURFACE_COLOR,
                strokeWidth: 2,
              }}
              isAnimationActive={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
