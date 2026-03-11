# Task DR-00: Daily/Monthly/Custom Dashboard 태스크 인프라 구축

## 목적

코드를 작성하지 않는다. DR-01~DR-11 태스크의 구현 프롬프트와 리뷰 템플릿을 `docs/tasks/` 폴더에 생성하고, `docs/tasks/status.json`에 DR 태스크들을 추가한다.

---

## 배경 (최소 컨텍스트)

- **구현 계획:** `docs/superpowers/plans/2026-03-11-daily-monthly-dashboard.md` — 반드시 읽고 시작할 것
- **설계 문서:** `docs/superpowers/specs/2026-03-11-daily-monthly-custom-dashboard-design.md`
- **프로젝트:** `report-orchestrator` — Next.js 프론트엔드 (`frontend/`) + Python 백엔드 (`backend/scripts/`)
- **목표:** 대시보드에 일간/월간/커스텀 탭 추가, 섹션별 Bedrock 요약 코멘트, S3 캐시, 핀 기능
- **전제 조건:** 없음

---

## 작업 내용

아래 파일들을 생성하라.

### 생성할 파일 목록

```text
docs/tasks/
├── status.json              ← DR-01~11 항목 추가 (기존 항목 유지)
├── DR-01/
│   ├── PROMPT.md
│   └── REPORT.md
├── DR-02/
│   ├── PROMPT.md
│   └── REPORT.md
├── DR-03/
│   ├── PROMPT.md
│   └── REPORT.md
├── DR-04/
│   ├── PROMPT.md
│   └── REPORT.md
├── DR-05/
│   ├── PROMPT.md
│   └── REPORT.md
├── DR-06/
│   ├── PROMPT.md
│   └── REPORT.md
├── DR-07/
│   ├── PROMPT.md
│   └── REPORT.md
├── DR-08/
│   ├── PROMPT.md
│   └── REPORT.md
├── DR-09/
│   ├── PROMPT.md
│   └── REPORT.md
├── DR-10/
│   ├── PROMPT.md
│   └── REPORT.md
└── DR-11/
    ├── PROMPT.md
    └── REPORT.md
```

---

## 파일 내용

### 1. `docs/tasks/status.json` 업데이트

기존 항목은 그대로 두고 DR-* 항목을 추가한다. `tasks` 오브젝트 마지막에 아래 블록을 넣는다:

```json
"DR-01": { "status": "pending", "title": "shared types + AWS SDK + athenaClient + reportStaleness", "completedAt": null },
"DR-02": { "status": "pending", "title": "reportQueriesDaily.ts — SQL builders + row converters", "completedAt": null },
"DR-03": { "status": "pending", "title": "reportQueriesMonthly.ts — SQL builders + row converters", "completedAt": null },
"DR-04": { "status": "pending", "title": "bedrockComment.ts — Bedrock Claude Haiku comment helper", "completedAt": null },
"DR-05": { "status": "pending", "title": "reportS3.ts — S3 cache adapter + pin helpers", "completedAt": null },
"DR-06": { "status": "pending", "title": "API routes: /api/reports/daily + monthly + pins", "completedAt": null },
"DR-07": { "status": "pending", "title": "useReportSection hook + PinButton component", "completedAt": null },
"DR-08": { "status": "pending", "title": "ReportLineChart + ReportSection components", "completedAt": null },
"DR-09": { "status": "pending", "title": "DailyReport + MonthlyReport + CustomDashboard pages", "completedAt": null },
"DR-10": { "status": "pending", "title": "dashboard/page.tsx period tab routing", "completedAt": null },
"DR-11": { "status": "pending", "title": "precompute_dashboard.py Bedrock comments + weekly rendering", "completedAt": null }
```

---

### 2. `docs/tasks/DR-01/PROMPT.md`

````markdown
# DR-01: Shared types + AWS SDK + Athena client + Staleness helper

## 목적

`frontend/src/types/report.ts`, `frontend/src/lib/athenaClient.ts`, `frontend/src/lib/reportStaleness.ts` 를 신규 생성한다. AWS SDK 패키지를 설치한다. 기존 파일은 수정하지 않는다.

---

## 배경

- **구현 계획:** `docs/superpowers/plans/2026-03-11-daily-monthly-dashboard.md` — **Task 1, Task 2, Task 3** 을 정확히 따를 것
- **프로젝트:** `frontend/` (Next.js 14, TypeScript)
- **중요:** `ChartSpec`은 `series: Array<{ dataKey: string; label: string }>` 형식 사용 (ReportBarChart.tsx 호환)
- 테스트: `npx jest src/lib/__tests__/athenaClient.test.ts --no-coverage` 및 `npx jest src/lib/__tests__/reportStaleness.test.ts --no-coverage`

