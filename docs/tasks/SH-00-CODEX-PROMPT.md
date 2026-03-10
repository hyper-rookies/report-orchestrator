# Task SH-00: 리뷰 인프라 구축 (Share & PDF Export Task Setup)

## 목적

코드를 작성하지 않는다. SH-01~SH-06 태스크의 구현 프롬프트와 리뷰 템플릿을 `docs/tasks/` 폴더에 생성하고, `docs/tasks/status.json`에 SH 태스크들을 추가한다.

---

## 배경 (최소 컨텍스트)

- **계획 문서:** `docs/plans/2026-03-09-share-pdf-export.md` — 반드시 읽고 시작할 것
- **프로젝트:** `report-orchestrator` — Next.js 프론트엔드(TypeScript, `npx tsc --noEmit`)
- **목표:** 대시보드에 7일 만료 공유 링크(단축 URL)와 PDF 저장 기능 추가
- **전제 조건:** SC-04 완료 후 진행 (`useDashboardCache.ts` + 정적 JSON 캐시 존재)
- **경고:** Windows 환경. 경로 구분자는 `/` 사용.

---

## 작업 내용

아래 파일들을 생성하라.

### 생성할 파일 목록

```
docs/tasks/
├── status.json              ← SH-01~06 항목 추가 (기존 DA-*, SC-* 항목 유지)
├── SH-01/
│   ├── PROMPT.md
│   └── REPORT.md
├── SH-02/
│   ├── PROMPT.md
│   └── REPORT.md
├── SH-03/
│   ├── PROMPT.md
│   └── REPORT.md
├── SH-04/
│   ├── PROMPT.md
│   └── REPORT.md
├── SH-05/
│   ├── PROMPT.md
│   └── REPORT.md
└── SH-06/
    ├── PROMPT.md
    └── REPORT.md
```

---

## 파일 내용

### 1. `docs/tasks/status.json` 업데이트

기존 DA-*, SC-* 항목은 그대로 두고 SH-* 항목을 추가한다:

```json
{
  "_note": "Codex: 태스크 완료 시 status를 'done'으로, 막히면 'blocked'로 변경하라.",
  "tasks": {
    "DA-01": { "status": "done", "title": "WeekSelector + ChannelRevenueChart 컴포넌트", "completedAt": "2026-03-09T11:21:01.0417894+09:00" },
    "DA-02": { "status": "done", "title": "ConversionChart + CampaignInstallsChart 컴포넌트", "completedAt": "2026-03-09T11:26:01.0020914+09:00" },
    "DA-03": { "status": "done", "title": "InstallFunnelChart + RetentionCohortChart 컴포넌트", "completedAt": "2026-03-09T11:27:00.9975318+09:00" },
    "DA-04": { "status": "done", "title": "useDashboardData.ts 확장", "completedAt": "2026-03-09T11:50:53.4476329+09:00" },
    "DA-05": { "status": "done", "title": "dashboard/page.tsx 통합", "completedAt": "2026-03-09T12:00:29.5166741+09:00" },
    "SC-01": { "status": "done", "title": "dashboard_queries.py SQL 모듈 + pytest", "completedAt": "2026-03-09T14:46:21.4831223+09:00" },
    "SC-02": { "status": "done", "title": "precompute_dashboard.py Athena 실행 + pytest", "completedAt": "2026-03-09T15:01:53.5538293+09:00" },
    "SC-03": { "status": "pending", "title": "스크립트 실행 → 5개 JSON + manifest 생성", "completedAt": null },
    "SC-04": { "status": "pending", "title": "useDashboardCache.ts + page.tsx manifest 방식 교체", "completedAt": null },
    "SC-05": { "status": "pending", "title": "REPORT.md 작성", "completedAt": null },
    "SH-01": { "status": "pending", "title": "JWT sign/verify + 단축코드 스토어", "completedAt": null },
    "SH-02": { "status": "pending", "title": "POST /api/share + GET /api/share/[code] 라우트", "completedAt": null },
    "SH-03": { "status": "pending", "title": "공유 대시보드 페이지 (로그인 불필요)", "completedAt": null },
    "SH-04": { "status": "pending", "title": "ShareButton 컴포넌트 (모달 + 만료 안내 + 복사)", "completedAt": null },
    "SH-05": { "status": "pending", "title": "PdfExportButton 컴포넌트 (html2canvas + jspdf)", "completedAt": null },
    "SH-06": { "status": "pending", "title": "dashboard/page.tsx에 ShareButton + PdfExportButton 연결", "completedAt": null }
  }
}
```

