"use client";

import { useEffect, useRef, useState } from "react";

import MessageList from "@/components/chat/MessageList";
import ChatInput from "@/components/chat/ChatInput";
import { SseFrame, useSse } from "@/hooks/useSse";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  frames?: SseFrame[];
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const { frames, streaming, error, ask } = useSse();
  const messageScrollRef = useRef<HTMLDivElement>(null);

  const hasRenderableFrame = (allFrames: SseFrame[]) =>
    allFrames.some((frame) => {
      if (frame.type === "chunk" || frame.type === "table" || frame.type === "chart" || frame.type === "error") {
        return true;
      }
      if (frame.type !== "final") {
        return false;
      }
      const summary = (frame.data.agentSummary as string | undefined) ?? (frame.data.summary as string | undefined);
      return typeof summary === "string" && summary.trim().length > 0;
    });

  useEffect(() => {
    if (messages.length === 0 && frames.length === 0) {
      return;
    }
    const container = messageScrollRef.current;
    if (!container) {
      return;
    }
    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, frames]);

  const handleSubmit = async (question: string) => {
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
    };
    setMessages((prev) => [...prev, userMsg]);
    const completedFrames = await ask(question);
    const normalizedFrames = hasRenderableFrame(completedFrames)
      ? completedFrames
      : [
          {
            type: "error",
            data: {
              version: "v1",
              code: "EMPTY_RESPONSE",
              message: "응답 프레임이 비어 있습니다. 인증(401) 또는 SSE 응답 형식을 확인해 주세요.",
              retryable: false,
            },
          } satisfies SseFrame,
        ];
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        frames: normalizedFrames,
      },
    ]);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MessageList
        messages={messages}
        streamingFrames={streaming ? frames : []}
        scrollContainerRef={messageScrollRef}
      />
      {error && (
        <p className="mx-4 mb-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <ChatInput onSubmit={handleSubmit} disabled={streaming} />
    </div>
  );
}