---

## 생성/수정 파일

| 파일 | 액션 |
| ---- | ---- |
| `frontend/src/types/report.ts` | 신규 생성 |
| `frontend/src/lib/athenaClient.ts` | 신규 생성 |
| `frontend/src/lib/__tests__/athenaClient.test.ts` | 신규 생성 |
| `frontend/src/lib/reportStaleness.ts` | 신규 생성 |
| `frontend/src/lib/__tests__/reportStaleness.test.ts` | 신규 생성 |
| `frontend/package.json` | `@aws-sdk/client-athena`, `@aws-sdk/client-bedrock-runtime` 추가 |

---

## 구현 지침

계획 문서 Task 1 (types/report.ts), Task 2 (athenaClient.ts), Task 3 (reportStaleness.ts) 를 순서대로 TDD로 구현한다.

**타입 주의사항:**
- `ChartSpec.chartType`: `"bar" | "line"` (pie/scatter 제외)
- `ChartSpec.series`: `Array<{ dataKey: string; label: string }>` — `yAxis: string[]` 사용 금지
- `DAILY_SECTION_IDS`, `MONTHLY_SECTION_IDS` 는 `types/report.ts` 에 정의 (다른 파일에서 re-export 금지)

---

## 검증

```bash
cd frontend
npm install @aws-sdk/client-athena @aws-sdk/client-bedrock-runtime
npx jest src/lib/__tests__/athenaClient.test.ts --no-coverage
# Expected: PASS (2 tests)
npx jest src/lib/__tests__/reportStaleness.test.ts --no-coverage
# Expected: PASS (5 tests)
npx tsc --noEmit
# Expected: 에러 없음
```

---

## 수락 기준

- [ ] `frontend/src/types/report.ts` 생성됨 (ChartSpec에 series 필드 있음)
- [ ] `frontend/src/lib/athenaClient.ts` 생성됨
- [ ] `frontend/src/lib/__tests__/athenaClient.test.ts` PASS
- [ ] `frontend/src/lib/reportStaleness.ts` 생성됨
- [ ] `frontend/src/lib/__tests__/reportStaleness.test.ts` PASS (5 tests)
- [ ] `npx tsc --noEmit` 에러 없음
- [ ] AWS SDK 패키지 설치됨
````

---

### 3. `docs/tasks/DR-01/REPORT.md`

```markdown
# DR-01 Task Report

**Status:** TODO: DONE / BLOCKED

**Completed At:** <!-- ISO 8601 timestamp -->

---

## Acceptance Criteria

- [ ] `frontend/src/types/report.ts` created (ChartSpec uses series, not yAxis)
- [ ] `frontend/src/lib/athenaClient.ts` created
- [ ] `frontend/src/lib/__tests__/athenaClient.test.ts` PASS (2 tests)
- [ ] `frontend/src/lib/reportStaleness.ts` created
- [ ] `frontend/src/lib/__tests__/reportStaleness.test.ts` PASS (5 tests)
- [ ] `npx tsc --noEmit` no errors
- [ ] AWS SDK packages installed

---

## Files Changed

| File | Action | Lines |
| ---- | ------ | ----- |
| `frontend/src/types/report.ts` | Created | |
| `frontend/src/lib/athenaClient.ts` | Created | |
| `frontend/src/lib/__tests__/athenaClient.test.ts` | Created | |
| `frontend/src/lib/reportStaleness.ts` | Created | |
| `frontend/src/lib/__tests__/reportStaleness.test.ts` | Created | |
| `frontend/package.json` | Modified | |

---

## Test Output

```bash
$ cd frontend && npx jest src/lib/__tests__/athenaClient.test.ts --no-coverage
# paste output here

$ npx jest src/lib/__tests__/reportStaleness.test.ts --no-coverage
# paste output here
```

---

## Deviations from Plan

None.

---

## Questions for Reviewer

None.
```

---

### 4. `docs/tasks/DR-02/PROMPT.md`

````markdown
# DR-02: reportQueriesDaily.ts — 일간 섹션 SQL 빌더 + 행 변환기

## 목적

`frontend/src/lib/reportQueriesDaily.ts` 와 테스트를 신규 생성한다. 기존 파일은 수정하지 않는다.

---

## 배경

