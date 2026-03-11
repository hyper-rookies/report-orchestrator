"use client";

import { useEffect, useState } from "react";
import { Bookmark } from "lucide-react";

import BookmarkCard from "@/components/bookmark/BookmarkCard";
import { deleteBookmark, listBookmarks } from "@/lib/bookmarkClient";
import type { BookmarkMeta } from "@/types/bookmark";

export default function BookmarksPage() {
  const [bookmarks, setBookmarks] = useState<BookmarkMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingBookmarkId, setDeletingBookmarkId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void listBookmarks()
      .then((list) => {
        if (!active) {
          return;
        }
        setBookmarks(list);
        setError(null);
      })
      .catch((listError) => {
        if (!active) {
          return;
        }
        setError(
          listError instanceof Error && listError.message.trim().length > 0
            ? listError.message
            : "보관함을 불러오지 못했습니다."
        );
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const handleDelete = async (id: string) => {
    if (deletingBookmarkId) {
      return;
    }

    setDeletingBookmarkId(id);
    setError(null);

    try {
      await deleteBookmark(id);
      setBookmarks((prev) => prev.filter((bookmark) => bookmark.bookmarkId !== id));
    } catch (deleteError) {
      setError(
        deleteError instanceof Error && deleteError.message.trim().length > 0
          ? deleteError.message
          : "보관함 삭제에 실패했습니다."
      );
    } finally {
      setDeletingBookmarkId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        불러오는 중...
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-semibold text-foreground">보관함</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              저장한 AI 응답을 다시 열고 관리할 수 있습니다.
            </p>
          </div>
          <div className="rounded-full border border-border/80 bg-card/80 px-3 py-1 text-xs text-muted-foreground">
            {bookmarks.length} items
          </div>
        </div>

        {error && (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {bookmarks.length === 0 ? (
          <div className="nhn-panel flex min-h-72 flex-col items-center justify-center gap-3 px-6 text-center">
            <Bookmark className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              채팅 응답의 보관함 아이콘을 눌러 저장해보세요.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {bookmarks.map((meta) => (
              <BookmarkCard
                key={meta.bookmarkId}
                meta={meta}
                deleting={deletingBookmarkId === meta.bookmarkId}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
