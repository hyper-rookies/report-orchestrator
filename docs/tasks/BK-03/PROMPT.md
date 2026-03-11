# BK-03: BookmarkButton + AssistantMessage + MessageList 통합

## 목적

채팅 응답 완료 후 우측 하단에 보관함 저장 버튼을 노출한다.
- `frontend/src/lib/bookmarkClient.ts` - 클라이언트 fetch 래퍼
- `frontend/src/components/bookmark/BookmarkButton.tsx` - 저장 버튼 컴포넌트
- `frontend/src/components/chat/AssistantMessage.tsx` - `prompt` prop 추가 + BookmarkButton 삽입
- `frontend/src/components/chat/MessageList.tsx` - 이전 user 메시지를 `prompt` 로 전달

---

## 전제 조건

- **BK-02 완료 필수.** `/api/bookmarks` POST 엔드포인트가 동작해야 한다.

---

## 배경

- **설계 문서:** `docs/plans/2026-03-11-bookmarks-design.md` 의 5장을 읽고 시작할 것
- **참조 구현:** `frontend/src/context/SessionContext.tsx` 의 auth header 처리 패턴 참고
- `AssistantMessage.tsx` 현재 Props 는 `{ frames: SseFrame[]; streaming?: boolean }` 이다
- `MessageList.tsx` 현재는 `messages.map((msg) => ...)` 구조이며 assistant 메시지 렌더 시 `prompt` 전달이 필요하다
- 보관함 버튼은 `!streaming && finalFrame && prompt` 조건에서만 렌더링한다
- 성공 시 아이콘은 `Bookmark` 에서 `BookmarkCheck` 로 변경한다

---

## 대상 파일

| 파일 | 액션 |
|------|------|
| `frontend/src/lib/bookmarkClient.ts` | 신규 생성 |
| `frontend/src/components/bookmark/BookmarkButton.tsx` | 신규 생성 |
| `frontend/src/components/chat/AssistantMessage.tsx` | 수정 |
| `frontend/src/components/chat/MessageList.tsx` | 수정 |

---

## 구현 코드

### `frontend/src/lib/bookmarkClient.ts`

```typescript
import { fetchAuthSession } from "aws-amplify/auth";
import type { BookmarkItem, BookmarkMeta } from "@/types/bookmark";
import type { SseFrame } from "@/hooks/useSse";

const USE_MOCK_AUTH = process.env.NEXT_PUBLIC_USE_MOCK_AUTH === "true";

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (USE_MOCK_AUTH) return {};
  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export async function listBookmarks(): Promise<BookmarkMeta[]> {
  const headers = await getAuthHeaders();
  const res = await fetch("/api/bookmarks", { headers });
  if (!res.ok) return [];
  return res.json() as Promise<BookmarkMeta[]>;
}

export async function saveBookmark(prompt: string, frames: SseFrame[]): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch("/api/bookmarks", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, frames }),
  });
  if (!res.ok) throw new Error("Failed to save bookmark");
}

export async function getBookmark(id: string): Promise<BookmarkItem | null> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/bookmarks/${id}`, { headers });
  if (!res.ok) return null;
  return res.json() as Promise<BookmarkItem>;
}

export async function deleteBookmark(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  await fetch(`/api/bookmarks/${id}`, { method: "DELETE", headers });
}
```

### `frontend/src/components/bookmark/BookmarkButton.tsx`

```tsx
"use client";

import { useState } from "react";
import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";
import { saveBookmark } from "@/lib/bookmarkClient";
import type { SseFrame } from "@/hooks/useSse";

interface Props {
  prompt: string;
  frames: SseFrame[];
}

export default function BookmarkButton({ prompt, frames }: Props) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saved || saving) return;
    setSaving(true);
    try {
      await saveBookmark(prompt, frames);
      setSaved(true);
    } catch {
      // silent fail - user can retry
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleSave()}
      disabled={saved || saving}
      title={saved ? "보관함에 저장됨" : "보관함에 저장"}
      className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-60"
    >
      {saving ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : saved ? (
        <BookmarkCheck className="h-4 w-4 text-primary" />
      ) : (
        <Bookmark className="h-4 w-4" />
      )}
    </button>
  );
}
```

### `frontend/src/components/chat/AssistantMessage.tsx` 수정 사항

1. Props 인터페이스에 `prompt?: string` 추가:
```typescript
interface Props {
  frames: SseFrame[];
  streaming?: boolean;
  prompt?: string;
}
```

2. `import BookmarkButton from "@/components/bookmark/BookmarkButton";` 추가

3. 함수 시그니처 수정:
```typescript
export default function AssistantMessage({ frames, streaming, prompt }: Props) {
```

4. `errorFrame` 블록 아래, 카드 컨테이너 닫기 직전에 추가:
```tsx
{!streaming && finalFrame && prompt && (
  <div className="flex justify-end">
    <BookmarkButton prompt={prompt} frames={frames} />
  </div>
)}
```

### `frontend/src/components/chat/MessageList.tsx` 수정 사항

`messages.map((msg) =>` 를 `messages.map((msg, idx) =>` 로 바꾸고 assistant 메시지에 `prompt` 전달:

```tsx
{messages.map((msg, idx) =>
  msg.role === "user" ? (
    <div key={msg.id} className="flex justify-end">
      <div className="max-w-[72%] rounded-2xl bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-[0_10px_22px_-16px_rgba(25,25,25,0.72)]">
        {msg.content}
      </div>
    </div>
  ) : (
    <AssistantMessage
      key={msg.id}
      frames={msg.frames ?? []}
      prompt={messages[idx - 1]?.content}
    />
  )
)}
```

스트리밍 메시지는 기존처럼 `streaming` prop 만 전달하고 `prompt` 는 전달하지 않는다.

---

## 검증

```bash
cd frontend && npx tsc --noEmit
# 에러 없음
```

수동 확인:
1. `npm run dev` 실행
2. 채팅에서 질문 후 응답 완료 시 보관함 아이콘 표시 확인
3. 아이콘 클릭 시 `BookmarkCheck` 로 변경되는지 확인

---

## 수락 기준

- [ ] `frontend/src/lib/bookmarkClient.ts` 생성됨
- [ ] `frontend/src/components/bookmark/BookmarkButton.tsx` 생성됨
- [ ] `AssistantMessage.tsx` 에 `prompt` prop 추가됨
- [ ] `AssistantMessage.tsx` 에 BookmarkButton 렌더 조건 추가됨 (`!streaming && finalFrame && prompt`)
- [ ] `MessageList.tsx` 가 `(msg, idx)` 로 변경되고 `prompt` 를 전달함
- [ ] `npx tsc --noEmit` 에러 없음