---

### 2. `docs/tasks/SH-01/PROMPT.md`

```markdown
# SH-01: JWT sign/verify + 단축코드 스토어

**전제 조건:** SC-04가 `docs/tasks/status.json`에서 `"done"` 상태여야 한다.

## 작업 개요

`frontend/src/lib/shareToken.ts`와 `frontend/src/lib/shareCodeStore.ts`를 생성한다.
**다른 파일은 수정하지 않는다.**

## 사전 작업: 의존성 설치

```bash
cd frontend
npm install jose nanoid
```

## 생성할 파일

- `frontend/src/lib/shareToken.ts`
- `frontend/src/lib/shareCodeStore.ts`

## 환경 변수 추가

`frontend/.env.local`에 추가 (파일이 없으면 생성):

```
SHARE_TOKEN_SECRET=change-me-to-a-32-char-or-longer-secret
```

`frontend/.env.example`에도 추가 (커밋용):

```
SHARE_TOKEN_SECRET=
```

---

## 구현 코드

### `frontend/src/lib/shareToken.ts`

```typescript
import { SignJWT, jwtVerify } from "jose";

const SHARE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7일

function getSecret(): Uint8Array {
  const secret = process.env.SHARE_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SHARE_TOKEN_SECRET must be set and at least 32 characters.");
  }
  return new TextEncoder().encode(secret);
}

export interface ShareTokenPayload {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
}

