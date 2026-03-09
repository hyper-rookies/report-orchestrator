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
