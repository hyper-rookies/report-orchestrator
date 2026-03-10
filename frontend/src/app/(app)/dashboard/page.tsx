"use client";

import { useEffect, useState } from "react";
import CampaignInstallsChart from "@/components/dashboard/CampaignInstallsChart";
import ChannelPieChart from "@/components/dashboard/ChannelPieChart";
import ChannelRevenueChart from "@/components/dashboard/ChannelRevenueChart";
import ConversionChart from "@/components/dashboard/ConversionChart";
import InstallFunnelChart from "@/components/dashboard/InstallFunnelChart";
import KpiCard, { type DashboardKpi } from "@/components/dashboard/KpiCard";
import PdfExportButton from "@/components/dashboard/PdfExportButton";
import RetentionCohortChart from "@/components/dashboard/RetentionCohortChart";
import ShareButton from "@/components/dashboard/ShareButton";
import TrendLineChart from "@/components/dashboard/TrendLineChart";
import WeekSelector, { type WeekRange } from "@/components/dashboard/WeekSelector";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardCache } from "@/hooks/useDashboardCache";
import { formatWeekRangeLabel } from "@/lib/weekRangeLabel";

function formatInt(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(Math.max(0, Math.round(value)));
}

function formatRate(value: number): string {
  return `${(Math.max(0, value) * 100).toFixed(1)}%`;
}

export default function DashboardPage() {
  const [weeks, setWeeks] = useState<WeekRange[]>([]);
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);

  useEffect(() => {
    fetch("/dashboard-cache/manifest.json")
      .then((response) => response.json() as Promise<WeekRange[]>)
      .then((data) => {
        setWeeks(data);
        setSelectedWeekIndex(Math.max(0, data.length - 2));
      });
  }, []);

  const selectedRange = weeks[selectedWeekIndex] ?? { start: "", end: "", label: "" };
  const {
    totalSessions,
    totalInstalls,
    avgEngagementRate,
    kpiComparison,
    channelShare,
    conversionByChannel,
    channelRevenue,
    campaignInstalls,
    installFunnel,
    retention,
    trend,
    loading,
    error,
  } = useDashboardCache(selectedRange);

  const kpis: DashboardKpi[] = [
    {
      label: "총 세션",
      value: totalSessions !== null ? formatInt(totalSessions) : "데이터 로드 실패",
      currentValue: kpiComparison.totalSessions.currentValue,
      previousValue: kpiComparison.totalSessions.previousValue,
      deltaPercent: kpiComparison.totalSessions.deltaPercent,
    },
    {
      label: "총 설치",
      value: totalInstalls !== null ? formatInt(totalInstalls) : "데이터 로드 실패",
      currentValue: kpiComparison.totalInstalls.currentValue,
      previousValue: kpiComparison.totalInstalls.previousValue,
      deltaPercent: kpiComparison.totalInstalls.deltaPercent,
    },
    {
      label: "평균 참여율",
      value: avgEngagementRate !== null ? formatRate(avgEngagementRate) : "데이터 로드 실패",
      currentValue: kpiComparison.avgEngagementRate.currentValue,
      previousValue: kpiComparison.avgEngagementRate.previousValue,
      deltaPercent: kpiComparison.avgEngagementRate.deltaPercent,
    },
  ];

  return (
    <div className="flex-1 space-y-6 overflow-y-auto px-6 py-8">
      <div id="dashboard-content" className="mx-auto w-full max-w-6xl space-y-6">
        <div className="nhn-panel space-y-2 px-6 py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-2xl font-bold tracking-tight">마케팅 대시보드</h1>
            <div className="flex items-center gap-2">
              {weeks.length > 0 && (
                <WeekSelector
                  weeks={weeks}
                  selectedIndex={selectedWeekIndex}
                  onChange={(index) => {
                    setSelectedWeekIndex(Math.min(Math.max(index, 0), weeks.length - 1));
                  }}
                />
              )}
              {selectedRange.start && (
                <>
                  <ShareButton selectedRange={selectedRange} />
                  <PdfExportButton
                    targetId="dashboard-content"
                    filename={`dashboard-${selectedRange.start}_${selectedRange.end}.pdf`}
                  />
                </>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {formatWeekRangeLabel(selectedRange)} 데이터 요약
          </p>
          {error && <p className="mt-2 text-xs text-destructive">주간 데이터 로드 실패: {error}</p>}
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
      </div>
    </div>
  );
}
