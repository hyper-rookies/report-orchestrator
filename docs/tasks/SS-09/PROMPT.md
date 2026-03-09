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
