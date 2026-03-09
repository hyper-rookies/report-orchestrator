"use client";

import { useState } from "react";
import { Check, Copy, Share2, X } from "lucide-react";
import type { WeekRange } from "@/components/dashboard/WeekSelector";
import { Button } from "@/components/ui/button";

interface ShareButtonProps {
  selectedRange: WeekRange;
}

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

  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

export default function ShareButton({ selectedRange }: ShareButtonProps) {
  const [state, setState] = useState<ShareState>({ status: "idle" });
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const handleShare = async () => {
    if (state.status === "done") {
      setOpen(true);
      return;
    }

    setCopied(false);
    setState({ status: "loading" });
    setOpen(true);

    try {
      const response = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart: selectedRange.start,
          weekEnd: selectedRange.end,
          weekLabel: selectedRange.label,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as { url: string; expiresAt: string };
      setState({ status: "done", url: data.url, expiresAt: data.expiresAt });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "공유 링크 생성에 실패했습니다.",
      });
    }
  };

  const handleCopy = async () => {
    if (state.status !== "done") {
      return;
    }

    try {
      await navigator.clipboard.writeText(state.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setState({ status: "error", message: "클립보드에 링크를 복사하지 못했습니다." });
    }
  };

  const expiresLabel = state.status === "done" ? formatExpiresAt(state.expiresAt) : "";

  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={handleShare} className="gap-1.5">
        <Share2 className="h-3.5 w-3.5" />
        공유
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 space-y-3 rounded-lg border bg-card p-4 shadow-lg">
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="공유 모달 닫기"
            className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>

          <p className="text-sm font-semibold">링크 공유</p>

          {state.status === "loading" && (
            <p className="text-sm text-muted-foreground">링크 생성 중...</p>
          )}

          {state.status === "error" && (
            <p className="text-sm text-destructive">{state.message}</p>
          )}

          {state.status === "done" && (
            <>
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/30">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  이 공유 링크는 <strong>{expiresLabel}</strong>에 만료됩니다 (7일).
                  <br />
                  로그인 없이 누구나 조회할 수 있습니다.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={state.url}
                  className="flex-1 select-all rounded-md border bg-muted px-2 py-1 text-xs font-mono text-muted-foreground"
                  onClick={(event) => (event.target as HTMLInputElement).select()}
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={handleCopy}
                  aria-label="공유 링크 복사"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>

              {copied && <p className="text-right text-xs text-green-600">링크가 복사되었습니다.</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