- **구현 계획:** `docs/superpowers/plans/2026-03-11-daily-monthly-dashboard.md` — **Task 4** 를 정확히 따를 것
- **전제 조건:** DR-01 완료 (types/report.ts 의 `ChartSpec`, `DailySectionId` 사용)
- **중요 버그 방지:**
  - `channel` 케이스 SQL: `WHERE ${f}` 사용 (f = `dt = date '...'`). `WHERE a.${f}` 절대 금지
  - `kpi` 테이블 columns: `["total_sessions", "total_conversions", "total_revenue", "total_installs", "top_channel", "top_media_source"]` 명시 사용 (`Object.keys()` 금지)
  - 모든 ChartSpec: `series: [{dataKey: "...", label: "..."}]` 형식 사용 (`yAxis` 금지)

---

## 생성 파일

| 파일 | 액션 |
| ---- | ---- |
| `frontend/src/lib/reportQueriesDaily.ts` | 신규 생성 |
| `frontend/src/lib/__tests__/reportQueriesDaily.test.ts` | 신규 생성 |

---

## 검증

```bash
cd frontend
npx jest src/lib/__tests__/reportQueriesDaily.test.ts --no-coverage
# Expected: PASS (6 tests)
npx tsc --noEmit
```

---

## 수락 기준

- [ ] `buildDailySql("traffic", "2026-03-11")` 에 `dt = date '2026-03-11'` 포함
- [ ] `buildDailySql("channel", "2026-03-11")` 에 `LEFT JOIN` 포함, `WHERE a.dt` 없음
- [ ] `buildDailySql("kpi", "2026-03-11")` 가 배열 4개 반환
- [ ] `convertDailyRows("kpi", ...)` 테이블 columns가 명시적 6개 목록
- [ ] 모든 ChartSpec에 `series` 필드 있음 (`yAxis` 없음)
- [ ] 테스트 PASS
````

---

### 5. `docs/tasks/DR-02/REPORT.md`

```markdown
# DR-02 Task Report

**Status:** TODO: DONE / BLOCKED

**Completed At:** <!-- ISO 8601 timestamp -->

---

## Acceptance Criteria

- [ ] `buildDailySql("channel", ...)` uses `WHERE ${f}` not `WHERE a.${f}`
- [ ] `convertDailyRows("kpi", ...)` columns is explicit list of 6
- [ ] All ChartSpec objects use `series` not `yAxis`
- [ ] All tests PASS

---

## Files Changed

| File | Action | Lines |
| ---- | ------ | ----- |
| `frontend/src/lib/reportQueriesDaily.ts` | Created | |
| `frontend/src/lib/__tests__/reportQueriesDaily.test.ts` | Created | |

---

## Test Output

```bash
$ cd frontend && npx jest src/lib/__tests__/reportQueriesDaily.test.ts --no-coverage
# paste output here
```

---

## Deviations from Plan

None.

---

## Questions for Reviewer

None.
```

---

### 6. `docs/tasks/DR-03/PROMPT.md`

````markdown
# DR-03: reportQueriesMonthly.ts — 월간 섹션 SQL 빌더 + 행 변환기

## 목적

`frontend/src/lib/reportQueriesMonthly.ts` 와 테스트를 신규 생성한다. 기존 파일은 수정하지 않는다.

---

## 배경

- **구현 계획:** `docs/superpowers/plans/2026-03-11-daily-monthly-dashboard.md` — **Task 5** 를 정확히 따를 것
- **전제 조건:** DR-01 완료 (types/report.ts 의 `ChartSpec`, `MonthlySectionId` 사용)
- **중요:** 모든 ChartSpec: `series: [{dataKey, label}]` 형식 사용 (`yAxis` 금지)
- `quality`, `product` 섹션은 쿼리 2개 → ChartSpec 2개 반환 (tables: [])
- 월간 필터: `dt >= date '${month}-01' AND dt < date '${month}-01' + interval '1' month`

---

## 생성 파일

| 파일 | 액션 |
| ---- | ---- |
| `frontend/src/lib/reportQueriesMonthly.ts` | 신규 생성 |
| `frontend/src/lib/__tests__/reportQueriesMonthly.test.ts` | 신규 생성 |

---

## 검증

```bash
cd frontend
npx jest src/lib/__tests__/reportQueriesMonthly.test.ts --no-coverage
# Expected: PASS (7 tests)
npx tsc --noEmit
```

---

## 수락 기준

- [ ] `buildMonthlySql("revenue", "2026-03")` 에 `interval '1' month` 포함
- [ ] `buildMonthlySql("quality", "2026-03")` 가 배열 2개 반환
- [ ] `convertMonthlyRows("quality", ...)` 가 charts 2개, tables 0개 반환
- [ ] 모든 ChartSpec에 `series` 필드 있음
- [ ] 테스트 PASS
````

---

### 7. `docs/tasks/DR-03/REPORT.md`

