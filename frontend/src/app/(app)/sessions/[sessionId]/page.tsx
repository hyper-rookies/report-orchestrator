"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchAuthSession } from "aws-amplify/auth";

import MessageList from "@/components/chat/MessageList";
import ChatInput from "@/components/chat/ChatInput";
import { useSessionContext } from "@/context/SessionContext";
import {
  createSaveFailure,
  prepareSessionSave,
  type FailedSessionSave,
} from "@/lib/sessionPersistence";
import { useSse, type SseFrame } from "@/hooks/useSse";
import type { ChatMessage } from "@/types/chat";
import type { StoredMessage } from "@/types/session";

const USE_MOCK_AUTH = process.env.NEXT_PUBLIC_USE_MOCK_AUTH === "true";
const SKIP_TYPES = new Set(["chunk", "status", "delta"]);

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

export default function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();
  const { getSessionTitle, saveSession } = useSessionContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadedTitle, setLoadedTitle] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [retryableSave, setRetryableSave] = useState<FailedSessionSave | null>(null);
  const [persisting, setPersisting] = useState(false);
  const { frames, streaming, error, ask } = useSse();
  const messageScrollRef = useRef<HTMLDivElement>(null);

  const persistedTitle = getSessionTitle(sessionId);

  useEffect(() => {
    const load = async () => {
      setLoadError(null);
      setSaveError(null);
      setRetryableSave(null);

      const headers = await getAuthHeaders();
      const response = await fetch(`/api/sessions/${sessionId}`, { headers });
      if (!response.ok) {
        setLoadError("?몄뀡??李얠쓣 ???놁뒿?덈떎.");
        return;
      }

      const data = (await response.json()) as { title: string; messages: StoredMessage[] };
      setLoadedTitle(data.title);
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

  const persistMessages = async (failedSave: FailedSessionSave) => {
    setPersisting(true);
    setSaveError(null);

    try {
      await saveSession(failedSave.request);
      setRetryableSave(null);
    } catch (saveFailureError) {
      const nextFailure = createSaveFailure(
        failedSave.request,
        failedSave.shouldNavigateOnSuccess,
        saveFailureError
      );
      setRetryableSave(nextFailure);
      setSaveError(nextFailure.message);
    } finally {
      setPersisting(false);
    }
  };

  const handleSubmit = async (question: string) => {
    setSaveError(null);
    setRetryableSave(null);

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: question };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);

    const completedFrames = await ask(question);
    const normalizedFrames = hasRenderableFrame(completedFrames)
      ? completedFrames
      : [
          {
            type: "error",
            data: {
              version: "v1",
              code: "EMPTY_RESPONSE",
              message: "?묐떟 ?꾨젅?꾩씠 鍮꾩뼱 ?덉뒿?덈떎.",
              retryable: false,
            },
          } satisfies SseFrame,
        ];

    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      frames: normalizedFrames,
    };

    const updatedMessages = [...nextMessages, assistantMsg];
    setMessages(updatedMessages);

    const pendingSave = prepareSessionSave({
      persistedSessionId: sessionId,
      draftSessionId: sessionId,
      persistedTitle,
      loadedTitle,
      question,
      messages: updatedMessages,
      skipFrameTypes: SKIP_TYPES,
      createSessionId: () => sessionId,
    });

    await persistMessages({
      message: "",
      request: pendingSave.request,
      shouldNavigateOnSuccess: pendingSave.shouldNavigateOnSuccess,
    });
  };

  if (loadError) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="space-y-2 text-center">
          <p className="text-destructive">{loadError}</p>
          <button className="text-sm underline" onClick={() => router.push("/")}>
            ??????쒖옉
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
      {saveError && (
        <div className="mx-4 mb-2 flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <p>{saveError}</p>
          {retryableSave && (
            <button
              type="button"
              className="shrink-0 rounded border border-destructive/40 px-2 py-1 text-xs font-medium hover:bg-destructive/10"
              onClick={() => void persistMessages(retryableSave)}
              disabled={persisting}
            >
              다시 저장
            </button>
          )}
        </div>
      )}
      <ChatInput onSubmit={handleSubmit} disabled={streaming || persisting} />
    </div>
  );
}
