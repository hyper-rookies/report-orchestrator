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
