# Task DA-00: 리뷰 인프라 구축 (Task Management Setup)

## 목적

이 태스크는 **코드를 작성하지 않는다.** 이후 DA-01~DA-05 태스크의 구현 프롬프트와 리뷰 템플릿을 `docs/tasks/` 폴더에 생성하는 것이 전부다.

리뷰어(Claude)가 각 태스크 완료 후 소스 파일을 직접 읽지 않고 `REPORT.md` 한 파일만 읽어 리뷰할 수 있도록 한다.

---

## 배경 (최소 컨텍스트)

- **프로젝트:** `report-orchestrator/frontend` — Next.js 16.1.6, React 19, TypeScript, Recharts 2.x, shadcn/ui
- **계획 문서:** `docs/plans/2026-03-09-dashboard-7charts-expansion.md`
- **검증 명령:** `cd frontend && npx tsc --noEmit` (테스트 프레임워크 없음, TypeScript 타입 체크만)
- **경고:** Windows 환경. 경로 구분자는 `/` 사용.

---

## 작업 내용

아래 파일들을 정확히 생성하라. 내용은 이 프롬프트에 모두 명시되어 있다.

### 생성할 파일 목록

```
docs/tasks/
├── status.json           ← 태스크 상태 추적 (기계 판독용)
├── WORKFLOW.md           ← Codex 작업 방법 안내
├── DA-01/
│   ├── PROMPT.md         ← DA-01 구현 지시
│   └── REPORT.md         ← 완료 후 Codex가 채우는 보고서 (템플릿)
├── DA-02/
│   ├── PROMPT.md
│   └── REPORT.md
├── DA-03/
│   ├── PROMPT.md
│   └── REPORT.md
├── DA-04/
│   ├── PROMPT.md
│   └── REPORT.md
└── DA-05/
    ├── PROMPT.md
    └── REPORT.md
```

---

## 파일 내용

### 1. `docs/tasks/status.json`

```json
{
  "_note": "Codex: 태스크 완료 시 status를 'done'으로, 막히면 'blocked'로 변경하라.",
  "tasks": {
    "DA-01": { "status": "pending", "title": "WeekSelector + ChannelRevenueChart 컴포넌트", "completedAt": null },
    "DA-02": { "status": "pending", "title": "ConversionChart + CampaignInstallsChart 컴포넌트", "completedAt": null },
    "DA-03": { "status": "pending", "title": "InstallFunnelChart + RetentionCohortChart 컴포넌트", "completedAt": null },
    "DA-04": { "status": "pending", "title": "useDashboardData.ts 확장", "completedAt": null },
    "DA-05": { "status": "pending", "title": "dashboard/page.tsx 통합", "completedAt": null }
  }
}
```

---

### 2. `docs/tasks/WORKFLOW.md`

```markdown
# Codex 작업 워크플로우

## 각 태스크 수행 방법

1. `docs/tasks/DA-0X/PROMPT.md` 읽기
2. 코드 구현
3. `cd frontend && npx tsc --noEmit` 실행
4. `docs/tasks/DA-0X/REPORT.md` 채우기
5. `docs/tasks/status.json`에서 해당 태스크 status를 `"done"` (또는 `"blocked"`)로 변경
6. git commit

## 리뷰어에게

리뷰어(Claude)는:
1. `status.json` 확인 → 완료된 태스크 식별
2. 해당 `REPORT.md` 읽기 → 수락 기준 체크, 이탈 사항 확인
3. 문제 없으면 다음 태스크 승인
4. 문제 있으면 REPORT.md의 Questions 섹션에 피드백 작성

## 태스크 의존성

- DA-01, DA-02, DA-03 → 병렬 작업 가능 (독립)
- DA-04 → DA-01, DA-02, DA-03 완료 후
- DA-05 → DA-04 완료 후
```

---

### 3. `docs/tasks/DA-01/PROMPT.md`

