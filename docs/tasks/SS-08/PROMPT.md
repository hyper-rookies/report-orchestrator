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
