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
