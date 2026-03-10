# Task SS-00: 리뷰 인프라 구축 (Session Save Task Setup)

## 목적

코드를 작성하지 않는다. SS-01~SS-10 태스크의 구현 프롬프트와 리뷰 템플릿을 `docs/tasks/` 폴더에 생성하고, `docs/tasks/status.json`에 SS 태스크들을 추가한다.

---

## 배경 (최소 컨텍스트)

- **계획 문서:** `docs/plans/2026-03-09-session-save.md` — 반드시 읽고 시작할 것
- **설계 문서:** `docs/plans/2026-03-09-session-save-design.md`
- **프로젝트:** `report-orchestrator` — Next.js 프론트엔드(TypeScript, `npx tsc --noEmit`)
- **목표:** 대화 세션 S3 자동 저장 + Claude 스타일 사이드바 목록 + 공유/삭제/이름변경
- **전제 조건:** SC-04 완료 (useDashboardCache 존재), SH-01 완료 (jose 설치됨)
- **경고:** Windows 환경. 경로 구분자는 `/` 사용.

---

## 작업 내용

아래 파일들을 생성하라.

### 생성할 파일 목록

```
docs/tasks/
├── status.json              ← SS-01~10 항목 추가 (기존 항목 유지)
├── SS-01/
│   ├── PROMPT.md
│   └── REPORT.md
├── SS-02/
│   ├── PROMPT.md
│   └── REPORT.md
├── SS-03/
│   ├── PROMPT.md
│   └── REPORT.md
├── SS-04/
│   ├── PROMPT.md
│   └── REPORT.md
├── SS-05/
│   ├── PROMPT.md
│   └── REPORT.md
├── SS-06/
│   ├── PROMPT.md
│   └── REPORT.md
├── SS-07/
│   ├── PROMPT.md
│   └── REPORT.md
├── SS-08/
│   ├── PROMPT.md
│   └── REPORT.md
├── SS-09/
│   ├── PROMPT.md
│   └── REPORT.md
└── SS-10/
    ├── PROMPT.md
    └── REPORT.md
```

---

## 파일 내용

### 1. `docs/tasks/status.json` 업데이트

기존 항목은 그대로 두고 SS-* 항목을 추가한다:

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
    "SH-06": { "status": "pending", "title": "dashboard/page.tsx에 ShareButton + PdfExportButton 연결", "completedAt": null },
    "SS-01": { "status": "pending", "title": "의존성(@aws-sdk/client-s3) + sessionS3.ts + session 타입", "completedAt": null },
    "SS-02": { "status": "pending", "title": "GET/POST /api/sessions (목록 + 생성)", "completedAt": null },
    "SS-03": { "status": "pending", "title": "GET/PATCH/DELETE /api/sessions/[id]", "completedAt": null },
    "SS-04": { "status": "pending", "title": "sessionShareStore.ts + 세션 공유 API 2개", "completedAt": null },
    "SS-05": { "status": "pending", "title": "SessionContext provider + useSessionStore", "completedAt": null },
    "SS-06": { "status": "pending", "title": "SessionListItem 컴포넌트 (점3개 메뉴 + 우클릭)", "completedAt": null },
    "SS-07": { "status": "pending", "title": "Sidebar 업데이트 + layout.tsx에 SessionProvider", "completedAt": null },
    "SS-08": { "status": "pending", "title": "(app)/page.tsx 자동 저장 + sessionId URL 라우팅", "completedAt": null },
    "SS-09": { "status": "pending", "title": "sessions/[sessionId]/page.tsx 세션 복원", "completedAt": null },
    "SS-10": { "status": "pending", "title": "share/session/[code]/page.tsx read-only 공유 뷰", "completedAt": null }
  }
}
```

---

### 2. `docs/tasks/SS-01/PROMPT.md`

```markdown
# SS-01: 의존성 + S3 유틸 + 공통 타입

**전제 조건:** 없음 (독립)

## 작업 개요

`@aws-sdk/client-s3` 설치, `frontend/src/lib/sessionS3.ts`, `frontend/src/types/session.ts` 생성.
**다른 파일은 수정하지 않는다.**

## 사전 작업: 의존성 설치

```bash
cd frontend
npm install @aws-sdk/client-s3
```

## 생성할 파일

- `frontend/src/types/session.ts`
- `frontend/src/lib/sessionS3.ts`

---

## 구현 코드

### `frontend/src/types/session.ts`

```typescript
import type { SseFrame } from "@/hooks/useSse";

export interface SessionMeta {
  sessionId: string;
  title: string;
  createdAt: string;  // ISO
  updatedAt: string;  // ISO
}

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  frames?: SseFrame[]; // chunk/status/delta 제외한 frames만 저장
}

export interface SessionData extends SessionMeta {
  messages: StoredMessage[];
}
```

### `frontend/src/lib/sessionS3.ts`

```typescript
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

function getClient(): S3Client {
  return new S3Client({ region: process.env.AWS_REGION ?? "ap-northeast-2" });
}

function getBucket(): string {
  const bucket = process.env.SESSION_BUCKET;
  if (!bucket) throw new Error("SESSION_BUCKET env var is not set.");
  return bucket;
}

export async function s3GetJson<T>(key: string): Promise<T | null> {
  try {
    const res = await getClient().send(
      new GetObjectCommand({ Bucket: getBucket(), Key: key })
    );
    const body = await res.Body?.transformToString("utf-8");
    if (!body) return null;
    return JSON.parse(body) as T;
  } catch (err: unknown) {
    if ((err as { name?: string }).name === "NoSuchKey") return null;
    throw err;
  }
}

export async function s3PutJson(key: string, data: unknown): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: "application/json",
    })
  );
}

export async function s3Delete(key: string): Promise<void> {
  await getClient().send(
    new DeleteObjectCommand({ Bucket: getBucket(), Key: key })
  );
}

export const indexKey = (sub: string) => `sessions/${sub}/index.json`;
export const sessionKey = (sub: string, id: string) => `sessions/${sub}/${id}.json`;
```

## 환경 변수 추가

`frontend/.env.local`에 추가 (없으면 생성):
```
SESSION_BUCKET=your-s3-bucket-name
AWS_REGION=ap-northeast-2
```

`frontend/.env.example`에도 추가:
```
SESSION_BUCKET=
AWS_REGION=ap-northeast-2
```

