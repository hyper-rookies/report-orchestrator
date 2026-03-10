"use client";

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Share2, Trash2, X } from "lucide-react";
import { useSessionContext } from "@/context/SessionContext";
import { cn } from "@/lib/utils";

interface SessionListItemProps {
  sessionId: string;
  title: string;
  isActive: boolean;
}

type MenuState = { open: false } | { open: true; x: number; y: number };

type ShareState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; url: string; expiresAt: string }
  | { status: "error"; message: string };

function formatExpiresAt(expiresAt: string): string {
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) {
    return expiresAt;
  }

  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date
    .getHours()
    .toString()
    .padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

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
  const [sharePosition, setSharePosition] = useState({ top: 0, left: 0, width: 320 });
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sharePanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEditValue(title);
  }, [title]);

  useEffect(() => {
    if (!menu.open) {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenu({ open: false });
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menu.open]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  useEffect(() => {
    if (shareState.status === "idle") {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (sharePanelRef.current?.contains(event.target as Node)) {
        return;
      }
      setShareState({ status: "idle" });
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShareState({ status: "idle" });
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [shareState.status]);

  const openMenu = (x: number, y: number) => {
    setMenu({ open: true, x, y });
  };

  const openSharePanel = (rect: DOMRect) => {
    const width = Math.min(320, Math.max(280, window.innerWidth - 24));
    const left = Math.min(
      Math.max(12, rect.right - width),
      window.innerWidth - width - 12
    );

    setSharePosition({
      top: rect.bottom + 8,
      left,
      width,
    });
  };

  const handleContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    openMenu(event.clientX, event.clientY);
  };

  const handleDotsClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
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
      try {
        await renameSession(sessionId, trimmed);
      } catch (error) {
        window.alert(
          error instanceof Error ? error.message : "세션 이름을 변경하지 못했습니다."
        );
        setEditValue(title);
      }
    } else {
      setEditValue(title);
    }
  };

  const handleShare = async (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();

    openSharePanel(rect);
    setMenu({ open: false });
    setShareState({ status: "loading" });

    try {
      const result = await shareSession(sessionId);
      setShareState({ status: "done", url: result.url, expiresAt: result.expiresAt });
    } catch (error) {
      setShareState({
        status: "error",
        message: error instanceof Error ? error.message : "세션 공유에 실패했습니다.",
      });
    }
  };

  const handleDelete = async () => {
    setMenu({ open: false });

    if (!window.confirm("이 세션을 삭제하시겠습니까?")) {
      return;
    }

    try {
      await deleteSession(sessionId);
      if (isActive) {
        router.push("/");
      }
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "세션을 삭제하지 못했습니다."
      );
    }
  };

  const handleCopy = async () => {
    if (shareState.status !== "done") {
      return;
    }

    try {
      await navigator.clipboard.writeText(shareState.url);
    } catch {
      setShareState({
        status: "error",
        message: "클립보드에 링크를 복사하지 못했습니다.",
      });
    }
  };

  return (
    <>
      <div
        className={cn(
          "group relative flex cursor-pointer items-center gap-1 rounded-lg px-2 py-2 text-sm transition-colors",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
        )}
        onClick={() => {
          if (!editing) {
            router.push(`/sessions/${sessionId}`);
          }
        }}
        onContextMenu={handleContextMenu}
      >
        <div className="flex-1 truncate">
          {editing ? (
            <input
              ref={inputRef}
              value={editValue}
              onChange={(event) => setEditValue(event.target.value)}
              onBlur={() => void handleRenameSubmit()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleRenameSubmit();
                }

                if (event.key === "Escape") {
                  setEditing(false);
                  setEditValue(title);
                }
              }}
              onClick={(event) => event.stopPropagation()}
              className="w-full rounded bg-transparent px-1 text-sm outline-none ring-1 ring-sidebar-primary"
            />
          ) : (
            <span
              className="block truncate"
              onDoubleClick={(event) => {
                event.stopPropagation();
                handleRename();
              }}
            >
              {title}
            </span>
          )}
        </div>

        {!editing && (
          <button
            type="button"
            className="invisible shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground group-hover:visible"
            onClick={handleDotsClick}
            aria-label="세션 메뉴 열기"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        )}

        {menu.open && (
          <div
            ref={menuRef}
            className="fixed z-50 w-44 rounded-lg border bg-card p-1 shadow-lg"
            style={{ left: menu.x, top: menu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
              onClick={handleRename}
            >
              <Pencil className="h-3.5 w-3.5" />
              이름 변경
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
              onClick={(event) => void handleShare(event)}
            >
              <Share2 className="h-3.5 w-3.5" />
              공유하기
            </button>
            <div className="my-1 border-t" />
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
              onClick={() => void handleDelete()}
            >
              <Trash2 className="h-3.5 w-3.5" />
              삭제하기
            </button>
          </div>
        )}
      </div>

      {shareState.status !== "idle" &&
        createPortal(
          <div
            ref={sharePanelRef}
            className="fixed z-[140] rounded-xl border bg-card p-4 shadow-lg"
            style={{
              top: sharePosition.top,
              left: sharePosition.left,
              width: sharePosition.width,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">세션 공유</p>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setShareState({ status: "idle" })}
                aria-label="공유 패널 닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {shareState.status === "loading" && (
              <p className="text-sm text-muted-foreground">링크 생성 중...</p>
            )}

            {shareState.status === "error" && (
              <p className="text-sm text-destructive">{shareState.message}</p>
            )}

            {shareState.status === "done" && (
              <div className="space-y-3">
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/30">
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    이 공유 링크는 <strong>{formatExpiresAt(shareState.expiresAt)}</strong>에
                    만료됩니다. (7일)
                  </p>
                </div>

                <div className="flex gap-2">
                  <input
                    readOnly
                    value={shareState.url}
                    className="flex-1 rounded border bg-muted px-2 py-1 text-xs font-mono"
                    onClick={(event) => (event.target as HTMLInputElement).select()}
                  />
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-xs hover:bg-accent"
                    onClick={() => void handleCopy()}
                  >
                    복사
                  </button>
                </div>
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