```markdown
# DR-03 Task Report

**Status:** TODO: DONE / BLOCKED

**Completed At:** <!-- ISO 8601 timestamp -->

---

## Acceptance Criteria

- [ ] Monthly SQL filter uses `interval '1' month` (partition-pruning safe)
- [ ] `quality` and `product` sections return 2 ChartSpecs each
- [ ] All ChartSpec objects use `series` not `yAxis`
- [ ] All tests PASS

---

## Files Changed

| File | Action | Lines |
| ---- | ------ | ----- |
| `frontend/src/lib/reportQueriesMonthly.ts` | Created | |
| `frontend/src/lib/__tests__/reportQueriesMonthly.test.ts` | Created | |

---

## Test Output

```bash
$ cd frontend && npx jest src/lib/__tests__/reportQueriesMonthly.test.ts --no-coverage
# paste output here
```

---

## Deviations from Plan

None.

---

## Questions for Reviewer

None.
```

---

### 8. `docs/tasks/DR-04/PROMPT.md`

````markdown
# DR-04: bedrockComment.ts — Bedrock Claude Haiku 코멘트 헬퍼

## 목적

`frontend/src/lib/bedrockComment.ts` 와 테스트를 신규 생성한다.

---

## 배경

- **구현 계획:** `docs/superpowers/plans/2026-03-11-daily-monthly-dashboard.md` — **Task 6** 을 정확히 따를 것
- 모델: `anthropic.claude-haiku-4-5-20251001`
- max_tokens: 200
- 에러 시 `""` 반환 (절대 throw 하지 않음)
- 테스트: `jest.mock("@aws-sdk/client-bedrock-runtime", ...)` 으로 에러→`""` 검증

---

## 생성 파일

| 파일 | 액션 |
| ---- | ---- |
| `frontend/src/lib/bedrockComment.ts` | 신규 생성 |
| `frontend/src/lib/__tests__/bedrockComment.test.ts` | 신규 생성 |

---

## 검증

```bash
cd frontend
npx jest src/lib/__tests__/bedrockComment.test.ts --no-coverage
# Expected: PASS (1 test — mock throws → returns "")
npx tsc --noEmit
```

---

## 수락 기준

- [ ] `generateComment()` 가 에러 시 `""` 반환 (throw 하지 않음)
- [ ] 모델 ID: `anthropic.claude-haiku-4-5-20251001`
- [ ] 테스트 PASS
````

---

### 9. `docs/tasks/DR-04/REPORT.md`

```markdown
# DR-04 Task Report

**Status:** TODO: DONE / BLOCKED

**Completed At:** <!-- ISO 8601 timestamp -->

---

## Acceptance Criteria

- [ ] `generateComment()` returns `""` on error (never throws)
- [ ] Model ID is `anthropic.claude-haiku-4-5-20251001`
- [ ] Test PASS

---

## Files Changed

| File | Action | Lines |
| ---- | ------ | ----- |
| `frontend/src/lib/bedrockComment.ts` | Created | |
| `frontend/src/lib/__tests__/bedrockComment.test.ts` | Created | |

---

## Test Output

```bash
$ cd frontend && npx jest src/lib/__tests__/bedrockComment.test.ts --no-coverage
# paste output here
```

---

## Deviations from Plan

None.

---

## Questions for Reviewer

None.
```

---

### 10. `docs/tasks/DR-05/PROMPT.md`

````markdown
# DR-05: reportS3.ts — S3 캐시 어댑터 + 핀 헬퍼

## 목적

`frontend/src/lib/reportS3.ts` 와 테스트를 신규 생성한다.

---

## 배경

- **구현 계획:** `docs/superpowers/plans/2026-03-11-daily-monthly-dashboard.md` — **Task 7** 을 정확히 따를 것
- 기존 `frontend/src/lib/sessionS3.ts` 의 `s3GetJson`, `s3PutJson` 재사용 (s3Delete 임포트 금지 — 미사용)
- S3 키 형식:
  - 일간: `reports/{sub}/daily/{yyyy-mm-dd}/{sectionId}.json`
  - 월간: `reports/{sub}/monthly/{yyyy-mm}/{sectionId}.json`
  - 핀: `reports/{sub}/pins.json`

---

## 생성 파일

| 파일 | 액션 |
| ---- | ---- |
| `frontend/src/lib/reportS3.ts` | 신규 생성 |
| `frontend/src/lib/__tests__/reportS3.test.ts` | 신규 생성 |

---

## 검증

```bash
cd frontend
npx jest src/lib/__tests__/reportS3.test.ts --no-coverage
# Expected: PASS (3 tests)
npx tsc --noEmit
```