---

## 검증 명령

```bash
cd frontend && npx tsc --noEmit
```

Expected: 오류 없음 (exit code 0)

## 수락 기준

- [ ] `frontend/src/types/session.ts` 생성됨 (SessionMeta, StoredMessage, SessionData)
- [ ] `frontend/src/lib/sessionS3.ts` 생성됨 (s3GetJson, s3PutJson, s3Delete, indexKey, sessionKey)
- [ ] `@aws-sdk/client-s3` package.json에 추가됨
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

## 완료 후 할 일

1. `docs/tasks/SS-01/REPORT.md` 채우기
2. `docs/tasks/status.json`에서 SS-01 status → `"done"` 또는 `"blocked"`
3. `git add frontend/src/types/session.ts frontend/src/lib/sessionS3.ts frontend/.env.example frontend/package.json frontend/package-lock.json docs/tasks/SS-01/REPORT.md docs/tasks/status.json`
4. `git commit -m "feat(sessions): add S3 utility and session types (SS-01)"`
```

---

### 3. `docs/tasks/SS-01/REPORT.md`

```markdown
# SS-01 Task Report

**Status:** IN_PROGRESS | DONE | BLOCKED

**Completed At:** (ISO timestamp)

---

## Acceptance Criteria

- [ ] `frontend/src/types/session.ts` 생성됨 (SessionMeta, StoredMessage, SessionData)
- [ ] `frontend/src/lib/sessionS3.ts` 생성됨 (s3GetJson, s3PutJson, s3Delete, indexKey, sessionKey)
- [ ] `@aws-sdk/client-s3` package.json에 추가됨
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `frontend/src/types/session.ts` | Created | ? |
| `frontend/src/lib/sessionS3.ts` | Created | ? |
| `frontend/.env.example` | Modified | ? |
| `frontend/package.json` | Modified | ? |

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

### 4. `docs/tasks/SS-02/PROMPT.md`

```markdown
# SS-02: GET/POST /api/sessions

**전제 조건:** SS-01이 `"done"` 상태여야 한다.

## 작업 개요

`frontend/src/lib/sessionAuth.ts`와 `frontend/src/app/api/sessions/route.ts`를 생성한다.
**다른 파일은 수정하지 않는다.**

## 생성할 파일

- `frontend/src/lib/sessionAuth.ts`
- `frontend/src/app/api/sessions/route.ts`

---

## 구현 코드

### `frontend/src/lib/sessionAuth.ts`

```typescript
import { decodeJwt } from "jose";
import type { NextRequest } from "next/server";