export async function signShareToken(payload: ShareTokenPayload): Promise<string> {
  return new SignJWT({ s: payload.weekStart, e: payload.weekEnd, l: payload.weekLabel })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${SHARE_TTL_SECONDS}s`)
    .setIssuedAt()
    .sign(getSecret());
}

export async function verifyShareToken(token: string): Promise<ShareTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (
      typeof payload.s !== "string" ||
      typeof payload.e !== "string" ||
      typeof payload.l !== "string"
    ) return null;
    return { weekStart: payload.s, weekEnd: payload.e, weekLabel: payload.l };
  } catch {
    return null;
  }
}

export function getExpiresAt(): Date {
  return new Date(Date.now() + SHARE_TTL_SECONDS * 1000);
}
```

### `frontend/src/lib/shareCodeStore.ts`

```typescript
import { nanoid } from "nanoid";

interface ShareEntry {
  jwt: string;
  expiresAt: number; // Unix seconds
}

// 서버 싱글턴 (Next.js 서버 프로세스 전역)
declare global {
  // eslint-disable-next-line no-var
  var __shareCodeStore: Map<string, ShareEntry> | undefined;
}

function getStore(): Map<string, ShareEntry> {
  if (!global.__shareCodeStore) {
    global.__shareCodeStore = new Map();
  }
  return global.__shareCodeStore;
}

export function createCode(jwt: string, expiresAt: Date): string {
  const store = getStore();
  const code = nanoid(8); // aB3xY7qZ 형태
  store.set(code, { jwt, expiresAt: Math.floor(expiresAt.getTime() / 1000) });
  // 만료된 항목 정리 (코드 생성 시마다 스캔)
  const now = Math.floor(Date.now() / 1000);
  for (const [k, v] of store.entries()) {
    if (v.expiresAt < now) store.delete(k);
  }
  return code;
}

export function resolveCode(code: string): string | null {
  const store = getStore();
  const entry = store.get(code);
  if (!entry) return null;
  if (Math.floor(Date.now() / 1000) > entry.expiresAt) {
    store.delete(code);
    return null;
  }
  return entry.jwt;
}
```

---

## 검증 명령

```bash
cd frontend && npx tsc --noEmit
```

Expected: 오류 없음 (exit code 0)

## 수락 기준

- [ ] `frontend/src/lib/shareToken.ts` 생성됨
- [ ] `frontend/src/lib/shareCodeStore.ts` 생성됨
- [ ] `signShareToken` / `verifyShareToken` / `getExpiresAt` export됨
- [ ] `createCode` / `resolveCode` export됨
- [ ] `SHARE_TOKEN_SECRET` 미설정 시 `Error` throw
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

## 완료 후 할 일

1. `docs/tasks/SH-01/REPORT.md` 채우기
2. `docs/tasks/status.json`에서 SH-01 status → `"done"` 또는 `"blocked"`
3. `git add frontend/src/lib/shareToken.ts frontend/src/lib/shareCodeStore.ts frontend/.env.example docs/tasks/SH-01/REPORT.md docs/tasks/status.json`
4. `git commit -m "feat(share): add JWT sign/verify and short code store (SH-01)"`
```

---

### 3. `docs/tasks/SH-01/REPORT.md`

```markdown
# SH-01 Task Report

**Status:** IN_PROGRESS | DONE | BLOCKED

**Completed At:** (ISO timestamp)

---

## Acceptance Criteria

- [ ] `frontend/src/lib/shareToken.ts` 생성됨
- [ ] `frontend/src/lib/shareCodeStore.ts` 생성됨
- [ ] `signShareToken` / `verifyShareToken` / `getExpiresAt` export됨
- [ ] `createCode` / `resolveCode` export됨
- [ ] `SHARE_TOKEN_SECRET` 미설정 시 `Error` throw
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `frontend/src/lib/shareToken.ts` | Created | ? |
| `frontend/src/lib/shareCodeStore.ts` | Created | ? |
| `frontend/.env.example` | Modified | ? |

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

### 4. `docs/tasks/SH-02/PROMPT.md`

```markdown
# SH-02: POST /api/share + GET /api/share/[code] 라우트

**전제 조건:** SH-01이 `docs/tasks/status.json`에서 `"done"` 상태여야 한다.

## 작업 개요

`frontend/src/app/api/share/route.ts`와 `frontend/src/app/api/share/[code]/route.ts`를 생성한다.
**다른 파일은 수정하지 않는다.**

## 생성할 파일

- `frontend/src/app/api/share/route.ts`
- `frontend/src/app/api/share/[code]/route.ts`

---

## 구현 코드

### `frontend/src/app/api/share/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { signShareToken, getExpiresAt } from "@/lib/shareToken";
import { createCode } from "@/lib/shareCodeStore";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { weekStart, weekEnd, weekLabel } = body as {
    weekStart?: unknown;
    weekEnd?: unknown;
    weekLabel?: unknown;
  };

  if (
    typeof weekStart !== "string" ||
    typeof weekEnd !== "string" ||
    typeof weekLabel !== "string"
  ) {
    return NextResponse.json(
      { error: "weekStart, weekEnd, weekLabel are required strings" },
      { status: 400 }
    );
  }

  const expiresAt = getExpiresAt();
  const jwt = await signShareToken({ weekStart, weekEnd, weekLabel });
  const code = createCode(jwt, expiresAt);

  const origin = req.headers.get("origin") ?? req.nextUrl.origin;
  const shareUrl = `${origin}/share/${code}`;

  return NextResponse.json({
    code,
    url: shareUrl,
    expiresAt: expiresAt.toISOString(),
  });
}
```

### `frontend/src/app/api/share/[code]/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { verifyShareToken } from "@/lib/shareToken";
import { resolveCode } from "@/lib/shareCodeStore";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
): Promise<NextResponse> {
  const { code } = await params;
  const jwt = resolveCode(code);
  if (!jwt) {
    return NextResponse.json(
      { error: "Share link not found or expired." },
      { status: 404 }
    );
  }
  const payload = await verifyShareToken(jwt);
  if (!payload) {
    return NextResponse.json(
      { error: "Share token is invalid or expired." },
      { status: 410 }
    );
  }
  return NextResponse.json(payload);
}
```

---

## 검증 명령

```bash
cd frontend && npx tsc --noEmit
```

Expected: 오류 없음 (exit code 0)

## 수락 기준

- [ ] `frontend/src/app/api/share/route.ts` 생성됨 (POST 핸들러)
- [ ] `frontend/src/app/api/share/[code]/route.ts` 생성됨 (GET 핸들러)
- [ ] POST: `weekStart`, `weekEnd`, `weekLabel` 누락 시 400 반환
- [ ] GET: 코드 없거나 만료 시 404, JWT 만료 시 410 반환
- [ ] GET: 정상 시 `{ weekStart, weekEnd, weekLabel }` 반환
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

## 완료 후 할 일

1. `docs/tasks/SH-02/REPORT.md` 채우기
2. `docs/tasks/status.json`에서 SH-02 status → `"done"` 또는 `"blocked"`
3. `git add frontend/src/app/api/share/route.ts "frontend/src/app/api/share/[code]/route.ts" docs/tasks/SH-02/REPORT.md docs/tasks/status.json`
4. `git commit -m "feat(share): add POST /api/share and GET /api/share/[code] routes (SH-02)"`
```

