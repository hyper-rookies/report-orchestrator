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
  CHART_TICK_STYLE_SMALL,
  CHART_TOOLTIP_STYLE,
  getCategoryColor,
} from "./chartTheme";

interface CampaignInstallsChartProps {
  data: Array<{ campaign: string; installs: number }>;
  loading?: boolean;
}

export default function CampaignInstallsChart({
  data,
  loading = false,
}: CampaignInstallsChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">罹좏럹?몃퀎 ?ㅼ튂 TOP 10</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px] animate-pulse rounded bg-muted" />
      </Card>
    );
  }

  const top10 = data.slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">罹좏럹?몃퀎 ?ㅼ튂 TOP 10</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={top10} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
            <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" />
            <XAxis
              type="number"
              tick={CHART_TICK_STYLE}
              tickLine={CHART_TICK_LINE_STYLE}
              axisLine={CHART_AXIS_LINE_STYLE}
              tickMargin={8}
            />
            <YAxis
              dataKey="campaign"
              type="category"
              width={136}
              tick={CHART_TICK_STYLE_SMALL}
              tickLine={CHART_TICK_LINE_STYLE}
              axisLine={CHART_AXIS_LINE_STYLE}
              tickMargin={6}
            />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              formatter={(value: number | string | undefined) => [
                Number(value ?? 0).toLocaleString("ko-KR"),
                "?ㅼ튂",
              ]}
            />
            <Bar dataKey="installs" radius={[0, 4, 4, 0]} isAnimationActive={false}>
              {top10.map((item, index) => (
                <Cell key={`${item.campaign}-${index}`} fill={getCategoryColor(item.campaign)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