export function getUserSub(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  try {
    const payload = decodeJwt(token);
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
```

### `frontend/src/app/api/sessions/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getUserSub } from "@/lib/sessionAuth";
import { s3GetJson, s3PutJson, indexKey, sessionKey } from "@/lib/sessionS3";
import type { SessionMeta, SessionData } from "@/types/session";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sub = getUserSub(req);
  if (!sub) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const index = (await s3GetJson<SessionMeta[]>(indexKey(sub))) ?? [];
  const sorted = [...index].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  return NextResponse.json(sorted);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const sub = getUserSub(req);
  if (!sub) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { sessionId, title, messages } = body as {
    sessionId?: unknown;
    title?: unknown;
    messages?: unknown;
  };

  if (
    typeof sessionId !== "string" ||
    typeof title !== "string" ||
    !Array.isArray(messages)
  ) {
    return NextResponse.json(
      { error: "sessionId, title, messages are required" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const index = (await s3GetJson<SessionMeta[]>(indexKey(sub))) ?? [];
  const existing = index.find((s) => s.sessionId === sessionId);

  const meta: SessionMeta = {
    sessionId,
    title,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const sessionData: SessionData = { ...meta, messages: messages as SessionData["messages"] };

  await s3PutJson(sessionKey(sub, sessionId), sessionData);

  const newIndex = [...index.filter((s) => s.sessionId !== sessionId), meta];
  await s3PutJson(indexKey(sub), newIndex);

  return NextResponse.json(meta);
}
```

---

## 검증 명령

```bash
cd frontend && npx tsc --noEmit
```

Expected: 오류 없음 (exit code 0)

## 수락 기준

- [ ] `frontend/src/lib/sessionAuth.ts` 생성됨 (`getUserSub` export)
- [ ] `frontend/src/app/api/sessions/route.ts` 생성됨 (GET + POST)
- [ ] GET: Authorization 없으면 401 반환
- [ ] POST: sessionId/title/messages 누락 시 400 반환
- [ ] POST: index.json upsert + 세션 파일 저장 로직 포함
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

## 완료 후 할 일

1. `docs/tasks/SS-02/REPORT.md` 채우기
2. `docs/tasks/status.json`에서 SS-02 status → `"done"` 또는 `"blocked"`
3. `git add frontend/src/lib/sessionAuth.ts frontend/src/app/api/sessions/route.ts docs/tasks/SS-02/REPORT.md docs/tasks/status.json`
4. `git commit -m "feat(sessions): add GET/POST /api/sessions routes (SS-02)"`
```

---

### 5. `docs/tasks/SS-02/REPORT.md`

```markdown
# SS-02 Task Report

**Status:** IN_PROGRESS | DONE | BLOCKED

**Completed At:** (ISO timestamp)

---

## Acceptance Criteria

- [ ] `frontend/src/lib/sessionAuth.ts` 생성됨 (`getUserSub` export)
- [ ] `frontend/src/app/api/sessions/route.ts` 생성됨 (GET + POST)
- [ ] GET: Authorization 없으면 401 반환
- [ ] POST: sessionId/title/messages 누락 시 400 반환
- [ ] POST: index.json upsert + 세션 파일 저장 로직 포함
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `frontend/src/lib/sessionAuth.ts` | Created | ? |
| `frontend/src/app/api/sessions/route.ts` | Created | ? |

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

### 6. `docs/tasks/SS-03/PROMPT.md`

```markdown
# SS-03: GET/PATCH/DELETE /api/sessions/[id]

**전제 조건:** SS-02가 `"done"` 상태여야 한다.

## 작업 개요

`frontend/src/app/api/sessions/[id]/route.ts`를 생성한다.
**다른 파일은 수정하지 않는다.**

## 생성할 파일

- `frontend/src/app/api/sessions/[id]/route.ts`

---

## 구현 코드

### `frontend/src/app/api/sessions/[id]/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getUserSub } from "@/lib/sessionAuth";
import { s3GetJson, s3PutJson, s3Delete, indexKey, sessionKey } from "@/lib/sessionS3";
import type { SessionMeta, SessionData } from "@/types/session";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const sub = getUserSub(req);
  if (!sub) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const session = await s3GetJson<SessionData>(sessionKey(sub, id));
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(session);
}

export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const sub = getUserSub(req);
  if (!sub) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { title } = body as { title?: unknown };
  if (typeof title !== "string" || title.trim().length === 0) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const session = await s3GetJson<SessionData>(sessionKey(sub, id));
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date().toISOString();
  const updated: SessionData = { ...session, title: title.trim(), updatedAt: now };

  await s3PutJson(sessionKey(sub, id), updated);

  const index = (await s3GetJson<SessionMeta[]>(indexKey(sub))) ?? [];
  const newIndex = index.map((s) =>
    s.sessionId === id ? { ...s, title: title.trim(), updatedAt: now } : s
  );
  await s3PutJson(indexKey(sub), newIndex);

  return NextResponse.json({ sessionId: id, title: title.trim(), updatedAt: now });
}

export async function DELETE(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const sub = getUserSub(req);
  if (!sub) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  await s3Delete(sessionKey(sub, id));

  const index = (await s3GetJson<SessionMeta[]>(indexKey(sub))) ?? [];
  await s3PutJson(indexKey(sub), index.filter((s) => s.sessionId !== id));

  return NextResponse.json({ deleted: id });
}
```

---

## 검증 명령

```bash
cd frontend && npx tsc --noEmit
```

Expected: 오류 없음 (exit code 0)

## 수락 기준

- [ ] `frontend/src/app/api/sessions/[id]/route.ts` 생성됨 (GET + PATCH + DELETE)
- [ ] GET: 없는 세션 시 404
- [ ] PATCH: title 누락/빈 문자열 시 400, 세션+index 모두 업데이트
- [ ] DELETE: 세션 파일 삭제 + index에서 제거
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

## 완료 후 할 일

1. `docs/tasks/SS-03/REPORT.md` 채우기
2. `docs/tasks/status.json`에서 SS-03 status → `"done"` 또는 `"blocked"`
3. `git add "frontend/src/app/api/sessions/[id]/route.ts" docs/tasks/SS-03/REPORT.md docs/tasks/status.json`
4. `git commit -m "feat(sessions): add GET/PATCH/DELETE /api/sessions/[id] (SS-03)"`
```

---

### 7. `docs/tasks/SS-03/REPORT.md`

```markdown
# SS-03 Task Report

**Status:** IN_PROGRESS | DONE | BLOCKED

**Completed At:** (ISO timestamp)

---

## Acceptance Criteria

- [ ] `frontend/src/app/api/sessions/[id]/route.ts` 생성됨 (GET + PATCH + DELETE)
- [ ] GET: 없는 세션 시 404
- [ ] PATCH: title 누락/빈 문자열 시 400, 세션+index 모두 업데이트
- [ ] DELETE: 세션 파일 삭제 + index에서 제거
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `frontend/src/app/api/sessions/[id]/route.ts` | Created | ? |

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

### 8. `docs/tasks/SS-04/PROMPT.md`

```markdown
# SS-04: sessionShareStore.ts + 세션 공유 API 2개

**전제 조건:** SS-03이 `"done"` 상태여야 한다.

## 작업 개요

`sessionShareStore.ts`, `POST /api/sessions/[id]/share`, `GET /api/share/session/[code]`를 생성한다.
**다른 파일은 수정하지 않는다.**

## 생성할 파일

- `frontend/src/lib/sessionShareStore.ts`
- `frontend/src/app/api/sessions/[id]/share/route.ts`
- `frontend/src/app/api/share/session/[code]/route.ts`

---

## 구현 코드

### `frontend/src/lib/sessionShareStore.ts`

```typescript
import { nanoid } from "nanoid";
import type { SessionData } from "@/types/session";

interface SessionShareEntry {
  sessionData: SessionData;
  expiresAt: number; // Unix seconds
}

declare global {
  // eslint-disable-next-line no-var
  var __sessionShareStore: Map<string, SessionShareEntry> | undefined;
}

const TTL_SECONDS = 7 * 24 * 60 * 60; // 7일

function getStore(): Map<string, SessionShareEntry> {
  if (!global.__sessionShareStore) {
    global.__sessionShareStore = new Map();
  }
  return global.__sessionShareStore;
}

export function createSessionShareCode(sessionData: SessionData): {
  code: string;
  expiresAt: Date;
} {
  const store = getStore();
  const code = nanoid(8);
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);
  store.set(code, { sessionData, expiresAt: Math.floor(expiresAt.getTime() / 1000) });
  const now = Math.floor(Date.now() / 1000);
  for (const [k, v] of store.entries()) {
    if (v.expiresAt < now) store.delete(k);
  }
  return { code, expiresAt };
}

export function resolveSessionShareCode(code: string): SessionData | null {
  const store = getStore();
  const entry = store.get(code);
  if (!entry) return null;
  if (Math.floor(Date.now() / 1000) > entry.expiresAt) {
    store.delete(code);
    return null;
  }
  return entry.sessionData;
}
```

### `frontend/src/app/api/sessions/[id]/share/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getUserSub } from "@/lib/sessionAuth";
import { s3GetJson, sessionKey } from "@/lib/sessionS3";
import { createSessionShareCode } from "@/lib/sessionShareStore";
import type { SessionData } from "@/types/session";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const sub = getUserSub(req);
  if (!sub) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const session = await s3GetJson<SessionData>(sessionKey(sub, id));
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { code, expiresAt } = createSessionShareCode(session);
  const origin = req.headers.get("origin") ?? req.nextUrl.origin;

  return NextResponse.json({
    code,
    url: `${origin}/share/session/${code}`,
    expiresAt: expiresAt.toISOString(),
  });
}
```

### `frontend/src/app/api/share/session/[code]/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { resolveSessionShareCode } from "@/lib/sessionShareStore";

type Params = { params: Promise<{ code: string }> };

export async function GET(
  _req: NextRequest,
  { params }: Params
): Promise<NextResponse> {
  const { code } = await params;
  const sessionData = resolveSessionShareCode(code);
  if (!sessionData) {
    return NextResponse.json(
      { error: "Share link not found or expired." },
      { status: 404 }
    );
  }
  return NextResponse.json(sessionData);
}
```

---

## 검증 명령

```bash
cd frontend && npx tsc --noEmit
```

Expected: 오류 없음 (exit code 0)

## 수락 기준

- [ ] `frontend/src/lib/sessionShareStore.ts` 생성됨 (createSessionShareCode, resolveSessionShareCode)
- [ ] `POST /api/sessions/[id]/share` — 세션 없으면 404, 성공 시 { code, url, expiresAt }
- [ ] `GET /api/share/session/[code]` — 없거나 만료 시 404, 성공 시 SessionData
- [ ] TTL 7일 (604800초) 적용
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

## 완료 후 할 일

1. `docs/tasks/SS-04/REPORT.md` 채우기
2. `docs/tasks/status.json`에서 SS-04 status → `"done"` 또는 `"blocked"`
3. `git add frontend/src/lib/sessionShareStore.ts "frontend/src/app/api/sessions/[id]/share/route.ts" "frontend/src/app/api/share/session/[code]/route.ts" docs/tasks/SS-04/REPORT.md docs/tasks/status.json`
4. `git commit -m "feat(sessions): add session share store and API routes (SS-04)"`
```

---

### 9. `docs/tasks/SS-04/REPORT.md`

```markdown
# SS-04 Task Report

**Status:** IN_PROGRESS | DONE | BLOCKED

**Completed At:** (ISO timestamp)

---

## Acceptance Criteria

- [ ] `frontend/src/lib/sessionShareStore.ts` 생성됨 (createSessionShareCode, resolveSessionShareCode)
- [ ] `POST /api/sessions/[id]/share` — 세션 없으면 404, 성공 시 { code, url, expiresAt }
- [ ] `GET /api/share/session/[code]` — 없거나 만료 시 404, 성공 시 SessionData
- [ ] TTL 7일 (604800초) 적용
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `frontend/src/lib/sessionShareStore.ts` | Created | ? |
| `frontend/src/app/api/sessions/[id]/share/route.ts` | Created | ? |
| `frontend/src/app/api/share/session/[code]/route.ts` | Created | ? |

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

### 10. `docs/tasks/SS-05/PROMPT.md`

```markdown
# SS-05: SessionContext provider + useSessionStore

**전제 조건:** SS-02, SS-03, SS-04가 모두 `"done"` 상태여야 한다.

## 작업 개요

`frontend/src/context/SessionContext.tsx`를 생성한다.
**다른 파일은 수정하지 않는다.**

## 생성할 파일

- `frontend/src/context/SessionContext.tsx`

---

## 구현 코드

### `frontend/src/context/SessionContext.tsx`

```typescript
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { fetchAuthSession } from "aws-amplify/auth";
import type { SessionMeta, StoredMessage } from "@/types/session";

interface SaveSessionArgs {
  sessionId: string;
  title: string;
  messages: StoredMessage[];
}

interface ShareResult {
  url: string;
  expiresAt: string;
}

interface SessionContextValue {
  sessions: SessionMeta[];
  loading: boolean;
  refreshSessions: () => Promise<void>;
  saveSession: (args: SaveSessionArgs) => Promise<void>;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  shareSession: (sessionId: string) => Promise<ShareResult>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const USE_MOCK_AUTH = process.env.NEXT_PUBLIC_USE_MOCK_AUTH === "true";

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (USE_MOCK_AUTH) return {};
  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshSessions = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/sessions", { headers });
      if (res.ok) {
        setSessions((await res.json()) as SessionMeta[]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  const saveSession = useCallback(async (args: SaveSessionArgs) => {
    const headers = await getAuthHeaders();
    await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(args),
    });
    void refreshSessions();
  }, [refreshSessions]);

  const renameSession = useCallback(async (sessionId: string, title: string) => {
    const headers = await getAuthHeaders();
    await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ title }),
    });
    setSessions((prev) =>
      prev.map((s) => (s.sessionId === sessionId ? { ...s, title } : s))
    );
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    const headers = await getAuthHeaders();
    await fetch(`/api/sessions/${sessionId}`, { method: "DELETE", headers });
    setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
  }, []);

  const shareSession = useCallback(async (sessionId: string): Promise<ShareResult> => {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/sessions/${sessionId}/share`, {
      method: "POST",
      headers,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ShareResult;
  }, []);

  const value = useMemo(
    () => ({ sessions, loading, refreshSessions, saveSession, renameSession, deleteSession, shareSession }),
    [sessions, loading, refreshSessions, saveSession, renameSession, deleteSession, shareSession]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessionContext(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSessionContext must be used inside SessionProvider");
  return ctx;
}
```

---

## 검증 명령

```bash
cd frontend && npx tsc --noEmit
```

Expected: 오류 없음 (exit code 0)

## 수락 기준

- [ ] `frontend/src/context/SessionContext.tsx` 생성됨
- [ ] `SessionProvider` export됨
- [ ] `useSessionContext` export됨 (SessionProvider 밖에서 사용 시 Error throw)
- [ ] sessions 로드: 마운트 시 자동 `GET /api/sessions` 호출
- [ ] saveSession 후 refreshSessions 자동 호출
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

## 완료 후 할 일

1. `docs/tasks/SS-05/REPORT.md` 채우기
2. `docs/tasks/status.json`에서 SS-05 status → `"done"` 또는 `"blocked"`
3. `git add frontend/src/context/SessionContext.tsx docs/tasks/SS-05/REPORT.md docs/tasks/status.json`
4. `git commit -m "feat(sessions): add SessionContext provider and store hook (SS-05)"`
```

---

### 11. `docs/tasks/SS-05/REPORT.md`

```markdown
# SS-05 Task Report

**Status:** IN_PROGRESS | DONE | BLOCKED

**Completed At:** (ISO timestamp)

---

## Acceptance Criteria

- [ ] `frontend/src/context/SessionContext.tsx` 생성됨
- [ ] `SessionProvider` export됨
- [ ] `useSessionContext` export됨 (SessionProvider 밖에서 사용 시 Error throw)
- [ ] sessions 로드: 마운트 시 자동 `GET /api/sessions` 호출
- [ ] saveSession 후 refreshSessions 자동 호출
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `frontend/src/context/SessionContext.tsx` | Created | ? |

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

### 12. `docs/tasks/SS-06/PROMPT.md`

```markdown
# SS-06: SessionListItem 컴포넌트

**전제 조건:** SS-05가 `"done"` 상태여야 한다.

## 작업 개요

`frontend/src/components/layout/SessionListItem.tsx`를 생성한다.
**다른 파일은 수정하지 않는다.**

## 생성할 파일

- `frontend/src/components/layout/SessionListItem.tsx`

---

## 구현 코드

### `frontend/src/components/layout/SessionListItem.tsx`

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Share2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSessionContext } from "@/context/SessionContext";

