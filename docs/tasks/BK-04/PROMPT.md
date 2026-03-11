# BK-04: /bookmarks listing page + BookmarkCard + Sidebar link

## 목적

보관함 카드 목록 페이지를 만들고 사이드바에 진입 링크를 추가한다.
- `frontend/src/components/bookmark/BookmarkCard.tsx` - 목록 카드
- `frontend/src/app/(app)/bookmarks/page.tsx` - 보관함 목록 페이지
- `frontend/src/components/layout/Sidebar.tsx` - "보관함" nav 추가

---

## 전제 조건

- **BK-03 완료 필수.** `bookmarkClient.ts` 가 존재해야 한다.

---

## 배경

- **설계 문서:** `docs/plans/2026-03-11-bookmarks-design.md` 의 4장을 읽고 시작할 것
- **참조 구현:** `frontend/src/components/layout/Sidebar.tsx` 의 `NAV_ITEMS` 구조
- UI 는 현재 프로젝트에서 사용하는 `nhn-panel` 및 Tailwind 유틸리티를 따른다
- 카드에는 아이콘, prompt 일부, 생성일만 노출한다. 차트 미리보기는 MVP 범위 밖이다

---

## 대상 파일

| 파일 | 액션 |
|------|------|
| `frontend/src/components/bookmark/BookmarkCard.tsx` | 신규 생성 |
| `frontend/src/app/(app)/bookmarks/page.tsx` | 신규 생성 |
| `frontend/src/components/layout/Sidebar.tsx` | 수정 |

---

## 구현 코드

### `frontend/src/components/bookmark/BookmarkCard.tsx`

```tsx
import type { ElementType } from "react";
import Link from "next/link";
import { BarChart2, MessageSquare, PieChart, Table2, Trash2 } from "lucide-react";
import type { BookmarkMeta } from "@/types/bookmark";

const CHART_ICONS: Record<string, ElementType> = {
  pie: PieChart,
  bar: BarChart2,
  stackedBar: BarChart2,
  line: BarChart2,
};

interface Props {
  meta: BookmarkMeta;
  onDelete: (id: string) => void;
}

export default function BookmarkCard({ meta, onDelete }: Props) {
  const Icon =
    meta.previewType === "chart"
      ? (CHART_ICONS[meta.chartType ?? ""] ?? BarChart2)
      : meta.previewType === "table"
        ? Table2
        : MessageSquare;

  const dateLabel = new Date(meta.createdAt).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="nhn-panel group relative flex flex-col gap-3 p-4 transition hover:border-primary/30">
      <Link href={`/bookmarks/${meta.bookmarkId}`} className="flex flex-1 flex-col gap-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-5 w-5 shrink-0" />
          {meta.chartType && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
              {meta.chartType}
            </span>
          )}
        </div>
        <p className="line-clamp-3 flex-1 text-sm text-foreground">{meta.prompt}</p>
        <p className="text-xs text-muted-foreground">{dateLabel}</p>
      </Link>

      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          onDelete(meta.bookmarkId);
        }}
        className="absolute right-2 top-2 hidden rounded p-1 text-muted-foreground hover:text-destructive group-hover:flex"
        title="삭제"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
```

### `frontend/src/app/(app)/bookmarks/page.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import { Bookmark } from "lucide-react";
import BookmarkCard from "@/components/bookmark/BookmarkCard";
import { deleteBookmark, listBookmarks } from "@/lib/bookmarkClient";
import type { BookmarkMeta } from "@/types/bookmark";

export default function BookmarksPage() {
  const [bookmarks, setBookmarks] = useState<BookmarkMeta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void listBookmarks().then((list) => {
      setBookmarks(list);
      setLoading(false);
    });
  }, []);

  const handleDelete = async (id: string) => {
    await deleteBookmark(id).catch(() => {});
    setBookmarks((prev) => prev.filter((b) => b.bookmarkId !== id));
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        불러오는 중...
      </div>
    );
  }

  if (bookmarks.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <Bookmark className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          채팅 응답의 보관함 아이콘을 눌러 저장해보세요.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-5 text-base font-semibold text-foreground">보관함</h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {bookmarks.map((meta) => (
            <BookmarkCard key={meta.bookmarkId} meta={meta} onDelete={handleDelete} />
          ))}
        </div>
      </div>
    </div>
  );
}
```

### `frontend/src/components/layout/Sidebar.tsx` 수정 사항

1. `Bookmark` import 추가:
```typescript
import { Bookmark, LayoutDashboard, MessageSquare, Plus } from "lucide-react";
```

2. `NAV_ITEMS` 에 보관함 항목 추가:
```typescript
const NAV_ITEMS = [
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/", label: "AI 채팅", icon: MessageSquare },
  { href: "/bookmarks", label: "보관함", icon: Bookmark },
];
```

---

## 검증

```bash
cd frontend && npx tsc --noEmit
# 에러 없음
```

수동 확인:
1. 사이드바에 "보관함" 링크가 표시되는지 확인
2. `/bookmarks` 진입 시 빈 상태 메시지 확인
3. BK-03 에서 저장한 항목이 카드로 나타나는지 확인
4. 카드 hover 시 삭제 버튼이 표시되고 삭제가 되는지 확인

---

## 수락 기준

- [ ] `frontend/src/components/bookmark/BookmarkCard.tsx` 생성됨
- [ ] `frontend/src/app/(app)/bookmarks/page.tsx` 생성됨
- [ ] `Sidebar.tsx` 에 "보관함" nav link 추가됨
- [ ] `npx tsc --noEmit` 에러 없음
