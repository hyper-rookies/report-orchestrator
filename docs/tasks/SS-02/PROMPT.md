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