---

### 5. `docs/tasks/SH-02/REPORT.md`

```markdown
# SH-02 Task Report

**Status:** IN_PROGRESS | DONE | BLOCKED

**Completed At:** (ISO timestamp)

---

## Acceptance Criteria

- [ ] `frontend/src/app/api/share/route.ts` 생성됨 (POST 핸들러)
- [ ] `frontend/src/app/api/share/[code]/route.ts` 생성됨 (GET 핸들러)
- [ ] POST: `weekStart`, `weekEnd`, `weekLabel` 누락 시 400 반환
- [ ] GET: 코드 없거나 만료 시 404, JWT 만료 시 410 반환
- [ ] GET: 정상 시 `{ weekStart, weekEnd, weekLabel }` 반환
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `frontend/src/app/api/share/route.ts` | Created | ? |
| `frontend/src/app/api/share/[code]/route.ts` | Created | ? |

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

### 6. `docs/tasks/SH-03/PROMPT.md`

```markdown
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

---

### 7. `docs/tasks/SH-03/REPORT.md`

```markdown
# SH-03 Task Report

**Status:** IN_PROGRESS | DONE | BLOCKED

**Completed At:** (ISO timestamp)

---

## Acceptance Criteria

- [ ] `frontend/src/app/share/[code]/page.tsx` 생성됨
- [ ] `(app)` 그룹 밖 (`app/share/` 경로) — 사이드바 없음 확인
- [ ] 로딩 중 / 오류 / 정상 세 가지 상태 처리
- [ ] 만료 안내 문구 (`⚠️ 이 링크는 ... 만료됩니다.`) 존재
- [ ] `useDashboardCache` 사용 (Bedrock 호출 없음)
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `frontend/src/app/share/[code]/page.tsx` | Created | ? |

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

### 8. `docs/tasks/SH-04/PROMPT.md`

```markdown
# SH-04: ShareButton 컴포넌트

**전제 조건:** SH-02가 `"done"` 상태여야 한다 (POST /api/share 존재).

## 작업 개요

`frontend/src/components/dashboard/ShareButton.tsx`를 생성한다.
**다른 파일은 수정하지 않는다.**

## 생성할 파일

- `frontend/src/components/dashboard/ShareButton.tsx`

---

## 구현 코드

### `frontend/src/components/dashboard/ShareButton.tsx`

```tsx
"use client";

import { useState } from "react";
import { Share2, Copy, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WeekRange } from "@/components/dashboard/WeekSelector";

interface ShareButtonProps {
  selectedRange: WeekRange;
}

type ShareState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; url: string; expiresAt: string }
  | { status: "error"; message: string };

export default function ShareButton({ selectedRange }: ShareButtonProps) {
  const [state, setState] = useState<ShareState>({ status: "idle" });
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const handleShare = async () => {
    if (state.status === "done") {
      setOpen(true);
      return;
    }
    setState({ status: "loading" });
    setOpen(true);
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart: selectedRange.start,
          weekEnd: selectedRange.end,
          weekLabel: selectedRange.label,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { url: string; expiresAt: string };
      setState({ status: "done", url: data.url, expiresAt: data.expiresAt });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "공유 링크 생성 실패",
      });
    }
  };

  const handleCopy = async () => {
    if (state.status !== "done") return;
    await navigator.clipboard.writeText(state.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const expiresLabel =
    state.status === "done"
      ? (() => {
          const d = new Date(state.expiresAt);
          return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
        })()
      : "";

  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={handleShare} className="gap-1.5">
        <Share2 className="h-3.5 w-3.5" />
        공유
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border bg-card p-4 shadow-lg space-y-3">
          <button
            onClick={() => setOpen(false)}
            className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>

          <p className="text-sm font-semibold">링크 공유</p>

          {state.status === "loading" && (
            <p className="text-sm text-muted-foreground">링크 생성 중...</p>
          )}

          {state.status === "error" && (
            <p className="text-sm text-destructive">{state.message}</p>
          )}

          {state.status === "done" && (
            <>
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  ⚠️ 이 링크는 <strong>{expiresLabel}</strong>에 만료됩니다 (7일).
                  <br />
                  로그인 없이 누구나 조회할 수 있습니다.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={state.url}
                  className="flex-1 rounded-md border bg-muted px-2 py-1 text-xs font-mono text-muted-foreground select-all"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
              {copied && (
                <p className="text-xs text-green-600 text-right">링크가 복사됐습니다!</p>
              )}
            </>
          )}
        </div>
      )}
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

- [ ] `frontend/src/components/dashboard/ShareButton.tsx` 생성됨
- [ ] `ShareButtonProps` → `selectedRange: WeekRange` prop 존재
- [ ] 모달: 로딩 / 오류 / 완료 세 상태 처리
- [ ] 완료 상태: 만료일 표시 (`⚠️ 이 링크는 <날짜>에 만료됩니다 (7일).`)
- [ ] 완료 상태: URL 인풋 + 복사 버튼 (복사 후 2초간 Check 아이콘)
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

## 완료 후 할 일

1. `docs/tasks/SH-04/REPORT.md` 채우기
2. `docs/tasks/status.json`에서 SH-04 status → `"done"` 또는 `"blocked"`
3. `git add frontend/src/components/dashboard/ShareButton.tsx docs/tasks/SH-04/REPORT.md docs/tasks/status.json`
4. `git commit -m "feat(share): add ShareButton with expiry notice and copy link (SH-04)"`
```

