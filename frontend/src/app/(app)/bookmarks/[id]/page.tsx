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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void getBookmark(id)
      .then((data) => {
        if (!active) {
          return;
        }

        if (!data) {
          setNotFound(true);
          setItem(null);
          return;
        }

        setItem(data);
        setNotFound(false);
        setError(null);
      })
      .catch((loadError) => {
        if (!active) {
          return;
        }

        setError(
          loadError instanceof Error && loadError.message.trim().length > 0
            ? loadError.message
            : "보관함 항목을 불러오지 못했습니다."
        );
        setItem(null);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [id]);

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/bookmarks");
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        불러오는 중...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-6">
        <div className="nhn-panel flex max-w-md flex-col items-center gap-3 px-6 py-8 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <button
            type="button"
            className="text-sm text-muted-foreground underline"
            onClick={() => router.push("/bookmarks")}
          >
            보관함으로 이동
          </button>
        </div>
      </div>
    );
  }

  if (notFound || !item) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-6">
        <div className="nhn-panel flex max-w-md flex-col items-center gap-3 px-6 py-8 text-center">
          <p className="text-sm text-destructive">항목을 찾을 수 없습니다.</p>
          <button
            type="button"
            className="text-sm text-muted-foreground underline"
            onClick={() => router.push("/bookmarks")}
          >
            보관함으로 이동
          </button>
        </div>
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
            onClick={handleBack}
            className="mt-0.5 shrink-0 rounded p-1 text-muted-foreground transition hover:text-foreground"
            aria-label="이전 화면으로 이동"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{dateLabel}</p>
            <p className="mt-1 text-sm font-medium text-foreground">{item.prompt}</p>
          </div>
        </div>

        <AssistantMessage frames={item.frames} />
      </div>
    </div>
  );
}
