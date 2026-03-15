"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import ChatInput from "@/components/chat/ChatInput";
import MessageList from "@/components/chat/MessageList";
import { useSessionContext } from "@/context/SessionContext";
import { useQuestionQueue } from "@/hooks/useQuestionQueue";
import { type SseFrame, useSse } from "@/hooks/useSse";
import {
  applySaveSuccess,
  createSaveFailure,
  prepareSessionSave,
  type FailedSessionSave,
} from "@/lib/sessionPersistence";
import type { ChatMessage } from "@/types/chat";

const SKIP_TYPES = new Set(["chunk", "status", "delta"]);

const EMPTY_RESPONSE_FRAME: SseFrame = {
  type: "error",
  data: {
    version: "v1",
    code: "EMPTY_RESPONSE",
    message: "??? ?? ????. ?? ?? ?? SSE ?? ??? ??? ???.",
    retryable: false,
  },
};

function hasRenderableFrame(allFrames: SseFrame[]) {
  return allFrames.some((frame) => {
    if (
      frame.type === "chunk" ||
      frame.type === "table" ||
      frame.type === "chart" ||
      frame.type === "error"
    ) {
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

export default function ChatPage() {
  const router = useRouter();
  const { saveSession } = useSessionContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [retryableSave, setRetryableSave] = useState<FailedSessionSave | null>(null);
  const [persisting, setPersisting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { frames, streaming, error, ask } = useSse();
  const messageScrollRef = useRef<HTMLDivElement>(null);
  const sessionIdsRef = useRef<{ persistedSessionId: string | null; draftSessionId: string | null }>({
    persistedSessionId: null,
    draftSessionId: null,
  });
  const runQuestionRef = useRef<(question: string) => void>(() => undefined);
  const messagesRef = useRef<ChatMessage[]>(messages);
  const queueDispatchingRef = useRef(false);

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

  const persistSession = useCallback(
    async (failedSave: FailedSessionSave) => {
      setPersisting(true);
      setSaveError(null);

      try {
        const savedMeta = await saveSession(failedSave.request);
        const nextIds = applySaveSuccess(sessionIdsRef.current, savedMeta.sessionId);
        sessionIdsRef.current = nextIds;
        setRetryableSave(null);

        if (failedSave.shouldNavigateOnSuccess && nextIds.navigateTo) {
          router.replace(nextIds.navigateTo);
        }

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
    [router, saveSession]
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
          ...sessionIdsRef.current,
          persistedTitle: null,
          loadedTitle: null,
          question,
          messages: updatedMessages,
          skipFrameTypes: SKIP_TYPES,
          createSessionId: () => crypto.randomUUID(),
        });

        sessionIdsRef.current = {
          ...sessionIdsRef.current,
          draftSessionId: pendingSave.request.sessionId,
        };

        await persistSession({
          message: "",
          request: pendingSave.request,
          shouldNavigateOnSuccess: pendingSave.shouldNavigateOnSuccess,
        });
      } finally {
        setSubmitting(false);
      }
    },
    [ask, persistSession]
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

  const handleRetrySave = () => {
    if (!retryableSave) {
      return;
    }

    void persistSession(retryableSave);
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