interface SessionListItemProps {
  sessionId: string;
  title: string;
  isActive: boolean;
}

type MenuState =
  | { open: false }
  | { open: true; x: number; y: number };

type ShareState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; url: string; expiresAt: string }
  | { status: "error"; message: string };

export default function SessionListItem({
  sessionId,
  title,
  isActive,
}: SessionListItemProps) {
  const router = useRouter();
  const { renameSession, deleteSession, shareSession } = useSessionContext();
  const [menu, setMenu] = useState<MenuState>({ open: false });
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(title);
  const [shareState, setShareState] = useState<ShareState>({ status: "idle" });
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menu.open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu({ open: false });
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menu.open]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const openMenu = (x: number, y: number) => setMenu({ open: true, x, y });

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    openMenu(e.clientX, e.clientY);
  };

  const handleDotsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    openMenu(rect.left, rect.bottom + 4);
  };

  const handleRename = () => {
    setMenu({ open: false });
    setEditing(true);
    setEditValue(title);
  };

  const handleRenameSubmit = async () => {
    const trimmed = editValue.trim();
    setEditing(false);
    if (trimmed && trimmed !== title) {
      await renameSession(sessionId, trimmed);
    }
  };

  const handleShare = async () => {
    setMenu({ open: false });
    setShareState({ status: "loading" });
    try {
      const result = await shareSession(sessionId);
      setShareState({ status: "done", url: result.url, expiresAt: result.expiresAt });
    } catch (err) {
      setShareState({
        status: "error",
        message: err instanceof Error ? err.message : "공유 실패",
      });
    }
  };

  const handleDelete = async () => {
    setMenu({ open: false });
    if (!confirm("이 대화를 삭제하시겠습니까?")) return;
    await deleteSession(sessionId);
    if (isActive) router.push("/");
  };

  return (
    <div
      className={cn(
        "group relative flex items-center gap-1 rounded-lg px-2 py-2 text-sm transition-colors cursor-pointer",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
      )}
      onClick={() => !editing && router.push(`/sessions/${sessionId}`)}
      onContextMenu={handleContextMenu}
    >
      <div className="flex-1 truncate">
        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleRenameSubmit();
              if (e.key === "Escape") setEditing(false);
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded bg-transparent text-sm outline-none ring-1 ring-sidebar-primary px-1"
          />
        ) : (
          <span
            className="block truncate"
            onDoubleClick={(e) => {
              e.stopPropagation();
              handleRename();
            }}
          >
            {title}
          </span>
        )}
      </div>

      {!editing && (
        <button
          className="invisible shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground group-hover:visible"
          onClick={handleDotsClick}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      )}

      {menu.open && (
        <div
          ref={menuRef}
          className="fixed z-50 w-44 rounded-lg border bg-card p-1 shadow-lg"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
            onClick={handleRename}
          >
            <Pencil className="h-3.5 w-3.5" />
            이름 변경하기
          </button>
          <button
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
            onClick={handleShare}
          >
            <Share2 className="h-3.5 w-3.5" />
            공유하기
          </button>
          <div className="my-1 border-t" />
          <button
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
            onClick={handleDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
            대화 삭제하기
          </button>
        </div>
      )}

      {shareState.status !== "idle" && (
        <div
          className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border bg-card p-4 shadow-lg space-y-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">대화 공유</p>
            <button
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setShareState({ status: "idle" })}
            >
              ✕
            </button>
          </div>
          {shareState.status === "loading" && (
            <p className="text-sm text-muted-foreground">링크 생성 중...</p>
          )}
          {shareState.status === "error" && (
            <p className="text-sm text-destructive">{shareState.message}</p>
          )}
          {shareState.status === "done" && (
            <>
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  ⚠️ 이 링크는{" "}
                  <strong>
                    {(() => {
                      const d = new Date(shareState.expiresAt);
                      return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
                    })()}
                  </strong>
                  에 만료됩니다 (7일).
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={shareState.url}
                  className="flex-1 rounded border bg-muted px-2 py-1 text-xs font-mono"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button
                  className="rounded border px-2 py-1 text-xs hover:bg-accent"
                  onClick={() => void navigator.clipboard.writeText((shareState as { url: string }).url)}
                >
                  복사
                </button>
              </div>
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

- [ ] `SessionListItem.tsx` 생성됨
- [ ] 점3개 버튼: hover 시 표시, 클릭 시 메뉴 열림
- [ ] 우클릭(`onContextMenu`): 같은 메뉴 열림
- [ ] 더블클릭: 인플레이스 편집 (Enter/blur 저장, Escape 취소)
- [ ] 메뉴 항목: ✏️ 이름변경 / 🔗 공유 / 🗑️ 대화삭제 (삭제는 text-destructive)
- [ ] 공유 성공 시: 토스트에 URL + 만료일 + 복사 버튼
- [ ] 삭제 후 활성 세션이면 `/`로 이동
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

## 완료 후 할 일

1. `docs/tasks/SS-06/REPORT.md` 채우기
2. `docs/tasks/status.json`에서 SS-06 status → `"done"` 또는 `"blocked"`
3. `git add frontend/src/components/layout/SessionListItem.tsx docs/tasks/SS-06/REPORT.md docs/tasks/status.json`
4. `git commit -m "feat(sessions): add SessionListItem with context menu and share toast (SS-06)"`
```

---

### 13. `docs/tasks/SS-06/REPORT.md`

```markdown
# SS-06 Task Report

**Status:** IN_PROGRESS | DONE | BLOCKED

**Completed At:** (ISO timestamp)

---

## Acceptance Criteria

- [ ] `SessionListItem.tsx` 생성됨
- [ ] 점3개 버튼: hover 시 표시, 클릭 시 메뉴 열림
- [ ] 우클릭(`onContextMenu`): 같은 메뉴 열림
- [ ] 더블클릭: 인플레이스 편집 (Enter/blur 저장, Escape 취소)
- [ ] 메뉴 항목: ✏️ 이름변경 / 🔗 공유 / 🗑️ 대화삭제 (삭제는 text-destructive)
- [ ] 공유 성공 시: 토스트에 URL + 만료일 + 복사 버튼
- [ ] 삭제 후 활성 세션이면 `/`로 이동
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `frontend/src/components/layout/SessionListItem.tsx` | Created | ? |

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

### 14. `docs/tasks/SS-07/PROMPT.md`

```markdown
# SS-07: Sidebar 업데이트 + layout.tsx에 SessionProvider 추가

**전제 조건:** SS-06이 `"done"` 상태여야 한다.

## 작업 개요

`frontend/src/components/layout/Sidebar.tsx`와 `frontend/src/app/(app)/layout.tsx`를 수정한다.

## 수정할 파일

- `frontend/src/components/layout/Sidebar.tsx`
- `frontend/src/app/(app)/layout.tsx`

---

## 수정 내용

### `Sidebar.tsx` 수정

1. **import 추가:**

```typescript
import { useSessionContext } from "@/context/SessionContext";
import SessionListItem from "@/components/layout/SessionListItem";
```

2. **함수 내 상단에 추가:**

```typescript
const { sessions } = useSessionContext();
```

3. **FE-07 슬롯 교체:**

```tsx
// 기존
<div className="flex-1 overflow-y-auto px-3 pb-4 pt-2">{/* FE-07 conversation list */}</div>

// 변경
<div className="flex-1 overflow-y-auto px-3 pb-4 pt-2">
  {sessions.length > 0 && (
    <p className="mb-2 px-1 text-xs font-semibold text-muted-foreground tracking-wide">
      최근 대화
    </p>
  )}
  <div className="space-y-0.5">
    {sessions.map((s) => (
      <SessionListItem
        key={s.sessionId}
        sessionId={s.sessionId}
        title={s.title}
        isActive={pathname === `/sessions/${s.sessionId}`}
      />
    ))}
  </div>
</div>
```

**참고:** `pathname`은 이미 `usePathname()`으로 선언되어 있음.

### `(app)/layout.tsx` 수정

```typescript
// import 추가
import { SessionProvider } from "@/context/SessionContext";

// JSX: 기존 최상위 div를 SessionProvider로 감싸기
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <div className="fixed inset-0 z-0 flex overflow-hidden nhn-subtle-grid">
        {/* 기존 내용 그대로 유지 */}
      </div>
    </SessionProvider>
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

- [ ] `Sidebar.tsx`에 `useSessionContext()` 호출 추가됨
- [ ] `Sidebar.tsx`의 FE-07 슬롯이 SessionListItem 목록으로 교체됨
- [ ] `(app)/layout.tsx`에 `SessionProvider`로 감싸짐
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

## 완료 후 할 일

1. `docs/tasks/SS-07/REPORT.md` 채우기
2. `docs/tasks/status.json`에서 SS-07 status → `"done"` 또는 `"blocked"`
3. `git add frontend/src/components/layout/Sidebar.tsx "frontend/src/app/(app)/layout.tsx" docs/tasks/SS-07/REPORT.md docs/tasks/status.json`
4. `git commit -m "feat(sessions): update Sidebar with session list and add SessionProvider (SS-07)"`
```

---

### 15. `docs/tasks/SS-07/REPORT.md`

```markdown
# SS-07 Task Report

**Status:** IN_PROGRESS | DONE | BLOCKED

**Completed At:** (ISO timestamp)

---

## Acceptance Criteria

- [ ] `Sidebar.tsx`에 `useSessionContext()` 호출 추가됨
- [ ] `Sidebar.tsx`의 FE-07 슬롯이 SessionListItem 목록으로 교체됨
- [ ] `(app)/layout.tsx`에 `SessionProvider`로 감싸짐
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

---

## Files Changed

| File | Action | Lines Before | Lines After |
|------|--------|-------------|-------------|
| `frontend/src/components/layout/Sidebar.tsx` | Modified | ? | ? |
| `frontend/src/app/(app)/layout.tsx` | Modified | ? | ? |

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

### 16. `docs/tasks/SS-08/PROMPT.md`

```markdown
# SS-08: (app)/page.tsx 자동 저장 + sessionId URL 라우팅

**전제 조건:** SS-07이 `"done"` 상태여야 한다.

## 작업 개요

`frontend/src/app/(app)/page.tsx`를 수정해 자동 저장과 sessionId URL 라우팅을 추가한다.

## 수정할 파일

- `frontend/src/app/(app)/page.tsx`

---

## 수정 내용

**주의:** `Message` 인터페이스를 `export`로 변경해야 한다 (SS-09에서 import함).

### 1. import 추가

```typescript
import { useRef } from "react";  // 기존 useRef가 없으면 추가
import { useRouter } from "next/navigation";
import { useSessionContext } from "@/context/SessionContext";
import type { StoredMessage } from "@/types/session";
```

### 2. `Message` 인터페이스를 export로 변경

```typescript
// 기존
export interface Message {
// 이미 export인 경우 그대로 유지
```

**확인:** 파일 상단의 `interface Message`가 `export interface Message`인지 확인. 아니라면 `export` 추가.

### 3. 함수 내 상단에 추가

```typescript
const router = useRouter();
const { saveSession } = useSessionContext();
const sessionIdRef = useRef<string | null>(null);
const SKIP_TYPES = new Set(["chunk", "status", "delta"]);
```

### 4. `handleSubmit` 수정

기존 handleSubmit을 아래로 교체한다:

```typescript
const handleSubmit = async (question: string) => {
  // 새 세션 ID (첫 메시지일 때 생성)
  if (!sessionIdRef.current) {
    sessionIdRef.current = crypto.randomUUID();
    router.replace(`/sessions/${sessionIdRef.current}`);
  }

  const userMsg: Message = {
    id: crypto.randomUUID(),
    role: "user",
    content: question,
  };
  setMessages((prev) => [...prev, userMsg]);

  const completedFrames = await ask(question);
  const normalizedFrames = hasRenderableFrame(completedFrames)
    ? completedFrames
    : [
        {
          type: "error",
          data: {
            version: "v1",
            code: "EMPTY_RESPONSE",
            message: "응답 프레임이 비어 있습니다. 인증(401) 또는 SSE 응답 형식을 확인해 주세요.",
            retryable: false,
          },
        } satisfies SseFrame,
      ];

  const assistantMsg: Message = {
    id: crypto.randomUUID(),
    role: "assistant",
    content: "",
    frames: normalizedFrames,
  };

  setMessages((prev) => {
    const updated = [...prev, assistantMsg];

    // 자동 저장 (비동기, 오류는 무시)
    const storedMessages: StoredMessage[] = updated.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      frames: m.frames?.filter((f) => !SKIP_TYPES.has(f.type)),
    }));
    void saveSession({
      sessionId: sessionIdRef.current!,
      title: question.slice(0, 40),
      messages: storedMessages,
    });

    return updated;
  });
};
```

**주의:** 기존 `handleSubmit`에서 `setMessages` 두 번 호출하는 부분을 위처럼 하나로 합친다. `userMsg`는 먼저 별도로 추가한 뒤, assistantMsg는 콜백 내에서 처리.

---

## 검증 명령

```bash
cd frontend && npx tsc --noEmit
```

Expected: 오류 없음 (exit code 0)

## 수락 기준

- [ ] `Message` 인터페이스가 `export`됨
- [ ] 첫 메시지 시 `sessionIdRef.current` 생성 + `router.replace`로 URL 변경
- [ ] 응답 완료 후 `saveSession` 자동 호출
- [ ] 저장 시 `chunk/status/delta` 프레임 제외
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

## 완료 후 할 일

1. `docs/tasks/SS-08/REPORT.md` 채우기
2. `docs/tasks/status.json`에서 SS-08 status → `"done"` 또는 `"blocked"`
3. `git add "frontend/src/app/(app)/page.tsx" docs/tasks/SS-08/REPORT.md docs/tasks/status.json`
4. `git commit -m "feat(sessions): add auto-save and sessionId routing to chat page (SS-08)"`
```

---

### 17. `docs/tasks/SS-08/REPORT.md`

```markdown
# SS-08 Task Report

**Status:** IN_PROGRESS | DONE | BLOCKED

**Completed At:** (ISO timestamp)

---

## Acceptance Criteria

- [ ] `Message` 인터페이스가 `export`됨
- [ ] 첫 메시지 시 `sessionIdRef.current` 생성 + `router.replace`로 URL 변경
- [ ] 응답 완료 후 `saveSession` 자동 호출
- [ ] 저장 시 `chunk/status/delta` 프레임 제외
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

---

## Files Changed

| File | Action | Lines Before | Lines After |
|------|--------|-------------|-------------|
| `frontend/src/app/(app)/page.tsx` | Modified | ? | ? |

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

### 18. `docs/tasks/SS-09/PROMPT.md`

```markdown
# SS-09: sessions/[sessionId]/page.tsx 세션 복원

**전제 조건:** SS-08이 `"done"` 상태여야 한다.

## 작업 개요

`frontend/src/app/(app)/sessions/[sessionId]/page.tsx`를 생성한다.
**다른 파일은 수정하지 않는다.**

## 생성할 파일

- `frontend/src/app/(app)/sessions/[sessionId]/page.tsx`

---

## 구현 코드

### `frontend/src/app/(app)/sessions/[sessionId]/page.tsx`

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchAuthSession } from "aws-amplify/auth";
import MessageList from "@/components/chat/MessageList";
import ChatInput from "@/components/chat/ChatInput";
import { useSse, type SseFrame } from "@/hooks/useSse";
import { useSessionContext } from "@/context/SessionContext";
import type { Message } from "@/app/(app)/page";
import type { StoredMessage } from "@/types/session";

const USE_MOCK_AUTH = process.env.NEXT_PUBLIC_USE_MOCK_AUTH === "true";

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (USE_MOCK_AUTH) return {};
  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}

