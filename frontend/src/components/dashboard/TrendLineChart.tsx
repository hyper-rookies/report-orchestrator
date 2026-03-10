"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CHART_AXIS_LINE_STYLE,
  CHART_GRID_STROKE,
  CHART_LEGEND_STYLE,
  CHART_SERIES_1,
  CHART_SERIES_3,
  CHART_TEXT_COLOR,
  CHART_TICK_LINE_STYLE,
  CHART_TICK_STYLE,
  CHART_TOOLTIP_STYLE,
} from "./chartTheme";

export default function TrendLineChart({
  data,
}: {
  data: Array<{ date: string; sessions: number; installs: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 6 }}>
        <CartesianGrid strokeDasharray="4 4" stroke={CHART_GRID_STROKE} />
        <XAxis
          dataKey="date"
          tick={CHART_TICK_STYLE}
          tickLine={CHART_TICK_LINE_STYLE}
          axisLine={CHART_AXIS_LINE_STYLE}
          tickMargin={8}
        />
        <YAxis
          yAxisId="left"
          tick={CHART_TICK_STYLE}
          tickLine={CHART_TICK_LINE_STYLE}
          axisLine={CHART_AXIS_LINE_STYLE}
          tickMargin={8}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={CHART_TICK_STYLE}
          tickLine={CHART_TICK_LINE_STYLE}
          axisLine={CHART_AXIS_LINE_STYLE}
          tickMargin={8}
        />
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
        <Legend
          wrapperStyle={CHART_LEGEND_STYLE}
          formatter={(value) => <span style={{ color: CHART_TEXT_COLOR }}>{value}</span>}
        />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="sessions"
          name="세션"
          stroke={CHART_SERIES_1}
          strokeWidth={2.5}
          dot={false}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="installs"
          name="설치"
          stroke={CHART_SERIES_3}
          strokeWidth={2.5}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
