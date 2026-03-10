"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Share2 } from "lucide-react";
import type { WeekRange } from "@/components/dashboard/WeekSelector";
import { Button } from "@/components/ui/button";
import { formatShareExpiry, isShareLinkReusable } from "@/lib/shareExpiry";
import { formatWeekRangeLabel } from "@/lib/weekRangeLabel";

interface ShareButtonProps {
  selectedRange: WeekRange;
}

type ShareState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; url: string; expiresAt: string }
  | { status: "error"; message: string };

export default function ShareButton({ selectedRange }: ShareButtonProps) {
  const [state, setState] = useState<ShareState>({ status: "idle" });
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 360 });
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setState({ status: "idle" });
    setCopied(false);
    setOpen(false);
  }, [selectedRange.start, selectedRange.end, selectedRange.label]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const width = Math.min(360, Math.max(280, window.innerWidth - 24));
      const left = Math.min(
        Math.max(12, rect.right - width),
        window.innerWidth - width - 12
      );

      setPosition({
        top: rect.bottom + 8,
        left,
        width,
      });
    };

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const handleShare = async () => {
    if (state.status === "done") {
      if (isShareLinkReusable(state.expiresAt)) {
        setOpen(true);
        return;
      }

      setState({ status: "idle" });
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
        const errorBody = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorBody?.error ?? `HTTP ${response.status}`);
      }

      const data = (await response.json()) as { url: string; expiresAt: string };
      setState({ status: "done", url: data.url, expiresAt: data.expiresAt });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "공유 링크를 생성하지 못했습니다.",
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

  const expiresLabel = state.status === "done" ? formatShareExpiry(state.expiresAt) : "";

  return (
    <>
      <div ref={triggerRef}>
        <Button variant="outline" size="sm" onClick={handleShare} className="gap-1.5">
          <Share2 className="h-3.5 w-3.5" />
          공유
        </Button>
      </div>

      {mounted &&
        open &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed z-[140] rounded-xl border border-border bg-card p-4 text-card-foreground shadow-[0_24px_48px_-24px_rgba(25,25,25,0.45)]"
            style={{
              top: position.top,
              left: position.left,
              width: position.width,
            }}
          >
            <div className="space-y-3">
              <div className="space-y-1 pr-6">
                <p className="text-sm font-semibold">링크 공유</p>
                <p className="text-xs text-muted-foreground">
                  {formatWeekRangeLabel(selectedRange)}
                </p>
              </div>

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
                      이 공유 링크는 <strong>{expiresLabel}</strong>에 만료됩니다. (7일)
                      <br />
                      로그인 없이 읽기 전용 조회만 지원합니다.
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
                      className="h-8 w-8 shrink-0"
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

                  {copied && (
                    <p className="text-right text-xs text-green-600">
                      링크가 복사되었습니다.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
