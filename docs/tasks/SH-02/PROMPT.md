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
