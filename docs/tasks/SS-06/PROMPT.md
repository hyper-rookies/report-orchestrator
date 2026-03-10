# SS-06: SessionListItem 컴포넌트

**전제 조건:** SS-05가 `"done"` 상태여야 한다.

## 작업 개요

`frontend/src/components/layout/SessionListItem.tsx`를 생성한다.
**다른 파일은 수정하지 않는다.**

## 생성할 파일

- `frontend/src/components/layout/SessionListItem.tsx`

---

## 구현 코드

### `frontend/src/components/layout/SessionListItem.tsx`

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Share2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSessionContext } from "@/context/SessionContext";

interface SessionListItemProps {
  sessionId: string;
  title: string;
  isActive: boolean;
}

type MenuState =
  | { open: false }
  | { open: true; x: number; y: number };

type ShareState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; url: string; expiresAt: string }
  | { status: "error"; message: string };

export default function SessionListItem({
  sessionId,
  title,
  isActive,
}: SessionListItemProps) {
  const router = useRouter();
  const { renameSession, deleteSession, shareSession } = useSessionContext();
  const [menu, setMenu] = useState<MenuState>({ open: false });
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(title);
  const [shareState, setShareState] = useState<ShareState>({ status: "idle" });
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menu.open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu({ open: false });
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menu.open]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const openMenu = (x: number, y: number) => setMenu({ open: true, x, y });

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    openMenu(e.clientX, e.clientY);
  };

  const handleDotsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    openMenu(rect.left, rect.bottom + 4);
  };

  const handleRename = () => {
    setMenu({ open: false });
    setEditing(true);
    setEditValue(title);
  };

  const handleRenameSubmit = async () => {
    const trimmed = editValue.trim();
    setEditing(false);
    if (trimmed && trimmed !== title) {
      await renameSession(sessionId, trimmed);
    }
  };

  const handleShare = async () => {
    setMenu({ open: false });
    setShareState({ status: "loading" });
    try {
      const result = await shareSession(sessionId);
      setShareState({ status: "done", url: result.url, expiresAt: result.expiresAt });
    } catch (err) {
      setShareState({
        status: "error",
        message: err instanceof Error ? err.message : "공유 실패",
      });
    }
  };

  const handleDelete = async () => {
    setMenu({ open: false });
    if (!confirm("이 대화를 삭제하시겠습니까?")) return;
    await deleteSession(sessionId);
    if (isActive) router.push("/");
  };

  return (
    <div
      className={cn(
        "group relative flex items-center gap-1 rounded-lg px-2 py-2 text-sm transition-colors cursor-pointer",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
      )}
      onClick={() => !editing && router.push(`/sessions/${sessionId}`)}
      onContextMenu={handleContextMenu}
    >
      <div className="flex-1 truncate">
        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleRenameSubmit();
              if (e.key === "Escape") setEditing(false);
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded bg-transparent text-sm outline-none ring-1 ring-sidebar-primary px-1"
          />
        ) : (
          <span
            className="block truncate"
            onDoubleClick={(e) => {
              e.stopPropagation();
              handleRename();
            }}
          >
            {title}
          </span>
        )}
      </div>

      {!editing && (
        <button
          className="invisible shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground group-hover:visible"
          onClick={handleDotsClick}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      )}

      {menu.open && (
        <div
          ref={menuRef}
          className="fixed z-50 w-44 rounded-lg border bg-card p-1 shadow-lg"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
            onClick={handleRename}
          >
            <Pencil className="h-3.5 w-3.5" />
            이름 변경하기
          </button>
          <button
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
            onClick={handleShare}
          >
            <Share2 className="h-3.5 w-3.5" />
            공유하기
          </button>
          <div className="my-1 border-t" />
          <button
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
            onClick={handleDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
            대화 삭제하기
          </button>
        </div>
      )}

      {shareState.status !== "idle" && (
        <div
          className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border bg-card p-4 shadow-lg space-y-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">대화 공유</p>
            <button
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setShareState({ status: "idle" })}
            >
              ✕
            </button>
          </div>
          {shareState.status === "loading" && (
            <p className="text-sm text-muted-foreground">링크 생성 중...</p>
          )}
          {shareState.status === "error" && (
            <p className="text-sm text-destructive">{shareState.message}</p>
          )}
          {shareState.status === "done" && (
            <>
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  ⚠️ 이 링크는{" "}
                  <strong>
                    {(() => {
                      const d = new Date(shareState.expiresAt);
                      return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
                    })()}
                  </strong>
                  에 만료됩니다 (7일).
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={shareState.url}
                  className="flex-1 rounded border bg-muted px-2 py-1 text-xs font-mono"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button
                  className="rounded border px-2 py-1 text-xs hover:bg-accent"
                  onClick={() => void navigator.clipboard.writeText((shareState as { url: string }).url)}
                >
                  복사
                </button>
              </div>
            </>
          )}
        </div>
      )}
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

- [ ] `SessionListItem.tsx` 생성됨
- [ ] 점3개 버튼: hover 시 표시, 클릭 시 메뉴 열림
- [ ] 우클릭(`onContextMenu`): 같은 메뉴 열림
- [ ] 더블클릭: 인플레이스 편집 (Enter/blur 저장, Escape 취소)
- [ ] 메뉴 항목: ✏️ 이름변경 / 🔗 공유 / 🗑️ 대화삭제 (삭제는 text-destructive)
- [ ] 공유 성공 시: 토스트에 URL + 만료일 + 복사 버튼
- [ ] 삭제 후 활성 세션이면 `/`로 이동
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

## 완료 후 할 일

1. `docs/tasks/SS-06/REPORT.md` 채우기
2. `docs/tasks/status.json`에서 SS-06 status → `"done"` 또는 `"blocked"`
3. `git add frontend/src/components/layout/SessionListItem.tsx docs/tasks/SS-06/REPORT.md docs/tasks/status.json`
4. `git commit -m "feat(sessions): add SessionListItem with context menu and share toast (SS-06)"`
