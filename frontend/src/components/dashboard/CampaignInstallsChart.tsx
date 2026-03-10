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
  CHART_AXIS_LABEL_STYLE,
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
  title?: string;
  actionSlot?: ReactNode;
  renderCard?: boolean;
}

export default function CampaignInstallsChart({
  data,
  loading = false,
  title = "Campaign Installs Top 10",
  actionSlot,
  renderCard = true,
}: CampaignInstallsChartProps) {
  if (loading) {
    return renderCard ? (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {actionSlot}
        </CardHeader>
        <CardContent className="h-[300px] animate-pulse rounded bg-muted" />
      </Card>
    ) : (
      <div className="h-[300px] animate-pulse rounded bg-muted" />
    );
  }

  const top10 = data.slice(0, 10);
  const chart = (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={top10} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" />
        <XAxis
          type="number"
          tick={CHART_TICK_STYLE}
          tickLine={CHART_TICK_LINE_STYLE}
          axisLine={CHART_AXIS_LINE_STYLE}
          tickMargin={8}
          height={48}
          label={{ value: "Installs", position: "insideBottom", offset: -4, ...CHART_AXIS_LABEL_STYLE }}
        />
        <YAxis
          dataKey="campaign"
          type="category"
          width={156}
          tick={CHART_TICK_STYLE_SMALL}
          tickLine={CHART_TICK_LINE_STYLE}
          axisLine={CHART_AXIS_LINE_STYLE}
          tickMargin={6}
          interval={0}
        />
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          formatter={(value: number | string | undefined) => [
            Number(value ?? 0).toLocaleString("ko-KR"),
            "Installs",
          ]}
        />
        <Bar dataKey="installs" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {top10.map((item, index) => (
            <Cell key={`${item.campaign}-${index}`} fill={getCategoryColor(item.campaign)} />
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