const SKIP_TYPES = new Set(["chunk", "status", "delta"]);

export default function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();
  const { saveSession } = useSessionContext();
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionTitle, setSessionTitle] = useState<string>("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const { frames, streaming, error, ask } = useSse();
  const messageScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/sessions/${sessionId}`, { headers });
      if (!res.ok) {
        setLoadError("세션을 찾을 수 없습니다.");
        return;
      }
      const data = await res.json() as { title: string; messages: StoredMessage[] };
      setSessionTitle(data.title);
      setMessages(
        data.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          frames: m.frames as SseFrame[] | undefined,
        }))
      );
    };
    void load();
  }, [sessionId]);

  useEffect(() => {
    messageScrollRef.current?.scrollTo({
      top: messageScrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, frames]);

  const hasRenderableFrame = (allFrames: SseFrame[]) =>
    allFrames.some(
      (f) =>
        ["chunk", "table", "chart", "error"].includes(f.type) ||
        (f.type === "final" &&
          typeof ((f.data.agentSummary ?? f.data.summary) as string | undefined) === "string")
    );

  const handleSubmit = async (question: string) => {
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: question };
    setMessages((prev) => [...prev, userMsg]);

    const completedFrames = await ask(question);
    const normalizedFrames = hasRenderableFrame(completedFrames)
      ? completedFrames
      : [
          {
            type: "error",
            data: {
              version: "v1",
              code: "EMPTY_RESPONSE",
              message: "응답 프레임이 비어 있습니다.",
              retryable: false,
            },
          } satisfies SseFrame,
        ];

    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      frames: normalizedFrames,
    };

    setMessages((prev) => {
      const updated = [...prev, assistantMsg];
      const storedMessages: StoredMessage[] = updated.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        frames: m.frames?.filter((f) => !SKIP_TYPES.has(f.type)),
      }));
      void saveSession({
        sessionId,
        title: sessionTitle || question.slice(0, 40),
        messages: storedMessages,
      });
      return updated;
    });
  };

  if (loadError) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-destructive">{loadError}</p>
          <button className="text-sm underline" onClick={() => router.push("/")}>
            새 대화 시작
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MessageList
        messages={messages}
        streamingFrames={streaming ? frames : []}
        scrollContainerRef={messageScrollRef}
      />
      {error && (
        <p className="mx-4 mb-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <ChatInput onSubmit={handleSubmit} disabled={streaming} />
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

- [ ] `frontend/src/app/(app)/sessions/[sessionId]/page.tsx` 생성됨
- [ ] 마운트 시 `GET /api/sessions/{sessionId}` 호출 + 메시지 복원
- [ ] 404 응답 시 오류 메시지 + "새 대화 시작" 링크
- [ ] 이어서 대화 가능 + 자동 저장 동작
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

## 완료 후 할 일

1. `docs/tasks/SS-09/REPORT.md` 채우기
2. `docs/tasks/status.json`에서 SS-09 status → `"done"` 또는 `"blocked"`
3. `git add "frontend/src/app/(app)/sessions/[sessionId]/page.tsx" docs/tasks/SS-09/REPORT.md docs/tasks/status.json`
4. `git commit -m "feat(sessions): add session restore page (SS-09)"`
```

---

### 19. `docs/tasks/SS-09/REPORT.md`

```markdown
# SS-09 Task Report

**Status:** IN_PROGRESS | DONE | BLOCKED

**Completed At:** (ISO timestamp)

---

## Acceptance Criteria

- [ ] `frontend/src/app/(app)/sessions/[sessionId]/page.tsx` 생성됨
- [ ] 마운트 시 `GET /api/sessions/{sessionId}` 호출 + 메시지 복원
- [ ] 404 응답 시 오류 메시지 + "새 대화 시작" 링크
- [ ] 이어서 대화 가능 + 자동 저장 동작
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `frontend/src/app/(app)/sessions/[sessionId]/page.tsx` | Created | ? |

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

### 20. `docs/tasks/SS-10/PROMPT.md`

```markdown
# SS-10: share/session/[code]/page.tsx read-only 공유 뷰

**전제 조건:** SS-04가 `"done"` 상태여야 한다.

## 작업 개요

`frontend/src/app/share/session/[code]/page.tsx`를 생성한다.
**주의:** `app/share/` 는 `(app)` 그룹 밖 — Amplify auth 없이 접근.
**다른 파일은 수정하지 않는다.**

## 생성할 파일

- `frontend/src/app/share/session/[code]/page.tsx`

---

## 구현 코드

### `frontend/src/app/share/session/[code]/page.tsx`

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { SessionData } from "@/types/session";
import type { SseFrame } from "@/hooks/useSse";
import MessageList from "@/components/chat/MessageList";
import type { Message } from "@/app/(app)/page";

export default function SharedSessionPage() {
  const { code } = useParams<{ code: string }>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ok"; session: SessionData }
  >({ status: "loading" });

  useEffect(() => {
    fetch(`/api/share/session/${code}`)
      .then(async (res) => {
        if (!res.ok) {
          const err = (await res.json()) as { error?: string };
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<SessionData>;
      })
      .then((session) => setState({ status: "ok", session }))
      .catch((err: unknown) =>
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "링크를 불러올 수 없습니다.",
        })
      );
  }, [code]);

  if (state.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">공유 링크 확인 중...</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold text-destructive">
            링크가 만료되었거나 유효하지 않습니다.
          </p>
          <p className="text-sm text-muted-foreground">{state.message}</p>
        </div>
      </div>
    );
  }

  const { session } = state;
  const messages: Message[] = session.messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    frames: m.frames as SseFrame[] | undefined,
  }));

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur px-6 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">NHN AD · Marketing Copilot</p>
          <p className="text-sm font-semibold truncate max-w-xs">{session.title}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
            읽기 전용
          </span>
          <span className="text-xs text-amber-600 dark:text-amber-400">⚠️ 7일 후 만료</span>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6">
        <MessageList
          messages={messages}
          streamingFrames={[]}
          scrollContainerRef={scrollRef}
        />
      </div>

      <p className="text-center text-xs text-muted-foreground pb-6">
        AI 리포트 서비스 · 읽기 전용 공유 뷰 · 이 링크는 7일 후 만료됩니다.
      </p>
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