---

## 수락 기준

- [ ] `s3Delete` 임포트 없음
- [ ] `reportSectionKey("user", "daily", "2026-03-11", "traffic")` = `"reports/user/daily/2026-03-11/traffic.json"`
- [ ] `reportPinsKey("user")` = `"reports/user/pins.json"`
- [ ] 테스트 PASS
````

---

### 11. `docs/tasks/DR-05/REPORT.md`

```markdown
# DR-05 Task Report

**Status:** TODO: DONE / BLOCKED

**Completed At:** <!-- ISO 8601 timestamp -->

---

## Acceptance Criteria

- [ ] No `s3Delete` import
- [ ] Key format matches spec exactly
- [ ] All tests PASS

---

## Files Changed

| File | Action | Lines |
| ---- | ------ | ----- |
| `frontend/src/lib/reportS3.ts` | Created | |
| `frontend/src/lib/__tests__/reportS3.test.ts` | Created | |

---

## Test Output

```bash
$ cd frontend && npx jest src/lib/__tests__/reportS3.test.ts --no-coverage
# paste output here
```

---

## Deviations from Plan

None.

---

## Questions for Reviewer

None.
```

---

### 12. `docs/tasks/DR-06/PROMPT.md`

````markdown
# DR-06: API Routes — /api/reports/daily + monthly + pins

## 목적

세 개의 Next.js API 라우트를 신규 생성한다.

---

## 배경

- **구현 계획:** `docs/superpowers/plans/2026-03-11-daily-monthly-dashboard.md` — **Task 8, Task 9, Task 10** 을 정확히 따를 것
- **전제 조건:** DR-01~05 완료
- 인증: `getUserSub(req)` from `@/lib/sessionAuth` (JWT 디코딩, 서명 미검증)
- 에러: 401 (미인증), 400 (잘못된 파라미터), 408 (Athena 타임아웃), 500 (내부 오류)
- `export const maxDuration = 60` (Athena 쿼리 타임아웃 허용)
- 핀 최대 12개 (`MAX_PINS`), 복합키 `(sectionId, period)` 로 upsert

---

## 생성 파일

| 파일 | 액션 |
| ---- | ---- |
| `frontend/src/app/api/reports/daily/route.ts` | 신규 생성 |
| `frontend/src/app/api/reports/monthly/route.ts` | 신규 생성 |
| `frontend/src/app/api/reports/pins/route.ts` | 신규 생성 |
| `frontend/src/app/api/reports/pins/[sectionId]/[period]/route.ts` | 신규 생성 |

---

## 검증

```bash
cd frontend
npx tsc --noEmit
# Expected: 에러 없음
```

---

## 수락 기준

- [ ] 4개 파일 생성됨
- [ ] daily route: `?date=YYYY-MM-DD` 검증, `?section=` 검증
- [ ] monthly route: `?date=YYYY-MM` 검증
- [ ] pins POST: 12개 초과 시 400 반환
- [ ] pins DELETE: `(sectionId, period)` 복합키로 삭제
- [ ] `npx tsc --noEmit` 에러 없음
````

---

### 13. `docs/tasks/DR-06/REPORT.md`

```markdown
# DR-06 Task Report

**Status:** TODO: DONE / BLOCKED

**Completed At:** <!-- ISO 8601 timestamp -->

---

## Acceptance Criteria

- [ ] 4 route files created
- [ ] Auth returns 401 on missing/invalid token
- [ ] Invalid params return 400
- [ ] Athena timeout returns 408
- [ ] Pin limit (12) enforced
- [ ] `npx tsc --noEmit` no errors

---

## Files Changed

| File | Action | Lines |
| ---- | ------ | ----- |
| `frontend/src/app/api/reports/daily/route.ts` | Created | |
| `frontend/src/app/api/reports/monthly/route.ts` | Created | |
| `frontend/src/app/api/reports/pins/route.ts` | Created | |
| `frontend/src/app/api/reports/pins/[sectionId]/[period]/route.ts` | Created | |

---

## Deviations from Plan

None.

---

## Questions for Reviewer

None.
```

---

### 14. `docs/tasks/DR-07/PROMPT.md`

````markdown
# DR-07: useReportSection hook + PinButton component

## 목적

`useReportSection.ts` 훅과 `PinButton.tsx` 컴포넌트를 신규 생성한다.

---

## 배경

