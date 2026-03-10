# Bookmarks (보관함) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a personal bookmark library where users can save any chat response (prompt + SSE frames) to S3, browse saved items as a card grid, and view full responses including charts and tables.

**Architecture:** Follows the existing session storage pattern exactly — a per-user S3 index (`bookmarks/{sub}/index.json`) holds lightweight metadata for list rendering, and per-item JSON files (`bookmarks/{sub}/{id}.json`) hold full `SseFrame[]` data for detail view. A `bookmarkS3.ts` helper mirrors `sessionS3.ts`. A `BookmarkButton` component is embedded in `AssistantMessage` after streaming completes, sending a `POST /api/bookmarks` call. The `/bookmarks` listing page renders a `BookmarkCard` grid (icon + prompt excerpt + date), and the `/bookmarks/[id]` detail page reuses the existing `AssistantMessage` component with stored frames.

**Tech Stack:** Next.js 15 App Router (API routes + pages), AWS S3 via `@aws-sdk/client-s3`, TypeScript, Tailwind CSS, shadcn/ui, lucide-react, `node:assert` for unit tests.

---

## File Structure

```
NEW
  frontend/src/types/bookmark.ts                     — BookmarkMeta, BookmarkItem types
  frontend/src/lib/bookmarkS3.ts                     — S3 CRUD helpers (mirrors sessionS3.ts)
  frontend/src/lib/bookmarkClient.ts                 — Client-side fetch helpers with auth
  frontend/src/app/api/bookmarks/route.ts            — GET list + POST create
  frontend/src/app/api/bookmarks/[id]/route.ts       — GET detail + DELETE
  frontend/src/components/bookmark/BookmarkButton.tsx — Save-to-bookmark button
  frontend/src/components/bookmark/BookmarkCard.tsx  — Thumbnail card for grid
  frontend/src/app/(app)/bookmarks/page.tsx          — /bookmarks listing page
  frontend/src/app/(app)/bookmarks/[id]/page.tsx     — /bookmarks/[id] detail page

MODIFY
  frontend/src/components/chat/AssistantMessage.tsx  — add prompt prop + BookmarkButton
  frontend/src/components/chat/MessageList.tsx       — pass prompt to AssistantMessage
  frontend/src/components/layout/Sidebar.tsx         — add 보관함 nav link
```

---

## Chunk 1: Backend (Types, S3, API Routes)

### Task BK-01: Types + S3 persistence layer

**Files:**
- Create: `frontend/src/types/bookmark.ts`
- Create: `frontend/src/lib/bookmarkS3.ts`
- Test: `frontend/src/lib/bookmarkS3.test.ts`

- [ ] **Step 1: Create types**

```typescript
// frontend/src/types/bookmark.ts
import type { SseFrame } from "@/hooks/useSse";

export interface BookmarkMeta {
  bookmarkId: string;
  title: string;          // first 60 chars of prompt
  prompt: string;
  previewType: "chart" | "table" | "text";
  chartType?: string;     // "pie" | "bar" | "line" | "stackedBar" etc.
  createdAt: string;      // ISO 8601
}

export interface BookmarkItem extends BookmarkMeta {
  frames: SseFrame[];
}
```

- [ ] **Step 2: Create S3 helpers**