- [ ] `frontend/src/app/share/session/[code]/page.tsx` 생성됨
- [ ] `(app)` 그룹 밖 → 로그인 없이 접근
- [ ] 로딩 / 오류 / 정상 세 상태 처리
- [ ] 오류 시 "링크가 만료되었거나 유효하지 않습니다." 표시
- [ ] 정상 시: 헤더(제목 + "읽기 전용" 뱃지 + "7일 후 만료") + 메시지 목록
- [ ] 입력창 없음 (ChatInput 없음)
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

## 완료 후 할 일

1. `docs/tasks/SS-10/REPORT.md` 채우기
2. `docs/tasks/status.json`에서 SS-10 status → `"done"` 또는 `"blocked"`
3. `git add "frontend/src/app/share/session/[code]/page.tsx" docs/tasks/SS-10/REPORT.md docs/tasks/status.json`
4. `git commit -m "feat(sessions): add read-only shared session view (SS-10)"`
```

---

### 21. `docs/tasks/SS-10/REPORT.md`

```markdown
# SS-10 Task Report

**Status:** IN_PROGRESS | DONE | BLOCKED

**Completed At:** (ISO timestamp)

---

## Acceptance Criteria

- [ ] `frontend/src/app/share/session/[code]/page.tsx` 생성됨
- [ ] `(app)` 그룹 밖 → 로그인 없이 접근
- [ ] 로딩 / 오류 / 정상 세 상태 처리
- [ ] 오류 시 "링크가 만료되었거나 유효하지 않습니다." 표시
- [ ] 정상 시: 헤더(제목 + "읽기 전용" 뱃지 + "7일 후 만료") + 메시지 목록
- [ ] 입력창 없음 (ChatInput 없음)
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `frontend/src/app/share/session/[code]/page.tsx` | Created | ? |

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
ls docs/tasks/SS-01/
ls docs/tasks/SS-05/
ls docs/tasks/SS-10/
cat docs/tasks/status.json | python -m json.tool
```

모두 존재하면 완료.

## 완료 후 할 일

```bash
git add docs/tasks/
git commit -m "chore(tasks): add SS task management infrastructure (SS-00)"
```
