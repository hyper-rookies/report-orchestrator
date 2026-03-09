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
