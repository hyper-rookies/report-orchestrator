"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchAuthSession } from "aws-amplify/auth";

import ChatInput from "@/components/chat/ChatInput";
import MessageList from "@/components/chat/MessageList";
import { useSessionContext } from "@/context/SessionContext";
import { useQuestionQueue } from "@/hooks/useQuestionQueue";
import { useSse, type SseFrame } from "@/hooks/useSse";
import {
  createSaveFailure,
  prepareSessionSave,
  type FailedSessionSave,
} from "@/lib/sessionPersistence";
import type { ChatMessage } from "@/types/chat";
import type { StoredMessage } from "@/types/session";

const USE_MOCK_AUTH = process.env.NEXT_PUBLIC_USE_MOCK_AUTH === "true";
const SKIP_TYPES = new Set(["chunk", "status", "delta"]);

const EMPTY_RESPONSE_FRAME: SseFrame = {
  type: "error",
  data: {
    version: "v1",
    code: "EMPTY_RESPONSE",
    message: "??? ?? ????.",
    retryable: false,
  },
};

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

function hasRenderableFrame(allFrames: SseFrame[]) {
  return allFrames.some((frame) => {
    if (["chunk", "table", "chart", "error"].includes(frame.type)) {
      return true;
    }

    if (frame.type !== "final") {
      return false;
    }

    const summary =
      (frame.data.agentSummary as string | undefined) ??
      (frame.data.summary as string | undefined);
    return typeof summary === "string" && summary.trim().length > 0;
  });
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
  const [submitting, setSubmitting] = useState(false);
  const { frames, streaming, error, ask } = useSse();
  const messageScrollRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<ChatMessage[]>(messages);
  const runQuestionRef = useRef<(question: string) => void>(() => undefined);
  const queueDispatchingRef = useRef(false);

  const persistedTitle = getSessionTitle(sessionId);

  const {
    queuedQuestions,
    enqueueQuestion,
    removeQueuedQuestion,
    clearQueuedQuestions,
    takeNextQueuedQuestion,
  } = useQuestionQueue();

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const load = async () => {
      setLoadError(null);
      setSaveError(null);
      setRetryableSave(null);

      const headers = await getAuthHeaders();
      const response = await fetch(`/api/sessions/${sessionId}`, { headers });
      if (!response.ok) {
        setLoadError("??? ???? ?????.");
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

  const persistMessages = useCallback(
    async (failedSave: FailedSessionSave) => {
      setPersisting(true);
      setSaveError(null);

      try {
        await saveSession(failedSave.request);
        setRetryableSave(null);
        return true;
      } catch (saveFailureError) {
        const nextFailure = createSaveFailure(
          failedSave.request,
          failedSave.shouldNavigateOnSuccess,
          saveFailureError
        );
        setRetryableSave(nextFailure);
        setSaveError(nextFailure.message);
        return false;
      } finally {
        setPersisting(false);
      }
    },
    [saveSession]
  );

  const runQuestion = useCallback(
    async (question: string) => {
      setSubmitting(true);
      setSaveError(null);
      setRetryableSave(null);

      try {
        const userMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "user",
          content: question,
        };
        const nextMessages = [...messagesRef.current, userMessage];
        messagesRef.current = nextMessages;
        setMessages(nextMessages);

        const completedFrames = await ask(question);
        const normalizedFrames = hasRenderableFrame(completedFrames)
          ? completedFrames
          : [EMPTY_RESPONSE_FRAME];

        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "",
          frames: normalizedFrames,
        };

        const updatedMessages = [...nextMessages, assistantMessage];
        messagesRef.current = updatedMessages;
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
      } finally {
        setSubmitting(false);
      }
    },
    [ask, loadedTitle, persistMessages, persistedTitle, sessionId]
  );

  runQuestionRef.current = (question: string) => {
    void runQuestion(question);
  };

  useEffect(() => {
    if (!submitting) {
      queueDispatchingRef.current = false;
    }
  }, [submitting]);

  useEffect(() => {
    if (submitting || persisting || saveError || queueDispatchingRef.current) {
      return;
    }

    const nextQuestion = takeNextQueuedQuestion();
    if (!nextQuestion) {
      return;
    }

    queueDispatchingRef.current = true;
    queueMicrotask(() => {
      void runQuestionRef.current(nextQuestion.question);
    });
  }, [persisting, queuedQuestions.length, saveError, submitting, takeNextQueuedQuestion]);

  useEffect(() => {
    messageScrollRef.current?.scrollTo({
      top: messageScrollRef.current?.scrollHeight ?? 0,
      behavior: "smooth",
    });
  }, [messages, frames]);

  const handleRetrySave = () => {
    if (!retryableSave) {
      return;
    }

    void persistMessages(retryableSave);
  };

  if (loadError) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="space-y-2 text-center">
          <p className="text-destructive">{loadError}</p>
          <button className="text-sm underline" onClick={() => router.push("/")}>
            ??? ????
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
              onClick={handleRetrySave}
              disabled={persisting}
            >
              ?? ??
            </button>
          )}
        </div>
      )}

      <ChatInput
        onSubmit={(question) => {
          void runQuestion(question);
        }}
        onQueue={(question) => {
          enqueueQuestion(question);
        }}
        queuedQuestions={queuedQuestions}
        onRemoveQueuedQuestion={removeQueuedQuestion}
        onClearQueuedQuestions={clearQueuedQuestions}
        busy={submitting || persisting}
        queuePaused={Boolean(saveError)}
      />
    </div>
  );
}