- **구현 계획:** `docs/superpowers/plans/2026-03-11-daily-monthly-dashboard.md` — **Task 11, Task 12** 를 정확히 따를 것
- **전제 조건:** DR-01 완료 (types/report.ts)
- `useReportSection`: Bearer auth (`fetchAuthSession` → idToken), AbortController로 중복 요청 취소
- `PinButton`: POST `/api/reports/pins`, DELETE `/api/reports/pins/{sectionId}/{period}`
- `NEXT_PUBLIC_USE_MOCK_AUTH=true` 시 Bearer 토큰 없이 동작

---

## 생성 파일

| 파일 | 액션 |
| ---- | ---- |
| `frontend/src/hooks/useReportSection.ts` | 신규 생성 |
| `frontend/src/components/dashboard/PinButton.tsx` | 신규 생성 |

---

## 검증

```bash
cd frontend
npx tsc --noEmit
# Expected: 에러 없음
```

---

## 수락 기준

- [ ] `useReportSection` 훅 생성됨 (loading/frozen/error 상태 반환)
- [ ] `PinButton` 컴포넌트 생성됨 (핀/언핀 토글)
- [ ] `npx tsc --noEmit` 에러 없음
````

---

### 15. `docs/tasks/DR-07/REPORT.md`

```markdown
# DR-07 Task Report

**Status:** TODO: DONE / BLOCKED

**Completed At:** <!-- ISO 8601 timestamp -->

---

## Acceptance Criteria

- [ ] `useReportSection` hook with loading/frozen/error states
- [ ] `PinButton` with POST/DELETE toggle
- [ ] `npx tsc --noEmit` no errors

---

## Files Changed

| File | Action | Lines |
| ---- | ------ | ----- |
| `frontend/src/hooks/useReportSection.ts` | Created | |
| `frontend/src/components/dashboard/PinButton.tsx` | Created | |

---

## Deviations from Plan

None.

---

## Questions for Reviewer

None.
```

---

### 16. `docs/tasks/DR-08/PROMPT.md`

````markdown
# DR-08: ReportLineChart + ReportSection components

## 목적

`ReportLineChart.tsx` (신규)와 `ReportSection.tsx` (신규)를 생성한다.

---

## 배경

- **구현 계획:** `docs/superpowers/plans/2026-03-11-daily-monthly-dashboard.md` — **Task 12a, Task 13** 을 정확히 따를 것
- **전제 조건:** DR-01, DR-07 완료
- `ReportLineChart.tsx` 위치: `frontend/src/components/report/`
  - **중요:** `chartTheme`는 `../dashboard/chartTheme` 에서 import (상대 경로)
  - `TrendLineChart.tsx`는 fixed props라 재사용 불가 → 새로 생성
- `ReportSection.tsx` 위치: `frontend/src/components/dashboard/`
  - 테이블 렌더링: `DataTable` from `@/components/report/DataTable` (rows 직접 전달)
  - `DashboardCardTable` 사용 금지 (ExcelColumn[] 호환 안됨)
  - chart.chartType === "line" → `<ReportLineChart>`, 나머지 → `<ReportBarChart>`

---

## 생성 파일

| 파일 | 액션 |
| ---- | ---- |
| `frontend/src/components/report/ReportLineChart.tsx` | 신규 생성 |
| `frontend/src/components/dashboard/ReportSection.tsx` | 신규 생성 |

---

## 검증

```bash
cd frontend
npx tsc --noEmit
# Expected: 에러 없음
```

---

## 수락 기준

- [ ] `ReportLineChart.tsx` 생성됨 — `../dashboard/chartTheme` import
- [ ] `ReportSection.tsx` 생성됨 — `DataTable` 사용, `DashboardCardTable` 없음
- [ ] chart type 분기: line → ReportLineChart, bar → ReportBarChart
- [ ] frozen badge, comment, PinButton 포함
- [ ] `npx tsc --noEmit` 에러 없음
````

---

### 17. `docs/tasks/DR-08/REPORT.md`

```markdown
# DR-08 Task Report

**Status:** TODO: DONE / BLOCKED

**Completed At:** <!-- ISO 8601 timestamp -->

---

## Acceptance Criteria

- [ ] `ReportLineChart.tsx` created with `../dashboard/chartTheme` import
- [ ] `ReportSection.tsx` uses `DataTable` not `DashboardCardTable`
- [ ] Chart type routing: line → ReportLineChart, bar → ReportBarChart
- [ ] `npx tsc --noEmit` no errors

---

## Files Changed

| File | Action | Lines |
| ---- | ------ | ----- |
| `frontend/src/components/report/ReportLineChart.tsx` | Created | |
| `frontend/src/components/dashboard/ReportSection.tsx` | Created | |

---

## Deviations from Plan

None.

---

## Questions for Reviewer

None.
```

---

### 18. `docs/tasks/DR-09/PROMPT.md`