---

### 9. `docs/tasks/SH-04/REPORT.md`

```markdown
# SH-04 Task Report

**Status:** IN_PROGRESS | DONE | BLOCKED

**Completed At:** (ISO timestamp)

---

## Acceptance Criteria

- [ ] `frontend/src/components/dashboard/ShareButton.tsx` 생성됨
- [ ] `ShareButtonProps` → `selectedRange: WeekRange` prop 존재
- [ ] 모달: 로딩 / 오류 / 완료 세 상태 처리
- [ ] 완료 상태: 만료일 표시 (`⚠️ 이 링크는 <날짜>에 만료됩니다 (7일).`)
- [ ] 완료 상태: URL 인풋 + 복사 버튼 (복사 후 2초간 Check 아이콘)
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `frontend/src/components/dashboard/ShareButton.tsx` | Created | ? |

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

### 10. `docs/tasks/SH-05/PROMPT.md`

```markdown
# SH-05: PdfExportButton 컴포넌트

**전제 조건:** SH-01이 `"done"` 상태여야 한다 (독립적이지만 SH 시리즈 순서 유지).

## 작업 개요

`frontend/src/components/dashboard/PdfExportButton.tsx`를 생성한다.
**다른 파일은 수정하지 않는다.**

## 사전 작업: 의존성 설치

```bash
cd frontend
npm install html2canvas jspdf
```

## 생성할 파일

- `frontend/src/components/dashboard/PdfExportButton.tsx`

---

## 구현 코드

### `frontend/src/components/dashboard/PdfExportButton.tsx`

```tsx
"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PdfExportButtonProps {
  targetId: string;   // 캡처할 DOM 요소의 id
  filename?: string;
}

export default function PdfExportButton({
  targetId,
  filename = "dashboard.pdf",
}: PdfExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const element = document.getElementById(targetId);
      if (!element) throw new Error(`Element #${targetId} not found`);

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: getComputedStyle(document.documentElement)
          .getPropertyValue("--background") || "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: canvas.width > canvas.height ? "landscape" : "portrait",
        unit: "px",
        format: [canvas.width / 2, canvas.height / 2],
      });

      pdf.addImage(imgData, "PNG", 0, 0, canvas.width / 2, canvas.height / 2);
      pdf.save(filename);
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={exporting}
      className="gap-1.5"
    >
      <Download className="h-3.5 w-3.5" />
      {exporting ? "저장 중..." : "PDF 저장"}
    </Button>
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

- [ ] `frontend/src/components/dashboard/PdfExportButton.tsx` 생성됨
- [ ] `html2canvas`와 `jspdf`를 동적 import (`Promise.all`)로 사용
- [ ] `targetId` prop으로 캡처 대상 DOM id를 받음
- [ ] `exporting` 상태: 버튼 disabled + "저장 중..." 텍스트
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

## 완료 후 할 일

1. `docs/tasks/SH-05/REPORT.md` 채우기
2. `docs/tasks/status.json`에서 SH-05 status → `"done"` 또는 `"blocked"`
3. `git add frontend/src/components/dashboard/PdfExportButton.tsx docs/tasks/SH-05/REPORT.md docs/tasks/status.json`
4. `git commit -m "feat(dashboard): add PdfExportButton with html2canvas (SH-05)"`
```

---

### 11. `docs/tasks/SH-05/REPORT.md`

```markdown
# SH-05 Task Report

