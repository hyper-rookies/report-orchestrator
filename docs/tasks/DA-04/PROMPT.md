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