````markdown
# DR-09: DailyReport + MonthlyReport + CustomDashboard 페이지

## 목적

세 개의 페이지 컴포넌트를 신규 생성한다.

---

## 배경

- **구현 계획:** `docs/superpowers/plans/2026-03-11-daily-monthly-dashboard.md` — **Task 14, Task 15** 를 정확히 따를 것
- **전제 조건:** DR-01~08 완료
- **중요 임포트:**
  - `DAILY_SECTION_IDS` → `@/types/report` (NOT `@/lib/reportQueriesDaily`)
  - `MONTHLY_SECTION_IDS` → `@/types/report` (NOT `@/lib/reportQueriesMonthly`)
  - `DAILY_SECTION_TITLES`, `MONTHLY_SECTION_TITLES` → 각각 `reportQueriesDaily`, `reportQueriesMonthly`
- `CustomDashboard.tsx`: `PinnedWeeklySection` 은 캐시 JSON 에서 `sections[].comment` 만 읽어 표시
- 핀 없을 때 빈 상태 메시지 표시

---

## 생성 파일

| 파일 | 액션 |
| ---- | ---- |
| `frontend/src/app/(app)/dashboard/DailyReport.tsx` | 신규 생성 |
| `frontend/src/app/(app)/dashboard/MonthlyReport.tsx` | 신규 생성 |
| `frontend/src/app/(app)/dashboard/CustomDashboard.tsx` | 신규 생성 |

---

## 검증

```bash
cd frontend
npx tsc --noEmit
```

---

## 수락 기준

- [ ] `DailyReport.tsx` — date picker + 5개 섹션 그리드
- [ ] `MonthlyReport.tsx` — month picker + 6개 섹션 그리드
- [ ] `CustomDashboard.tsx` — 일/주/월 피커 + 핀된 섹션 렌더링
- [ ] `DAILY_SECTION_IDS` import from `@/types/report`
- [ ] `PinnedWeeklySection` 캐시에서 comment 로드
- [ ] `npx tsc --noEmit` 에러 없음
````

---

### 19. `docs/tasks/DR-09/REPORT.md`

```markdown
# DR-09 Task Report

**Status:** TODO: DONE / BLOCKED

**Completed At:** <!-- ISO 8601 timestamp -->

---

## Acceptance Criteria

- [ ] `DailyReport.tsx` created with date picker
- [ ] `MonthlyReport.tsx` created with month picker
- [ ] `CustomDashboard.tsx` created with weekly comment-only sections
- [ ] `DAILY/MONTHLY_SECTION_IDS` imported from `@/types/report`
- [ ] `npx tsc --noEmit` no errors

---

## Files Changed

| File | Action | Lines |
| ---- | ------ | ----- |
| `frontend/src/app/(app)/dashboard/DailyReport.tsx` | Created | |
| `frontend/src/app/(app)/dashboard/MonthlyReport.tsx` | Created | |
| `frontend/src/app/(app)/dashboard/CustomDashboard.tsx` | Created | |

---

## Deviations from Plan

None.

---

## Questions for Reviewer

None.
```

---

### 20. `docs/tasks/DR-10/PROMPT.md`

````markdown
# DR-10: dashboard/page.tsx 기간 탭 라우팅

## 목적

기존 `frontend/src/app/(app)/dashboard/page.tsx` 를 수정하여 일간/월간/커스텀 탭을 추가한다.

---

## 배경

- **구현 계획:** `docs/superpowers/plans/2026-03-11-daily-monthly-dashboard.md` — **Task 16** 을 정확히 따를 것
- **전제 조건:** DR-09 완료
- **중요:** 기존 주간 대시보드 JSX를 `WeeklyContent` 서브컴포넌트로 추출 (기존 로직 유지)
- `useSearchParams`, `useRouter` 로 `?period=` URL 파라미터 기반 탭 전환
- 탭: 주간(기본), 일간, 월간, 커스텀

---

## 수정 파일

| 파일 | 액션 |
| ---- | ---- |
| `frontend/src/app/(app)/dashboard/page.tsx` | 수정 |

---

## 검증

```bash
cd frontend
npx tsc --noEmit
```

---

## 수락 기준

- [ ] 4개 탭 바 추가됨 (주간/일간/월간/커스텀)
- [ ] `?period=weekly` (기본) 시 기존 주간 대시보드 표시
- [ ] `?period=daily` → `<DailyReport />`
- [ ] `?period=monthly` → `<MonthlyReport />`
- [ ] `?period=custom` → `<CustomDashboard />`
- [ ] 기존 주간 로직 유지 (`WeeklyContent` 서브컴포넌트)
- [ ] `npx tsc --noEmit` 에러 없음
````