```markdown
# DA-01: WeekSelector + ChannelRevenueChart 컴포넌트

## 작업 개요

신규 컴포넌트 2개를 생성한다. **기존 파일을 수정하지 않는다.**

## 생성할 파일

- `frontend/src/components/dashboard/WeekSelector.tsx`
- `frontend/src/components/dashboard/ChannelRevenueChart.tsx`

---

## File 1: `frontend/src/components/dashboard/WeekSelector.tsx`

```tsx
"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface WeekRange {
  start: string;  // "2024-11-22"
  end: string;    // "2024-11-28"
  label: string;  // "2024년 11월 4주차"
}

interface WeekSelectorProps {
  weeks: WeekRange[];
  selectedIndex: number;
  onChange: (index: number) => void;
}

export default function WeekSelector({ weeks, selectedIndex, onChange }: WeekSelectorProps) {
  const hasPrev = selectedIndex > 0;
  const hasNext = selectedIndex < weeks.length - 1;

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        disabled={!hasPrev}
        onClick={() => onChange(selectedIndex - 1)}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-[160px] text-center text-sm font-medium">
        {weeks[selectedIndex]?.label ?? "-"}
      </span>
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        disabled={!hasNext}
        onClick={() => onChange(selectedIndex + 1)}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
```

---

## File 2: `frontend/src/components/dashboard/ChannelRevenueChart.tsx`

```tsx
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

interface ChannelRevenueChartProps {
  data: Array<{ channel: string; revenue: number }>;
  loading?: boolean;
}

export default function ChannelRevenueChart({ data, loading = false }: ChannelRevenueChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">채널별 매출</CardTitle>
        </CardHeader>
        <CardContent className="h-[240px] animate-pulse bg-muted rounded" />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">채널별 매출</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="channel"
              tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
            />
            <YAxis
              tickFormatter={(v) => `₩${(v / 1000).toFixed(0)}k`}
              tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
            />
            <Tooltip
              formatter={(value: number) => [`₩${value.toLocaleString()}`, "매출"]}
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
            />
            <Bar dataKey="revenue" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

---

## 수락 기준 (Acceptance Criteria)

- [ ] `WeekSelector.tsx` 생성됨
- [ ] `WeekSelector.tsx`에서 `WeekRange` 인터페이스가 export됨
- [ ] `ChannelRevenueChart.tsx` 생성됨
- [ ] `ChannelRevenueChart.tsx`의 `data` prop 타입: `Array<{ channel: string; revenue: number }>`
- [ ] `loading` prop 있고 스켈레톤 UI 렌더링됨
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

## 완료 후 할 일

1. `docs/tasks/DA-01/REPORT.md` 채우기
2. `docs/tasks/status.json`에서 DA-01 status → `"done"` (완료) 또는 `"blocked"` (막힘)
3. `git add frontend/src/components/dashboard/WeekSelector.tsx frontend/src/components/dashboard/ChannelRevenueChart.tsx docs/tasks/DA-01/REPORT.md docs/tasks/status.json`
4. `git commit -m "feat(dashboard): add WeekSelector and ChannelRevenueChart components (DA-01)"`
```

---

### 4. `docs/tasks/DA-01/REPORT.md` (템플릿)

```markdown
# DA-01 Task Report

**Status:** IN_PROGRESS | DONE | BLOCKED  ← 해당하는 것 하나만 남기기

**Completed At:** (ISO timestamp)

---

## Acceptance Criteria

- [ ] `WeekSelector.tsx` 생성됨
- [ ] `WeekSelector.tsx`에서 `WeekRange` 인터페이스가 export됨
- [ ] `ChannelRevenueChart.tsx` 생성됨
- [ ] `ChannelRevenueChart.tsx`의 `data` prop 타입: `Array<{ channel: string; revenue: number }>`
- [ ] `loading` prop 있고 스켈레톤 UI 렌더링됨
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `frontend/src/components/dashboard/WeekSelector.tsx` | Created | ? |
| `frontend/src/components/dashboard/ChannelRevenueChart.tsx` | Created | ? |

---

## TypeScript Check

```
$ cd frontend && npx tsc --noEmit
(출력 붙여넣기)
```

---

## Deviations from Plan

없음 / (계획과 다른 점 기술)

---

## Questions for Reviewer

없음 / (리뷰어에게 물어볼 것)
```

---

### 5. `docs/tasks/DA-02/PROMPT.md`

```markdown
# DA-02: ConversionChart + CampaignInstallsChart 컴포넌트

## 작업 개요

신규 컴포넌트 2개를 생성한다. **기존 파일을 수정하지 않는다.**

## 생성할 파일

- `frontend/src/components/dashboard/ConversionChart.tsx`
- `frontend/src/components/dashboard/CampaignInstallsChart.tsx`

---

## File 1: `frontend/src/components/dashboard/ConversionChart.tsx`

```tsx
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

interface ConversionChartProps {
  data: Array<{ channel: string; conversionRate: number }>;
  loading?: boolean;
}

export default function ConversionChart({ data, loading = false }: ConversionChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">채널별 전환율</CardTitle>
        </CardHeader>
        <CardContent className="h-[240px] animate-pulse bg-muted rounded" />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">채널별 전환율</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="channel"
              tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
            />
            <YAxis
              tickFormatter={(v) => `${(v * 100).toFixed(1)}%`}
              tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
            />
            <Tooltip
              formatter={(value: number) => [`${(value * 100).toFixed(2)}%`, "전환율"]}
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
            />
            <Bar dataKey="conversionRate" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

---

## File 2: `frontend/src/components/dashboard/CampaignInstallsChart.tsx`

```tsx
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

export default function CampaignInstallsChart({ data, loading = false }: CampaignInstallsChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">캠페인별 설치 TOP 10</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px] animate-pulse bg-muted rounded" />
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
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
            />
            <YAxis
              dataKey="campaign"
              type="category"
              width={120}
              tick={{ fontSize: 10, fill: "hsl(var(--foreground))" }}
            />
            <Tooltip
              formatter={(value: number) => [value.toLocaleString(), "설치"]}
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
            />
            <Bar dataKey="installs" fill="hsl(var(--chart-3))" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

---

## 수락 기준

- [ ] `ConversionChart.tsx` 생성됨
- [ ] `ConversionChart.tsx`의 `data` prop 타입: `Array<{ channel: string; conversionRate: number }>`
- [ ] `CampaignInstallsChart.tsx` 생성됨
- [ ] `CampaignInstallsChart.tsx`의 `data` prop 타입: `Array<{ campaign: string; installs: number }>`
- [ ] 두 컴포넌트 모두 `loading` prop 있고 스켈레톤 UI 렌더링됨
- [ ] `CampaignInstallsChart`가 `data.slice(0, 10)` 적용 (TOP 10)
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

## 완료 후 할 일

1. `docs/tasks/DA-02/REPORT.md` 채우기
2. `docs/tasks/status.json`에서 DA-02 status → `"done"` 또는 `"blocked"`
3. `git add frontend/src/components/dashboard/ConversionChart.tsx frontend/src/components/dashboard/CampaignInstallsChart.tsx docs/tasks/DA-02/REPORT.md docs/tasks/status.json`
4. `git commit -m "feat(dashboard): add ConversionChart and CampaignInstallsChart components (DA-02)"`
```

---

### 6. `docs/tasks/DA-02/REPORT.md` (템플릿)

```markdown
# DA-02 Task Report

**Status:** IN_PROGRESS | DONE | BLOCKED

**Completed At:** (ISO timestamp)

---

## Acceptance Criteria

- [ ] `ConversionChart.tsx` 생성됨
- [ ] `ConversionChart.tsx`의 `data` prop 타입: `Array<{ channel: string; conversionRate: number }>`
- [ ] `CampaignInstallsChart.tsx` 생성됨
- [ ] `CampaignInstallsChart.tsx`의 `data` prop 타입: `Array<{ campaign: string; installs: number }>`
- [ ] 두 컴포넌트 모두 `loading` prop 있고 스켈레톤 UI 렌더링됨
- [ ] `CampaignInstallsChart`가 `data.slice(0, 10)` 적용 (TOP 10)
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `frontend/src/components/dashboard/ConversionChart.tsx` | Created | ? |
| `frontend/src/components/dashboard/CampaignInstallsChart.tsx` | Created | ? |

---

## TypeScript Check

```
$ cd frontend && npx tsc --noEmit
(출력 붙여넣기)
```

---

## Deviations from Plan

없음 / (계획과 다른 점 기술)

---

## Questions for Reviewer

없음 / (리뷰어에게 물어볼 것)
```

---

### 7. `docs/tasks/DA-03/PROMPT.md`

```markdown
# DA-03: InstallFunnelChart + RetentionCohortChart 컴포넌트

## 작업 개요

신규 컴포넌트 2개를 생성한다. **기존 파일을 수정하지 않는다.**

## 생성할 파일

- `frontend/src/components/dashboard/InstallFunnelChart.tsx`
- `frontend/src/components/dashboard/RetentionCohortChart.tsx`

---

## File 1: `frontend/src/components/dashboard/InstallFunnelChart.tsx`

```tsx
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

const FUNNEL_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
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
          <CardTitle className="text-sm font-medium">설치 이벤트 퍼널</CardTitle>
        </CardHeader>
        <CardContent className="h-[240px] animate-pulse bg-muted rounded" />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">설치 이벤트 퍼널</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="stage"
              tick={{ fontSize: 10, fill: "hsl(var(--foreground))" }}
            />
            <YAxis
              tickFormatter={(v) => v.toLocaleString()}
              tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
            />
            <Tooltip
              formatter={(value: number) => [value.toLocaleString(), "이벤트 수"]}
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={FUNNEL_COLORS[index % FUNNEL_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

---

## File 2: `frontend/src/components/dashboard/RetentionCohortChart.tsx`

```tsx
"use client";

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

interface RetentionCohortChartProps {
  data: Array<{ day: number; retentionRate: number }>;
  loading?: boolean;
}

export default function RetentionCohortChart({ data, loading = false }: RetentionCohortChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">리텐션 코호트 (Day N)</CardTitle>
        </CardHeader>
        <CardContent className="h-[240px] animate-pulse bg-muted rounded" />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">리텐션 코호트 (Day N)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="day"
              tickFormatter={(v) => `D${v}`}
              tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
            />
            <YAxis
              domain={[0, 1]}
              tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
              tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
            />
            <Tooltip
              formatter={(value: number) => [`${(value * 100).toFixed(1)}%`, "리텐션율"]}
              labelFormatter={(label) => `Day ${label}`}
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
            />
            <Line
              type="monotone"
              dataKey="retentionRate"
              stroke="hsl(var(--chart-1))"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

---

## 수락 기준

- [ ] `InstallFunnelChart.tsx` 생성됨
- [ ] `InstallFunnelChart.tsx`의 `data` prop 타입: `Array<{ stage: string; count: number }>`
- [ ] `RetentionCohortChart.tsx` 생성됨
- [ ] `RetentionCohortChart.tsx`의 `data` prop 타입: `Array<{ day: number; retentionRate: number }>`
- [ ] 두 컴포넌트 모두 `loading` prop 있고 스켈레톤 UI 렌더링됨
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

## 완료 후 할 일

1. `docs/tasks/DA-03/REPORT.md` 채우기
2. `docs/tasks/status.json`에서 DA-03 status → `"done"` 또는 `"blocked"`
3. `git add frontend/src/components/dashboard/InstallFunnelChart.tsx frontend/src/components/dashboard/RetentionCohortChart.tsx docs/tasks/DA-03/REPORT.md docs/tasks/status.json`
4. `git commit -m "feat(dashboard): add InstallFunnelChart and RetentionCohortChart components (DA-03)"`
```

---

### 8. `docs/tasks/DA-03/REPORT.md` (템플릿)

```markdown
# DA-03 Task Report

**Status:** IN_PROGRESS | DONE | BLOCKED

**Completed At:** (ISO timestamp)

---

## Acceptance Criteria

- [ ] `InstallFunnelChart.tsx` 생성됨
- [ ] `InstallFunnelChart.tsx`의 `data` prop 타입: `Array<{ stage: string; count: number }>`
- [ ] `RetentionCohortChart.tsx` 생성됨
- [ ] `RetentionCohortChart.tsx`의 `data` prop 타입: `Array<{ day: number; retentionRate: number }>`
- [ ] 두 컴포넌트 모두 `loading` prop 있고 스켈레톤 UI 렌더링됨
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `frontend/src/components/dashboard/InstallFunnelChart.tsx` | Created | ? |
| `frontend/src/components/dashboard/RetentionCohortChart.tsx` | Created | ? |

---

## TypeScript Check

```
$ cd frontend && npx tsc --noEmit
(출력 붙여넣기)
```

---

## Deviations from Plan

없음 / (계획과 다른 점 기술)

---

## Questions for Reviewer

없음 / (리뷰어에게 물어볼 것)
```

---

### 9. `docs/tasks/DA-04/PROMPT.md`

(DA-01, DA-02, DA-03 완료 후 시작할 것)

```markdown
# DA-04: useDashboardData.ts 확장

**전제 조건:** DA-01, DA-02, DA-03이 모두 `docs/tasks/status.json`에서 `"done"` 상태여야 한다.

## 작업 개요

`frontend/src/hooks/useDashboardData.ts` 파일을 수정한다. **다른 파일은 수정하지 않는다.**

## 수정할 파일

- `frontend/src/hooks/useDashboardData.ts`

---

## 변경 사항

### 1. 시그니처에 `selectedRange` 파라미터 추가

```ts
// 기존
export function useDashboardData() {

// 변경 후
export interface WeekRange {
  start: string;
  end: string;
  label: string;
}

export function useDashboardData(selectedRange?: WeekRange) {
  const start = selectedRange?.start ?? "2024-11-22";
  const end = selectedRange?.end ?? "2024-11-28";
```

### 2. `DashboardData` 인터페이스에 5개 필드 추가

```ts
export interface DashboardData {
  // 기존 필드 유지 ...

  // 신규 필드
  conversionByChannel: Array<{ channel: string; conversionRate: number }>;
  channelRevenue: Array<{ channel: string; revenue: number }>;
  campaignInstalls: Array<{ campaign: string; installs: number }>;
  installFunnel: Array<{ stage: string; count: number }>;
  retention: Array<{ day: number; retentionRate: number }>;
}
```

### 3. 초기 상태에 신규 필드 기본값 추가

```ts
conversionByChannel: [],
channelRevenue: [],
campaignInstalls: [],
installFunnel: [],
retention: [],
```

### 4. 기존 sessions 쿼리 수정 (날짜 파라미터 + conversions 추가)

```ts
// 기존
const sessionsQuestion = "24년 11월 채널별 총 세션수를 보여줘";

// 변경 후
const sessionsQuestion = `${start}부터 ${end}까지 채널별 세션수와 전환수를 보여줘`;
```

sessions 쿼리의 rows 파싱 부분에서 `conversions` 컬럼 추출 추가:

```ts
// sessions 쿼리 결과 파싱 후
const conversionByChannel = rows
  .filter((r) => r.conversions != null && r.sessions > 0)
  .map((r) => ({
    channel: String(r.channel_group ?? "Unknown"),
    conversionRate: Number(r.conversions) / Number(r.sessions),
  }));
update((d) => ({ ...d, conversionByChannel }));
```

### 5. 기존 나머지 쿼리들도 날짜 파라미터화

```ts
const installsQuestion = `${start}부터 ${end}까지 미디어소스별 총 설치건수를 보여줘`;
const engagementQuestion = `${start}부터 ${end}까지 채널별 engagement_rate를 보여줘`;
const trendSessionsQuestion = `${start}부터 ${end}까지 v_latest_ga4_acquisition_daily에서 dt 일자별 sessions 합계를 보여줘`;
const trendInstallsQuestion = `${start}부터 ${end}까지 v_latest_appsflyer_installs_daily에서 dt 일자별 installs 합계를 보여줘`;
```

### 6. 신규 쿼리 4개 추가

기존 쿼리들 이후에 추가한다. 동일한 `runSseQuery` 패턴 사용.

```ts
// --- 신규 쿼리 6: 채널별 매출 ---
const channelRevenueQuestion = `${start}부터 ${end}까지 v_latest_ga4_acquisition_daily에서 channel_group별 total_revenue 합계를 보여줘`;
const channelRevenueResult = await runSseQuery(channelRevenueQuestion, signal);
if (channelRevenueResult.type === "table") {
  const rows = channelRevenueResult.rows as Array<Record<string, unknown>>;
  const channelRevenue = rows.map((r) => ({
    channel: String(r.channel_group ?? "Unknown"),
    revenue: Number(r.total_revenue ?? 0),
  }));
  update((d) => ({ ...d, channelRevenue }));
} else if (channelRevenueResult.type === "error") {
  setNullErrors((e) => ({ ...e, channelRevenue: channelRevenueResult.message }));
}

// --- 신규 쿼리 7: 캠페인별 설치 ---
const campaignInstallsQuestion = `${start}부터 ${end}까지 v_latest_appsflyer_installs_daily에서 campaign별 installs 합계를 내림차순으로 보여줘`;
const campaignInstallsResult = await runSseQuery(campaignInstallsQuestion, signal);
if (campaignInstallsResult.type === "table") {
  const rows = campaignInstallsResult.rows as Array<Record<string, unknown>>;
  const campaignInstalls = rows.map((r) => ({
    campaign: String(r.campaign ?? "Unknown"),
    installs: Number(r.installs ?? 0),
  }));
  update((d) => ({ ...d, campaignInstalls }));
} else if (campaignInstallsResult.type === "error") {
  setNullErrors((e) => ({ ...e, campaignInstalls: campaignInstallsResult.message }));
}

// --- 신규 쿼리 8: 이벤트 퍼널 ---
const installFunnelQuestion = `${start}부터 ${end}까지 v_latest_appsflyer_events_daily에서 event_name별 event_count 합계를 보여줘`;
const installFunnelResult = await runSseQuery(installFunnelQuestion, signal);
if (installFunnelResult.type === "table") {
  const rows = installFunnelResult.rows as Array<Record<string, unknown>>;
  const installFunnel = rows.map((r) => ({
    stage: String(r.event_name ?? "Unknown"),
    count: Number(r.event_count ?? 0),
  }));
  update((d) => ({ ...d, installFunnel }));
} else if (installFunnelResult.type === "error") {
  setNullErrors((e) => ({ ...e, installFunnel: installFunnelResult.message }));
}

// --- 신규 쿼리 9: 리텐션 코호트 ---
const retentionQuestion = `${start}부터 ${end}까지 v_latest_appsflyer_cohort_daily에서 cohort_day별 retained_users 합계와 cohort_size 합계를 보여줘`;
const retentionResult = await runSseQuery(retentionQuestion, signal);
if (retentionResult.type === "table") {
  const rows = retentionResult.rows as Array<Record<string, unknown>>;
  const retention = rows
    .filter((r) => Number(r.cohort_size ?? 0) > 0)
    .map((r) => ({
      day: Number(r.cohort_day ?? 0),
      retentionRate: Number(r.retained_users ?? 0) / Number(r.cohort_size),
    }))
    .sort((a, b) => a.day - b.day);
  update((d) => ({ ...d, retention }));
} else if (retentionResult.type === "error") {
  setNullErrors((e) => ({ ...e, retention: retentionResult.message }));
}
```

### 7. `useEffect` dependency array 업데이트

```ts
// 기존
}, []);

// 변경 후
}, [start, end]);
```

**주의:** `start`와 `end`는 위 1번 단계에서 선언된 const 변수다.

---

## 수락 기준

- [ ] `useDashboardData(selectedRange?: WeekRange)` 시그니처로 변경됨
- [ ] `DashboardData` 인터페이스에 5개 신규 필드 추가됨
- [ ] 기존 5개 쿼리 모두 `${start}부터 ${end}까지` 형태로 날짜 파라미터화됨
- [ ] 신규 쿼리 4개 (channel_revenue, campaign_installs, install_funnel, retention) 추가됨
- [ ] `conversionByChannel` 파싱 로직 추가됨
- [ ] `useEffect` deps에 `start, end` 포함됨
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

## 완료 후 할 일

1. `docs/tasks/DA-04/REPORT.md` 채우기
2. `docs/tasks/status.json`에서 DA-04 status → `"done"` 또는 `"blocked"`
3. `git add frontend/src/hooks/useDashboardData.ts docs/tasks/DA-04/REPORT.md docs/tasks/status.json`
4. `git commit -m "feat(dashboard): expand useDashboardData with week range and 4 new queries (DA-04)"`
```

---

### 10. `docs/tasks/DA-04/REPORT.md` (템플릿)

```markdown
# DA-04 Task Report

**Status:** IN_PROGRESS | DONE | BLOCKED

**Completed At:** (ISO timestamp)

---

## Acceptance Criteria

- [ ] `useDashboardData(selectedRange?: WeekRange)` 시그니처로 변경됨
- [ ] `DashboardData` 인터페이스에 5개 신규 필드 추가됨
- [ ] 기존 5개 쿼리 모두 날짜 파라미터화됨
- [ ] 신규 쿼리 4개 추가됨
- [ ] `conversionByChannel` 파싱 로직 추가됨
- [ ] `useEffect` deps에 `start, end` 포함됨
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

---

## Files Changed

| File | Action | Lines Before | Lines After |
|------|--------|-------------|-------------|
| `frontend/src/hooks/useDashboardData.ts` | Modified | ? | ? |

---

## TypeScript Check

```
$ cd frontend && npx tsc --noEmit
(출력 붙여넣기)
```

---

## Deviations from Plan

없음 / (계획과 다른 점 기술)

---

## Questions for Reviewer

없음 / (리뷰어에게 물어볼 것)
```

---

### 11. `docs/tasks/DA-05/PROMPT.md`

(DA-04 완료 후 시작할 것)

```markdown
# DA-05: dashboard/page.tsx 통합

**전제 조건:** DA-04가 `docs/tasks/status.json`에서 `"done"` 상태여야 한다.

## 작업 개요

`frontend/src/app/(app)/dashboard/page.tsx` 파일을 수정한다. **다른 파일은 수정하지 않는다.**

## 수정할 파일

- `frontend/src/app/(app)/dashboard/page.tsx`

---

## 변경 사항

### 1. 상수: WEEKS 정의

```ts
import type { WeekRange } from "@/components/dashboard/WeekSelector";

const WEEKS: WeekRange[] = [
  { start: "2024-11-01", end: "2024-11-07", label: "2024년 11월 1주차" },
  { start: "2024-11-08", end: "2024-11-14", label: "2024년 11월 2주차" },
  { start: "2024-11-15", end: "2024-11-21", label: "2024년 11월 3주차" },
  { start: "2024-11-22", end: "2024-11-28", label: "2024년 11월 4주차" },
  { start: "2024-11-29", end: "2024-11-30", label: "2024년 11월 5주차" },
];
```

### 2. 컴포넌트 내 상태 추가

```ts
const [selectedWeekIndex, setSelectedWeekIndex] = useState(3);
const selectedRange = WEEKS[selectedWeekIndex];
```

### 3. 훅 호출 변경

```ts
// 기존
const { data, loading } = useDashboardData();

// 변경 후
const { data, loading } = useDashboardData(selectedRange);
```

### 4. 헤더에 WeekSelector 추가

```tsx
import WeekSelector from "@/components/dashboard/WeekSelector";

// 헤더 영역
<div className="flex items-center justify-between">
  <h1 className="text-2xl font-bold">마케팅 대시보드</h1>
  <WeekSelector
    weeks={WEEKS}
    selectedIndex={selectedWeekIndex}
    onChange={setSelectedWeekIndex}
  />
</div>
```

### 5. 신규 차트 4개 임포트 및 렌더링

```tsx
import ChannelRevenueChart from "@/components/dashboard/ChannelRevenueChart";
import ConversionChart from "@/components/dashboard/ConversionChart";
import CampaignInstallsChart from "@/components/dashboard/CampaignInstallsChart";
import InstallFunnelChart from "@/components/dashboard/InstallFunnelChart";
import RetentionCohortChart from "@/components/dashboard/RetentionCohortChart";
```

레이아웃 (기존 차트 유지, 신규 차트 아래에 추가):

```tsx
{/* 기존 차트들 유지 */}
...

{/* 신규 2행 */}
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  <ChannelRevenueChart data={data.channelRevenue} loading={loading.channelRevenue} />
  <ConversionChart data={data.conversionByChannel} loading={loading.conversionByChannel} />
</div>

<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  <CampaignInstallsChart data={data.campaignInstalls} loading={loading.campaignInstalls} />
  <InstallFunnelChart data={data.installFunnel} loading={loading.installFunnel} />
</div>

<div className="grid grid-cols-1 gap-4">
  <RetentionCohortChart data={data.retention} loading={loading.retention} />
</div>
```

**주의:** `loading` 객체의 신규 필드는 DA-04에서 추가됨. 기존 `loading` 패턴 확인 후 동일하게 적용.

---

## 수락 기준

- [ ] `WEEKS` 상수 (5개 WeekRange) 정의됨
- [ ] `selectedWeekIndex` 상태 (`useState(3)`) 추가됨
- [ ] `useDashboardData(selectedRange)` 호출됨
- [ ] 헤더에 `WeekSelector` 렌더링됨
- [ ] 신규 차트 4개 모두 렌더링됨 (ChannelRevenue, Conversion, CampaignInstalls, InstallFunnel)
- [ ] `RetentionCohortChart` 렌더링됨
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

## 완료 후 할 일

1. `docs/tasks/DA-05/REPORT.md` 채우기
2. `docs/tasks/status.json`에서 DA-05 status → `"done"` 또는 `"blocked"`
3. `git add frontend/src/app/\(app\)/dashboard/page.tsx docs/tasks/DA-05/REPORT.md docs/tasks/status.json`
4. `git commit -m "feat(dashboard): integrate 7-chart layout with week selector (DA-05)"`
```

---

### 12. `docs/tasks/DA-05/REPORT.md` (템플릿)

```markdown
# DA-05 Task Report

**Status:** IN_PROGRESS | DONE | BLOCKED

**Completed At:** (ISO timestamp)

---

## Acceptance Criteria

- [ ] `WEEKS` 상수 (5개 WeekRange) 정의됨
- [ ] `selectedWeekIndex` 상태 (`useState(3)`) 추가됨
- [ ] `useDashboardData(selectedRange)` 호출됨
- [ ] 헤더에 `WeekSelector` 렌더링됨
- [ ] 신규 차트 4개 모두 렌더링됨
- [ ] `RetentionCohortChart` 렌더링됨
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

---

## Files Changed

| File | Action | Lines Before | Lines After |
|------|--------|-------------|-------------|
| `frontend/src/app/(app)/dashboard/page.tsx` | Modified | ? | ? |

---

## TypeScript Check

```
$ cd frontend && npx tsc --noEmit
(출력 붙여넣기)
```

---

## Deviations from Plan

없음 / (계획과 다른 점 기술)

---

## Questions for Reviewer

없음 / (리뷰어에게 물어볼 것)
```

---

## 검증

아래 명령을 실행해 모든 파일이 생성되었는지 확인하라:

```bash
ls docs/tasks/
ls docs/tasks/DA-01/
ls docs/tasks/DA-02/
ls docs/tasks/DA-03/
ls docs/tasks/DA-04/
ls docs/tasks/DA-05/
cat docs/tasks/status.json
```

모두 존재하면 이 태스크는 완료다.

## 완료 후 할 일

1. `docs/tasks/status.json`에서 DA-00 추가 없음 (이 파일은 DA-00 자체임)
2. `git add docs/tasks/`
3. `git commit -m "chore(tasks): add task management infrastructure for DA-01~05 (DA-00)"`
```
