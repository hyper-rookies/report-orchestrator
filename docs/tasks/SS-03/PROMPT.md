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
