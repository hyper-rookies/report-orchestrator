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
          <CardTitle className="text-sm font-medium">캠페인별 설치 TOP 10</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px] animate-pulse rounded bg-muted" />
      </Card>
    );
  }

  const top10 = data.slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">캠페인별 설치 TOP 10</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={top10}
            layout="vertical"
            margin={{ top: 4, right: 8, left: 8, bottom: 4 }}
          >
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis type="number" tick={{ fontSize: 11, fill: "var(--foreground)" }} />
            <YAxis
              dataKey="campaign"
              type="category"
              width={120}
              tick={{ fontSize: 10, fill: "var(--foreground)" }}
            />
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                color: "var(--foreground)",
              }}
              formatter={(value: number | string | undefined) => [
                Number(value ?? 0).toLocaleString("ko-KR"),
                "설치",
              ]}
            />
            <Bar dataKey="installs" fill="var(--chart-3)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
