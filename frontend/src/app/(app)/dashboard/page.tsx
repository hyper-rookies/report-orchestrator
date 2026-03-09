"use client";

import ChannelPieChart from "@/components/dashboard/ChannelPieChart";
import KpiCard, { type DashboardKpi } from "@/components/dashboard/KpiCard";
import TrendLineChart from "@/components/dashboard/TrendLineChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardData } from "@/hooks/useDashboardData";

const DEBUG_DASHBOARD = process.env.NEXT_PUBLIC_DEBUG_DASHBOARD === "true";

function formatInt(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(Math.max(0, Math.round(value)));
}

function formatRate(value: number): string {
  return `${(Math.max(0, value) * 100).toFixed(1)}%`;
}

export default function DashboardPage() {
  const {
    totalSessions,
    totalInstalls,
    avgEngagementRate,
    channelShare,
    trend,
    loading,
    error,
    debug,
  } = useDashboardData();

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
        <div className="nhn-panel px-6 py-5">
          <h1 className="text-xl font-semibold tracking-tight">대시보드</h1>
          <p className="mt-1 text-sm text-muted-foreground">2024년 11월 마케팅 데이터 요약</p>
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
                <ChannelPieChart data={channelShare} />
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

        {DEBUG_DASHBOARD && (
          <Card className="nhn-panel border-dashed">
            <CardHeader>
              <CardTitle className="text-sm font-semibold tracking-wide">
                Dashboard Debug (dev-only)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <p className="text-muted-foreground">
                generatedAt: {debug.generatedAt ?? "N/A"}
              </p>
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
