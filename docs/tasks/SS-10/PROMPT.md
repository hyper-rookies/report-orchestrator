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