```typescript
// frontend/src/lib/bookmarkS3.ts
import { hasSessionBucket, s3Delete, s3GetJson, s3PutJson } from "@/lib/sessionS3";
import type { BookmarkItem, BookmarkMeta } from "@/types/bookmark";

export { hasSessionBucket };

export const bookmarkIndexKey = (sub: string) => `bookmarks/${sub}/index.json`;
export const bookmarkItemKey = (sub: string, id: string) => `bookmarks/${sub}/${id}.json`;

export async function listBookmarks(sub: string): Promise<BookmarkMeta[]> {
  const index = await s3GetJson<BookmarkMeta[]>(bookmarkIndexKey(sub));
  return (index ?? []).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function saveBookmark(sub: string, item: BookmarkItem): Promise<void> {
  await s3PutJson(bookmarkItemKey(sub, item.bookmarkId), item);
  const index = await s3GetJson<BookmarkMeta[]>(bookmarkIndexKey(sub)) ?? [];
  const meta: BookmarkMeta = {
    bookmarkId: item.bookmarkId,
    title: item.title,
    prompt: item.prompt,
    previewType: item.previewType,
    chartType: item.chartType,
    createdAt: item.createdAt,
  };
  await s3PutJson(bookmarkIndexKey(sub), [
    ...index.filter((b) => b.bookmarkId !== item.bookmarkId),
    meta,
  ]);
}

export async function getBookmarkItem(sub: string, id: string): Promise<BookmarkItem | null> {
  return s3GetJson<BookmarkItem>(bookmarkItemKey(sub, id));
}

export async function deleteBookmark(sub: string, id: string): Promise<void> {
  await s3Delete(bookmarkItemKey(sub, id));
  const index = await s3GetJson<BookmarkMeta[]>(bookmarkIndexKey(sub)) ?? [];
  await s3PutJson(
    bookmarkIndexKey(sub),
    index.filter((b) => b.bookmarkId !== id)
  );
}
```

- [ ] **Step 3: Write failing test**

```typescript
// frontend/src/lib/bookmarkS3.test.ts
import assert from "node:assert/strict";
import { bookmarkIndexKey, bookmarkItemKey } from "./bookmarkS3.js";

// key generation tests (no S3 needed)
assert.equal(bookmarkIndexKey("user-1"), "bookmarks/user-1/index.json");
assert.equal(bookmarkItemKey("user-1", "bk-abc"), "bookmarks/user-1/bk-abc.json");

console.log("bookmarkS3 key tests passed");
```

- [ ] **Step 4: Run test**

```bash
cd frontend
node --experimental-strip-types src/lib/bookmarkS3.test.ts
```

Expected: `bookmarkS3 key tests passed`

- [ ] **Step 5: Run tsc**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types/bookmark.ts frontend/src/lib/bookmarkS3.ts frontend/src/lib/bookmarkS3.test.ts
git commit -m "feat(bookmarks): add types and S3 persistence helpers"
```

---

### Task BK-02: API routes

**Files:**
- Create: `frontend/src/app/api/bookmarks/route.ts`
- Create: `frontend/src/app/api/bookmarks/[id]/route.ts`

- [ ] **Step 1: Create collection route (GET list + POST create)**

```typescript
// frontend/src/app/api/bookmarks/route.ts
import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getUserSub } from "@/lib/sessionAuth";
import { hasSessionBucket, listBookmarks, saveBookmark } from "@/lib/bookmarkS3";
import type { BookmarkItem } from "@/types/bookmark";
import type { SseFrame } from "@/hooks/useSse";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sub = getUserSub(req);
  if (!sub) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasSessionBucket()) return NextResponse.json([]);

  const list = await listBookmarks(sub);
  return NextResponse.json(list);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const sub = getUserSub(req);
  if (!sub) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasSessionBucket()) {
    return NextResponse.json({ error: "Storage unavailable" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { prompt, frames } = body as { prompt?: unknown; frames?: unknown };
  if (typeof prompt !== "string" || !Array.isArray(frames)) {
    return NextResponse.json({ error: "prompt and frames are required" }, { status: 400 });
  }

  const chartFrame = (frames as SseFrame[]).findLast((f) => f.type === "chart");
  const tableFrame = (frames as SseFrame[]).findLast((f) => f.type === "table");
  const rawSpec = chartFrame?.data.spec as Record<string, unknown> | undefined;

  const previewType: BookmarkItem["previewType"] = chartFrame ? "chart" : tableFrame ? "table" : "text";
  const chartType = typeof rawSpec?.type === "string" ? rawSpec.type : undefined;

  const item: BookmarkItem = {
    bookmarkId: nanoid(),
    title: prompt.slice(0, 60),
    prompt,
    previewType,
    chartType,
    createdAt: new Date().toISOString(),
    frames: frames as SseFrame[],
  };

  await saveBookmark(sub, item);
  return NextResponse.json({ bookmarkId: item.bookmarkId }, { status: 201 });
}
```

- [ ] **Step 2: Install nanoid (if not present)**

```bash
cd frontend && grep '"nanoid"' package.json || npm install nanoid
```

> Note: Check if `nanoid` is already a dependency (sessions use `crypto.randomUUID()` instead). If missing, install it. Alternatively, replace `nanoid()` with `crypto.randomUUID()` — both work.

- [ ] **Step 3: Create item route (GET detail + DELETE)**

```typescript
// frontend/src/app/api/bookmarks/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getUserSub } from "@/lib/sessionAuth";
import { deleteBookmark, getBookmarkItem, hasSessionBucket } from "@/lib/bookmarkS3";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const sub = getUserSub(req);
  if (!sub) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasSessionBucket()) {
    return NextResponse.json({ error: "Storage unavailable" }, { status: 503 });
  }

  const { id } = await params;
  const item = await getBookmarkItem(sub, id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(item);
}

export async function DELETE(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const sub = getUserSub(req);
  if (!sub) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasSessionBucket()) {
    return NextResponse.json({ error: "Storage unavailable" }, { status: 503 });
  }

  const { id } = await params;
  await deleteBookmark(sub, id);
  return NextResponse.json({ deleted: id });
}
```

- [ ] **Step 4: Run tsc**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/bookmarks/
git commit -m "feat(bookmarks): add API routes GET/POST list and GET/DELETE item"
```

