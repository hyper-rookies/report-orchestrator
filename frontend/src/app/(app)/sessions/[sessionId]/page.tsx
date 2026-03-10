"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchAuthSession } from "aws-amplify/auth";
import MessageList from "@/components/chat/MessageList";
import ChatInput from "@/components/chat/ChatInput";
import { useSse, type SseFrame } from "@/hooks/useSse";
import { useSessionContext } from "@/context/SessionContext";
import type { Message } from "@/app/(app)/page";
import type { StoredMessage } from "@/types/session";

const USE_MOCK_AUTH = process.env.NEXT_PUBLIC_USE_MOCK_AUTH === "true";

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (USE_MOCK_AUTH) {
    return {};
  }

  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    if (!token) {
      return {};
    }

    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}

const SKIP_TYPES = new Set(["chunk", "status", "delta"]);

export default function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();
  const { saveSession } = useSessionContext();
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionTitle, setSessionTitle] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const { frames, streaming, error, ask } = useSse();
  const messageScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/sessions/${sessionId}`, { headers });
      if (!response.ok) {
        setLoadError("세션을 찾을 수 없습니다.");
        return;
      }

      const data = (await response.json()) as { title: string; messages: StoredMessage[] };
      setSessionTitle(data.title);
      setMessages(
        data.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          frames: message.frames as SseFrame[] | undefined,
        }))
      );
    };

    void load();
  }, [sessionId]);

  useEffect(() => {
    messageScrollRef.current?.scrollTo({
      top: messageScrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, frames]);

  const hasRenderableFrame = (allFrames: SseFrame[]) =>
    allFrames.some(
      (frame) =>
        ["chunk", "table", "chart", "error"].includes(frame.type) ||
        (frame.type === "final" &&
          typeof ((frame.data.agentSummary ?? frame.data.summary) as string | undefined) ===
            "string")
    );

  const handleSubmit = async (question: string) => {
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: question };
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
              message: "응답 프레임이 비어 있습니다.",
              retryable: false,
            },
          } satisfies SseFrame,
        ];

    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      frames: normalizedFrames,
    };

    setMessages((prev) => {
      const updated = [...prev, assistantMsg];
      const storedMessages: StoredMessage[] = updated.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        frames: message.frames?.filter((frame) => !SKIP_TYPES.has(frame.type)),
      }));
      void saveSession({
        sessionId,
        title: sessionTitle || question.slice(0, 40),
        messages: storedMessages,
      });
      return updated;
    });
  };

  if (loadError) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="space-y-2 text-center">
          <p className="text-destructive">{loadError}</p>
          <button className="text-sm underline" onClick={() => router.push("/")}>
            새 대화 시작
          </button>
        </div>
      </div>
    );
  }

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
