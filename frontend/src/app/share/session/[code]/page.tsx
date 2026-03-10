"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import MessageList from "@/components/chat/MessageList";
import type { SessionData } from "@/types/session";
import type { SseFrame } from "@/hooks/useSse";
import type { ChatMessage } from "@/types/chat";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; session: SessionData };

export default function SharedSessionPage() {
  const { code } = useParams<{ code: string }>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/share/session/${code}`)
      .then(async (response) => {
        if (!response.ok) {
          const errorBody = (await response.json()) as { error?: string };
          throw new Error(errorBody.error ?? `HTTP ${response.status}`);
        }

        return response.json() as Promise<SessionData>;
      })
      .then((session) => {
        if (!cancelled) {
          setState({ status: "ok", session });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "링크를 불러올 수 없습니다.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

  if (state.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">공유 링크 확인 중...</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="space-y-2 text-center">
          <p className="text-lg font-semibold text-destructive">
            링크가 만료되었거나 유효하지 않습니다.
          </p>
          <p className="text-sm text-muted-foreground">{state.message}</p>
        </div>
      </div>
    );
  }

  const messages: ChatMessage[] = state.session.messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    frames: message.frames as SseFrame[] | undefined,
  }));

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 border-b bg-card/80 px-6 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">NHN AD Marketing Copilot</p>
            <p className="truncate text-sm font-semibold">{state.session.title}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
              읽기 전용
            </span>
            <span className="text-xs text-amber-600 dark:text-amber-400">공유 후 7일 만료</span>
          </div>
        </div>
      </div>

      <div className="mx-auto flex min-h-[calc(100vh-57px)] w-full max-w-5xl flex-col px-4">
        <MessageList messages={messages} streamingFrames={[]} scrollContainerRef={scrollRef} />
        <p className="pb-6 text-center text-xs text-muted-foreground">
          AI 리포트 서비스의 읽기 전용 공유 뷰입니다. 이 링크는 공유 후 7일 뒤 만료됩니다.
        </p>
      </div>
    </div>
  );
}
