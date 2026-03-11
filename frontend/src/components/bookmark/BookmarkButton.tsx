"use client";

import { useState } from "react";
import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";

import type { SseFrame } from "@/hooks/useSse";
import { saveBookmark } from "@/lib/bookmarkClient";

interface Props {
  prompt: string;
  frames: SseFrame[];
}

export default function BookmarkButton({ prompt, frames }: Props) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (saved || saving) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await saveBookmark(prompt, frames);
      setSaved(true);
    } catch (saveError) {
      setError(
        saveError instanceof Error && saveError.message.trim().length > 0
          ? saveError.message
          : "보관함 저장에 실패했습니다. 다시 시도해 주세요."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saved || saving}
        aria-label={saved ? "보관함에 저장됨" : "보관함에 저장"}
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
      {error && (
        <p role="status" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
