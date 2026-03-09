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