---

## Chunk 2: Frontend Integration

### Task BK-03: BookmarkButton + AssistantMessage integration

**Files:**
- Create: `frontend/src/lib/bookmarkClient.ts`
- Create: `frontend/src/components/bookmark/BookmarkButton.tsx`
- Modify: `frontend/src/components/chat/AssistantMessage.tsx`
- Modify: `frontend/src/components/chat/MessageList.tsx`

- [ ] **Step 1: Create client-side fetch helper**

```typescript
// frontend/src/lib/bookmarkClient.ts
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

- [ ] **Step 2: Create BookmarkButton component**

```tsx
// frontend/src/components/bookmark/BookmarkButton.tsx
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
      // silent fail — user can retry
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

- [ ] **Step 3: Add prompt prop + BookmarkButton to AssistantMessage**

Open `frontend/src/components/chat/AssistantMessage.tsx`.

Add `prompt?: string` to the `Props` interface:
```typescript
interface Props {
  frames: SseFrame[];
  streaming?: boolean;
  prompt?: string;        // ← add this
}
```

Add import at top:
```typescript
import BookmarkButton from "@/components/bookmark/BookmarkButton";
```

Update function signature:
```typescript
export default function AssistantMessage({ frames, streaming, prompt }: Props) {
```

Add the bookmark button after the existing error block, just before closing the inner `div`:
```tsx
        {/* bookmark button — only after streaming completes */}
        {!streaming && finalFrame && prompt && (
          <div className="flex justify-end">
            <BookmarkButton prompt={prompt} frames={frames} />
          </div>
        )}
```

- [ ] **Step 4: Pass prompt from MessageList**

Open `frontend/src/components/chat/MessageList.tsx`.

Change the `.map()` callback from `(msg)` to `(msg, idx)` and pass the preceding user message content as `prompt`:
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

The streaming message row does not need `prompt` (button is hidden when `streaming` is true).

- [ ] **Step 5: Run tsc**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 6: Manual smoke test**
1. Run `npm run dev`
2. Ask a question in chat; wait for response with a chart
3. Verify bookmark icon appears bottom-right of the response after streaming ends
4. Click icon — it should turn into a filled checkmark
5. No console errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/bookmarkClient.ts \
        frontend/src/components/bookmark/BookmarkButton.tsx \
        frontend/src/components/chat/AssistantMessage.tsx \
        frontend/src/components/chat/MessageList.tsx
git commit -m "feat(bookmarks): add save button to chat responses"
```

---

### Task BK-04: Listing page + BookmarkCard + Sidebar nav

**Files:**
- Create: `frontend/src/components/bookmark/BookmarkCard.tsx`
- Create: `frontend/src/app/(app)/bookmarks/page.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Create BookmarkCard**