---

### 21. `docs/tasks/DR-10/REPORT.md`

```markdown
# DR-10 Task Report

**Status:** TODO: DONE / BLOCKED

**Completed At:** <!-- ISO 8601 timestamp -->

---

## Acceptance Criteria

- [ ] 4-tab navigation bar added
- [ ] Weekly content preserved in `WeeklyContent` sub-component
- [ ] Daily/Monthly/Custom routing works via `?period=` param
- [ ] `npx tsc --noEmit` no errors

---

## Files Changed

| File | Action | Lines |
| ---- | ------ | ----- |
| `frontend/src/app/(app)/dashboard/page.tsx` | Modified | |

---

## Deviations from Plan

None.

---

## Questions for Reviewer

None.
```

---

### 22. `docs/tasks/DR-11/PROMPT.md`

````markdown
# DR-11: precompute_dashboard.py Bedrock 코멘트 + 주간 렌더링

## 목적

`backend/scripts/precompute_dashboard.py` 를 수정하여 Bedrock 섹션 코멘트를 추가하고, `frontend/src/hooks/useDashboardCache.ts` 및 `frontend/src/components/dashboard/DashboardCardView.tsx` 에 코멘트 렌더링을 추가한다.

---

## 배경

- **구현 계획:** `docs/superpowers/plans/2026-03-11-daily-monthly-dashboard.md` — **Task 17, Task 18** 을 정확히 따를 것
- **전제 조건:** DR-10 완료
- Python 수정: 기존 코드 대체 금지 — `get_bedrock_comment()`, `group_queries_into_sections()`, `WEEKLY_SECTION_GROUPS` 상수 추가만
- `compute_week()` 마지막에 `result["sections"] = group_queries_into_sections(result)` 추가
- 섹션→카드 매핑: acquisition→channelShare/trend, revenue→channelRevenue, installs→campaignInstalls, engagement→conversionByChannel, retention→retention/installFunnel

---

## 수정 파일

| 파일 | 액션 |
| ---- | ---- |
| `backend/scripts/precompute_dashboard.py` | 수정 (추가만) |
| `backend/scripts/tests/test_precompute_comments.py` | 신규 생성 |
| `frontend/src/hooks/useDashboardCache.ts` | 수정 |
| `frontend/src/components/dashboard/DashboardCardView.tsx` | 수정 |
| `frontend/src/app/(app)/dashboard/page.tsx` | 수정 |

---

## 검증

```bash
cd backend/scripts
python -m pytest tests/test_precompute_comments.py -v
# Expected: PASS (3 tests)

cd frontend
npx tsc --noEmit
```

---

## 수락 기준

- [ ] `get_bedrock_comment()` 에러 시 `""` 반환
- [ ] `group_queries_into_sections()` 5개 섹션 반환
- [ ] Python 테스트 PASS (3 tests)
- [ ] `DashboardCardView` 에 `comment?: string` prop 추가됨
- [ ] `sectionComments` 맵으로 카드에 코멘트 전달
- [ ] `npx tsc --noEmit` 에러 없음
````

---

### 23. `docs/tasks/DR-11/REPORT.md`

```markdown
# DR-11 Task Report

**Status:** TODO: DONE / BLOCKED

**Completed At:** <!-- ISO 8601 timestamp -->

---

## Acceptance Criteria

- [ ] `get_bedrock_comment()` returns `""` on error
- [ ] `group_queries_into_sections()` returns 5 sections
- [ ] Python tests PASS (3 tests)
- [ ] `DashboardCardView` has `comment?: string` prop
- [ ] Weekly section comments visible in dashboard
- [ ] `npx tsc --noEmit` no errors

---

## Files Changed

| File | Action | Lines |
| ---- | ------ | ----- |
| `backend/scripts/precompute_dashboard.py` | Modified | |
| `backend/scripts/tests/test_precompute_comments.py` | Created | |
| `frontend/src/hooks/useDashboardCache.ts` | Modified | |
| `frontend/src/components/dashboard/DashboardCardView.tsx` | Modified | |
| `frontend/src/app/(app)/dashboard/page.tsx` | Modified | |

---

## Deviations from Plan

None.

---

## Questions for Reviewer

None.
```

---

## 검증

```bash
ls docs/tasks/DR-01/
ls docs/tasks/DR-11/
python -m json.tool docs/tasks/status.json
```

모두 존재하면 완료.

## 완료 후 할 일

```bash
git add docs/tasks/
git commit -m "chore(tasks): add DR task management infrastructure (DR-00)"
```
