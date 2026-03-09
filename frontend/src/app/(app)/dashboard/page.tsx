"use client";

import { useState } from "react";
import ChannelPieChart from "@/components/dashboard/ChannelPieChart";
import CampaignInstallsChart from "@/components/dashboard/CampaignInstallsChart";
import ChannelRevenueChart from "@/components/dashboard/ChannelRevenueChart";
import ConversionChart from "@/components/dashboard/ConversionChart";
import InstallFunnelChart from "@/components/dashboard/InstallFunnelChart";
import KpiCard, { type DashboardKpi } from "@/components/dashboard/KpiCard";
import RetentionCohortChart from "@/components/dashboard/RetentionCohortChart";
import TrendLineChart from "@/components/dashboard/TrendLineChart";
import WeekSelector, { type WeekRange } from "@/components/dashboard/WeekSelector";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardData } from "@/hooks/useDashboardData";

const DEBUG_DASHBOARD = process.env.NEXT_PUBLIC_DEBUG_DASHBOARD === "true";

const WEEKS: WeekRange[] = [
  { start: "2024-11-01", end: "2024-11-07", label: "2024년 11월 1주차" },
  { start: "2024-11-08", end: "2024-11-14", label: "2024년 11월 2주차" },
  { start: "2024-11-15", end: "2024-11-21", label: "2024년 11월 3주차" },
  { start: "2024-11-22", end: "2024-11-28", label: "2024년 11월 4주차" },
  { start: "2024-11-29", end: "2024-11-30", label: "2024년 11월 5주차" },
];

function formatInt(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(Math.max(0, Math.round(value)));
}

function formatRate(value: number): string {
  return `${(Math.max(0, value) * 100).toFixed(1)}%`;
}

export default function DashboardPage() {
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(3);
  const selectedRange = WEEKS[selectedWeekIndex] ?? WEEKS[3]!;

  const {
    totalSessions,
    totalInstalls,
    avgEngagementRate,
    channelShare,
    conversionByChannel,
    channelRevenue,
    campaignInstalls,
    installFunnel,
    retention,
    trend,
    loading,
    error,
    debug,
  } = useDashboardData(selectedRange);

  const kpis: DashboardKpi[] = [
    {
      label: "총 세션",
      value: totalSessions !== null ? formatInt(totalSessions) : "데이터 로드 실패",
    },
    {
      label: "총 설치",
      value: totalInstalls !== null ? formatInt(totalInstalls) : "데이터 로드 실패",
    },
    {
      label: "평균 참여율",
      value: avgEngagementRate !== null ? formatRate(avgEngagementRate) : "데이터 로드 실패",
    },
  ];

  return (
    <div className="flex-1 space-y-6 overflow-y-auto px-6 py-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div className="nhn-panel space-y-2 px-6 py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-2xl font-bold tracking-tight">마케팅 대시보드</h1>
            <WeekSelector
              weeks={WEEKS}
              selectedIndex={selectedWeekIndex}
              onChange={(index) => {
                const clamped = Math.min(Math.max(index, 0), WEEKS.length - 1);
                setSelectedWeekIndex(clamped);
              }}
            />
          </div>
          <p className="text-sm text-muted-foreground">{selectedRange.label} 데이터 요약</p>
          {error && <p className="mt-2 text-xs text-destructive">일부 데이터 로드 실패: {error}</p>}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {loading
            ? Array.from({ length: 3 }).map((_, idx) => (
                <Card key={idx} className="nhn-panel py-4">
                  <CardContent className="space-y-3">
                    <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                    <div className="h-8 w-40 animate-pulse rounded bg-muted" />
                  </CardContent>
                </Card>
              ))
            : kpis.map((kpi) => <KpiCard key={kpi.label} kpi={kpi} />)}
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card className="nhn-panel">
            <CardHeader>
              <CardTitle className="text-sm font-semibold tracking-wide">채널별 세션 비중</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-[260px] animate-pulse rounded-lg bg-muted" />
              ) : channelShare.length > 0 ? (
                <ChannelPieChart data={channelShare} totalValue={totalSessions} />
              ) : (
                <p className="text-sm text-muted-foreground">데이터 로드 실패</p>
              )}
            </CardContent>
          </Card>

          <Card className="nhn-panel">
            <CardHeader>
              <CardTitle className="text-sm font-semibold tracking-wide">최근 7일 트렌드</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-[240px] animate-pulse rounded-lg bg-muted" />
              ) : trend.length > 0 ? (
                <TrendLineChart data={trend} />
              ) : (
                <p className="text-sm text-muted-foreground">데이터 로드 실패</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ChannelRevenueChart data={channelRevenue} loading={loading} />
          <ConversionChart data={conversionByChannel} loading={loading} />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <CampaignInstallsChart data={campaignInstalls} loading={loading} />
          <InstallFunnelChart data={installFunnel} loading={loading} />
        </div>

        <div className="grid grid-cols-1 gap-4">
          <RetentionCohortChart data={retention} loading={loading} />
        </div>

        {DEBUG_DASHBOARD && (
          <Card className="nhn-panel border-dashed">
            <CardHeader>
              <CardTitle className="text-sm font-semibold tracking-wide">
                Dashboard Debug (dev-only)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <p className="text-muted-foreground">generatedAt: {debug.generatedAt ?? "N/A"}</p>
              {debug.queries.length === 0 ? (
                <p className="text-muted-foreground">쿼리 실행 정보가 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {debug.queries.map((q) => (
                    <div key={q.key} className="rounded-md border p-2">
                      <p>
                        <span className="font-semibold">{q.key}</span>{" "}
                        <span
                          className={
                            q.status === "ok"
                              ? "text-[#1D8844]"
                              : "text-destructive"
                          }
                        >
                          {q.status}
                        </span>
                      </p>
                      <p className="text-muted-foreground">question: {q.question}</p>
                      <p className="text-muted-foreground">reportId: {q.reportId ?? "N/A"}</p>
                      <p className="text-muted-foreground">lastEvent: {q.lastEvent ?? "N/A"}</p>
                      <p className="text-muted-foreground">rowCount: {q.rowCount}</p>
                      {q.error && <p className="text-destructive">error: {q.error}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