```tsx
// frontend/src/components/bookmark/BookmarkCard.tsx
import Link from "next/link";
import { BarChart2, PieChart, Table2, MessageSquare, Trash2 } from "lucide-react";
import type { BookmarkMeta } from "@/types/bookmark";

const CHART_ICONS: Record<string, React.ElementType> = {
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
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="nhn-panel group relative flex flex-col gap-3 p-4 transition hover:border-primary/30">
      {/* thumbnail area */}
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

      {/* delete button */}
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); onDelete(meta.bookmarkId); }}
        className="absolute right-2 top-2 hidden rounded p-1 text-muted-foreground hover:text-destructive group-hover:flex"
        title="삭제"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create listing page**

```tsx
// frontend/src/app/(app)/bookmarks/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Bookmark } from "lucide-react";
import { deleteBookmark, listBookmarks } from "@/lib/bookmarkClient";
import type { BookmarkMeta } from "@/types/bookmark";
import BookmarkCard from "@/components/bookmark/BookmarkCard";

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
        불러오는 중…
      </div>
    );
  }

  if (bookmarks.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <Bookmark className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          채팅 답변의 북마크 아이콘을 눌러 저장해보세요.
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

- [ ] **Step 3: Add 보관함 to Sidebar nav**

Open `frontend/src/components/layout/Sidebar.tsx`.

Add `Bookmark` to the imports:
```typescript
import { Bookmark, LayoutDashboard, MessageSquare, Plus } from "lucide-react";
```

Add to `NAV_ITEMS`:
```typescript
const NAV_ITEMS = [
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/", label: "AI 채팅", icon: MessageSquare },
  { href: "/bookmarks", label: "보관함", icon: Bookmark },
];
```

- [ ] **Step 4: Run tsc**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Manual smoke test**
1. Save a bookmark from chat (BK-03)
2. Navigate to `/bookmarks` via sidebar link
3. Verify card grid appears with correct prompt text + chart type badge + date
4. Hover card — verify delete button appears
5. Click delete — verify card disappears from grid

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/bookmark/BookmarkCard.tsx \
        frontend/src/app/\(app\)/bookmarks/page.tsx \
        frontend/src/components/layout/Sidebar.tsx
git commit -m "feat(bookmarks): add listing page with card grid and sidebar nav"
```

---

### Task BK-05: Detail page

**Files:**
- Create: `frontend/src/app/(app)/bookmarks/[id]/page.tsx`

- [ ] **Step 1: Create detail page**

```tsx
// frontend/src/app/(app)/bookmarks/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getBookmark } from "@/lib/bookmarkClient";
import type { BookmarkItem } from "@/types/bookmark";
import AssistantMessage from "@/components/chat/AssistantMessage";

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
        불러오는 중…
      </div>
    );
  }

  if (notFound || !item) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <p className="text-sm text-destructive">항목을 찾을 수 없습니다.</p>
        <button className="text-sm underline text-muted-foreground" onClick={() => router.push("/bookmarks")}>
          보관함으로
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
        {/* header */}
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

        {/* reuse AssistantMessage — renders chart, table, summary, CSV, toggle */}
        <AssistantMessage frames={item.frames} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run tsc**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Manual smoke test**
1. From `/bookmarks` grid, click a card
2. Verify detail page loads: back button, prompt text, date, full AssistantMessage output
3. If bookmark had a chart: verify Chart/Data toggle and CSV download work
4. Click back — returns to grid

- [ ] **Step 4: Final tsc + lint**

```bash
cd frontend && npx tsc --noEmit && npx eslint src/
```

Expected: no errors, no lint warnings

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/\(app\)/bookmarks/
git commit -m "feat(bookmarks): add detail page with full response view"
```

---

## Summary

| Task | Files | Key output |
|------|-------|-----------|
| BK-01 | `types/bookmark.ts`, `lib/bookmarkS3.ts` | S3 CRUD layer |
| BK-02 | `api/bookmarks/route.ts`, `[id]/route.ts` | REST API |
| BK-03 | `BookmarkButton.tsx`, `AssistantMessage.tsx`, `MessageList.tsx` | Save button in chat |
| BK-04 | `BookmarkCard.tsx`, `bookmarks/page.tsx`, `Sidebar.tsx` | Grid listing + nav |
| BK-05 | `bookmarks/[id]/page.tsx` | Full detail view |

**Verification after all tasks:**
```bash
cd frontend && npx tsc --noEmit && npx eslint src/
```
