# SH-03: 공유 대시보드 페이지 (로그인 불필요)

**전제 조건:** SH-02가 `"done"` 상태여야 한다. SC-04도 `"done"`이어야 한다 (`useDashboardCache` 존재).

## 작업 개요

`frontend/src/app/share/[code]/page.tsx`를 생성한다.
**주의:** `app/share/` 는 `(app)` 그룹 밖 — AppLayout(사이드바) 없이 렌더링된다.
**다른 파일은 수정하지 않는다.**

## 생성할 파일

- `frontend/src/app/share/[code]/page.tsx`

---

## 구현 코드

### `frontend/src/app/share/[code]/page.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { WeekRange } from "@/components/dashboard/WeekSelector";
import { useDashboardCache } from "@/hooks/useDashboardCache";
import KpiCard, { type DashboardKpi } from "@/components/dashboard/KpiCard";
import TrendLineChart from "@/components/dashboard/TrendLineChart";
import ChannelPieChart from "@/components/dashboard/ChannelPieChart";
import ChannelRevenueChart from "@/components/dashboard/ChannelRevenueChart";
import ConversionChart from "@/components/dashboard/ConversionChart";
import CampaignInstallsChart from "@/components/dashboard/CampaignInstallsChart";
import InstallFunnelChart from "@/components/dashboard/InstallFunnelChart";
import RetentionCohortChart from "@/components/dashboard/RetentionCohortChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function formatInt(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(Math.max(0, Math.round(value)));
}
function formatRate(value: number): string {
  return `${(Math.max(0, value) * 100).toFixed(1)}%`;
}

type ResolvedState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; range: WeekRange; expiresAt: string };

export default function SharePage() {
  const { code } = useParams<{ code: string }>();
  const [resolved, setResolved] = useState<ResolvedState>({ status: "loading" });

  useEffect(() => {
    fetch(`/api/share/${code}`)
      .then(async (res) => {
        if (!res.ok) {
          const err = (await res.json()) as { error?: string };
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<{ weekStart: string; weekEnd: string; weekLabel: string }>;
      })
      .then((data) => {
        setResolved({
          status: "ok",
          range: { start: data.weekStart, end: data.weekEnd, label: data.weekLabel },
          expiresAt: "7일 후",
        });
      })
      .catch((err: unknown) => {
        setResolved({
          status: "error",
          message: err instanceof Error ? err.message : "링크를 불러올 수 없습니다.",
        });
      });
  }, [code]);

  if (resolved.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">공유 링크 확인 중...</p>
      </div>
    );
  }

  if (resolved.status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold text-destructive">링크가 만료되었거나 유효하지 않습니다.</p>
          <p className="text-sm text-muted-foreground">{resolved.message}</p>
        </div>
      </div>
    );
  }

  return <SharedDashboard range={resolved.range} expiresAt={resolved.expiresAt} />;
}

function SharedDashboard({ range, expiresAt }: { range: WeekRange; expiresAt: string }) {
  const {
    totalSessions, totalInstalls, avgEngagementRate,
    channelShare, conversionByChannel, channelRevenue,
    campaignInstalls, installFunnel, retention, trend,
    loading, error,
  } = useDashboardCache(range);

  const kpis: DashboardKpi[] = [
    { label: "총 세션", value: totalSessions !== null ? formatInt(totalSessions) : "데이터 로드 실패" },
    { label: "총 설치", value: totalInstalls !== null ? formatInt(totalInstalls) : "데이터 로드 실패" },
    { label: "평균 참여율", value: avgEngagementRate !== null ? formatRate(avgEngagementRate) : "데이터 로드 실패" },
  ];

  return (
    <div className="min-h-screen bg-background px-6 py-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div className="rounded-lg border bg-card px-6 py-5 space-y-1">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight">마케팅 대시보드</h1>
            <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
              읽기 전용
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{range.label} 데이터 요약</p>
          <p className="text-xs text-amber-600 dark:text-amber-400">
            ⚠️ 이 링크는 {expiresAt}에 만료됩니다.
          </p>
          {error && (
            <p className="text-xs text-destructive">일부 데이터 로드 실패: {error}</p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {loading
            ? Array.from({ length: 3 }).map((_, idx) => (
                <Card key={idx}>
                  <CardContent className="space-y-3 py-4">
                    <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                    <div className="h-8 w-40 animate-pulse rounded bg-muted" />
                  </CardContent>
                </Card>
              ))
            : kpis.map((kpi) => <KpiCard key={kpi.label} kpi={kpi} />)}
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">채널별 세션 비중</CardTitle>
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
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">최근 7일 트렌드</CardTitle>
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

        <p className="text-center text-xs text-muted-foreground pb-4">
          AI 리포트 서비스 · 읽기 전용 공유 뷰 · 이 링크는 {expiresAt}에 만료됩니다.
        </p>
      </div>
    </div>
  );
}
```

---

## 검증 명령

```bash
cd frontend && npx tsc --noEmit
```

Expected: 오류 없음 (exit code 0)

## 수락 기준

- [ ] `frontend/src/app/share/[code]/page.tsx` 생성됨
- [ ] `(app)` 그룹 밖 (`app/share/` 경로) — 사이드바 없음 확인
- [ ] 로딩 중 / 오류 / 정상 세 가지 상태 처리
- [ ] 만료 안내 문구 (`⚠️ 이 링크는 ... 만료됩니다.`) 존재
- [ ] `useDashboardCache` 사용 (Bedrock 호출 없음)
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

## 완료 후 할 일

1. `docs/tasks/SH-03/REPORT.md` 채우기
2. `docs/tasks/status.json`에서 SH-03 status → `"done"` 또는 `"blocked"`
3. `git add "frontend/src/app/share/[code]/page.tsx" docs/tasks/SH-03/REPORT.md docs/tasks/status.json`
4. `git commit -m "feat(share): add public share dashboard page (SH-03)"`
```