**Status:** IN_PROGRESS | DONE | BLOCKED

**Completed At:** (ISO timestamp)

---

## Acceptance Criteria

- [ ] `frontend/src/components/dashboard/PdfExportButton.tsx` 생성됨
- [ ] `html2canvas`와 `jspdf`를 동적 import (`Promise.all`)로 사용
- [ ] `targetId` prop으로 캡처 대상 DOM id를 받음
- [ ] `exporting` 상태: 버튼 disabled + "저장 중..." 텍스트
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `frontend/src/components/dashboard/PdfExportButton.tsx` | Created | ? |

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

### 12. `docs/tasks/SH-06/PROMPT.md`

```markdown
# SH-06: dashboard/page.tsx에 ShareButton + PdfExportButton 연결

**전제 조건:** SH-04와 SH-05가 모두 `"done"` 상태여야 한다. SC-04도 `"done"`이어야 한다.

## 작업 개요

`frontend/src/app/(app)/dashboard/page.tsx`를 수정해 ShareButton과 PdfExportButton을 헤더에 추가한다.

## 수정할 파일

- `frontend/src/app/(app)/dashboard/page.tsx`

---

## 수정 내용

### 1. import 추가

파일 상단 import 목록에 추가:

```typescript
import ShareButton from "@/components/dashboard/ShareButton";
import PdfExportButton from "@/components/dashboard/PdfExportButton";
```

### 2. 대시보드 루트 `div`에 id 추가 (PDF 캡처 대상)

```tsx
// 기존
<div className="mx-auto w-full max-w-6xl space-y-6">

// 변경
<div id="dashboard-content" className="mx-auto w-full max-w-6xl space-y-6">
```

### 3. 헤더 영역: WeekSelector를 감싸는 flex 컨테이너 + 버튼 추가

```tsx
// 기존 (WeekSelector 단독)
<WeekSelector
  weeks={weeks}
  selectedIndex={selectedWeekIndex}
  onChange={(index) => {
    setSelectedWeekIndex(Math.min(Math.max(index, 0), weeks.length - 1));
  }}
/>

// 변경 (flex 컨테이너로 감싸고 버튼 추가)
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
```

**주의:** 기존에 `weeks.length > 0` 조건이 WeekSelector 바깥에 있다면 안으로 이동하거나 조건부 렌더링 구조에 맞게 조정한다.

---

## 검증 명령

```bash
cd frontend && npx tsc --noEmit
```

Expected: 오류 없음 (exit code 0)

## 수락 기준

- [ ] `ShareButton` import 추가됨
- [ ] `PdfExportButton` import 추가됨
- [ ] `id="dashboard-content"` 가 max-w-6xl div에 추가됨
- [ ] `selectedRange.start &&` 조건으로 두 버튼 조건부 렌더링
- [ ] `PdfExportButton`의 `filename` prop에 주차 날짜 포함됨
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

## 완료 후 할 일

1. `docs/tasks/SH-06/REPORT.md` 채우기
2. `docs/tasks/status.json`에서 SH-06 status → `"done"` 또는 `"blocked"`
3. `git add "frontend/src/app/(app)/dashboard/page.tsx" docs/tasks/SH-06/REPORT.md docs/tasks/status.json`
4. `git commit -m "feat(dashboard): wire ShareButton and PdfExportButton into header (SH-06)"`
```

---

### 13. `docs/tasks/SH-06/REPORT.md`

```markdown
# SH-06 Task Report

**Status:** IN_PROGRESS | DONE | BLOCKED

**Completed At:** (ISO timestamp)

---

## Acceptance Criteria

- [ ] `ShareButton` import 추가됨
- [ ] `PdfExportButton` import 추가됨
- [ ] `id="dashboard-content"` 가 max-w-6xl div에 추가됨
- [ ] `selectedRange.start &&` 조건으로 두 버튼 조건부 렌더링
- [ ] `PdfExportButton`의 `filename` prop에 주차 날짜 포함됨
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

```bash
ls docs/tasks/SH-01/
ls docs/tasks/SH-02/
ls docs/tasks/SH-03/
ls docs/tasks/SH-04/
ls docs/tasks/SH-05/
ls docs/tasks/SH-06/
cat docs/tasks/status.json | python -m json.tool
```

모두 존재하면 완료.

## 완료 후 할 일

```bash
git add docs/tasks/
git commit -m "chore(tasks): add SH task management infrastructure (SH-00)"
```
