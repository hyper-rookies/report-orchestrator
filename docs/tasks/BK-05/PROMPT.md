# BK-05: /bookmarks/[id] detail page

## 목적

`frontend/src/app/(app)/bookmarks/[id]/page.tsx` 를 신규 생성한다. 저장된 보관함 응답 전체를 기존 `AssistantMessage` 컴포넌트로 렌더링한다.

---

## 전제 조건

- **BK-04 완료 필수.** 목록 페이지에서 카드 클릭으로 상세 페이지 진입이 가능해야 한다.

---

## 배경

- **설계 문서:** `docs/plans/2026-03-11-bookmarks-design.md` 의 4장을 읽고 시작할 것
- 현재 `AssistantMessage` 는 `frames` prop 만으로 차트, 테이블, Chart/Data 토글, CSV 다운로드를 모두 렌더링한다
- 상세 페이지에서는 `prompt` prop 을 전달하지 않으므로 보관함 저장 버튼은 다시 노출되지 않는다
- 데이터 로드는 `frontend/src/lib/bookmarkClient.ts` 의 `getBookmark(id)` 를 사용한다

---

## 대상 파일

| 파일 | 액션 |
|------|------|
| `frontend/src/app/(app)/bookmarks/[id]/page.tsx` | 신규 생성 |

---

## 구현 코드

### `frontend/src/app/(app)/bookmarks/[id]/page.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import AssistantMessage from "@/components/chat/AssistantMessage";
import { getBookmark } from "@/lib/bookmarkClient";
import type { BookmarkItem } from "@/types/bookmark";

export default function BookmarkDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<BookmarkItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    void getBookmark(id).then((data) => {
      if (!data) setNotFound(true);
      else setItem(data);
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        불러오는 중...
      </div>
    );
  }

  if (notFound || !item) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <p className="text-sm text-destructive">항목을 찾을 수 없습니다.</p>
        <button
          type="button"
          className="text-sm text-muted-foreground underline"
          onClick={() => router.push("/bookmarks")}
        >
          보관함으로 이동
        </button>
      </div>
    );
  }

  const dateLabel = new Date(item.createdAt).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-start gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="mt-0.5 shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <p className="text-xs text-muted-foreground">{dateLabel}</p>
            <p className="mt-1 text-sm font-medium text-foreground">{item.prompt}</p>
          </div>
        </div>

        <AssistantMessage frames={item.frames} />
      </div>
    </div>
  );
}
```

---

## 검증

```bash
cd frontend && npx tsc --noEmit && npx eslint src/
# 에러 없음
```

수동 확인:
1. 보관함 목록에서 카드 클릭 시 상세 페이지로 이동하는지 확인
2. 뒤로 가기 버튼이 이전 화면으로 복귀하는지 확인
3. 차트가 있는 항목은 Chart/Data 토글과 CSV 버튼까지 정상 렌더링되는지 확인

---

## 수락 기준

- [ ] `frontend/src/app/(app)/bookmarks/[id]/page.tsx` 생성됨
- [ ] 상세 페이지에서 `AssistantMessage` 로 저장된 frames 를 렌더링함
- [ ] 뒤로 가기 버튼 동작
- [ ] 항목이 없을 때 404 성격의 not found 처리
- [ ] `npx tsc --noEmit && npx eslint src/` 에러 없음
