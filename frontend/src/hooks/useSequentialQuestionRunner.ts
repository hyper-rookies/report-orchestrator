"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { QueuedQuestion } from "@/hooks/useQuestionQueue";

type QueueState = {
  activeQueueItemId: string | null;
  awaitingRenderAck: boolean;
  lastCompletedQueueItemId: string | null;
};

type UseSequentialQuestionRunnerArgs = {
  queuedQuestionsLength: number;
  busy: boolean;
  queuePaused: boolean;
  takeNextQueuedQuestion: () => QueuedQuestion | null;
  onRunQueuedQuestion: (queuedQuestion: QueuedQuestion) => void;
};

type UseSequentialQuestionRunnerResult = {
  activeQueueItemId: string | null;
  awaitingRenderAck: boolean;
  lastCompletedQueueItemId: string | null;
  registerQueuedAssistantMessage: (queueItemId: string, messageId: string) => void;
  markQueuedQuestionAwaitingRender: (queueItemId: string) => void;
  acknowledgeRenderedAssistantMessage: (messageId: string) => void;
};

const INITIAL_STATE: QueueState = {
  activeQueueItemId: null,
  awaitingRenderAck: false,
  lastCompletedQueueItemId: null,
};

export function useSequentialQuestionRunner({
  queuedQuestionsLength,
  busy,
  queuePaused,
  takeNextQueuedQuestion,
  onRunQueuedQuestion,
}: UseSequentialQuestionRunnerArgs): UseSequentialQuestionRunnerResult {
  const [queueState, setQueueState] = useState<QueueState>(INITIAL_STATE);
  const queueStateRef = useRef<QueueState>(INITIAL_STATE);
  const assistantMessageIdByQueueIdRef = useRef(new Map<string, string>());
  const renderedAssistantMessageIdsRef = useRef(new Set<string>());

  const syncQueueState = useCallback((next: QueueState) => {
    queueStateRef.current = next;
    setQueueState(next);
  }, []);

  const updateQueueState = useCallback(
    (updater: (current: QueueState) => QueueState) => {
      const next = updater(queueStateRef.current);
      syncQueueState(next);
      return next;
    },
    [syncQueueState]
  );

  const completeQueueItemIfRendered = useCallback(
    (queueItemId: string | null) => {
      if (!queueItemId) {
        return;
      }

      const currentState = queueStateRef.current;
      if (currentState.activeQueueItemId !== queueItemId || !currentState.awaitingRenderAck) {
        return;
      }

      const assistantMessageId = assistantMessageIdByQueueIdRef.current.get(queueItemId);
      if (!assistantMessageId || !renderedAssistantMessageIdsRef.current.has(assistantMessageId)) {
        return;
      }

      assistantMessageIdByQueueIdRef.current.delete(queueItemId);
      syncQueueState({
        activeQueueItemId: null,
        awaitingRenderAck: false,
        lastCompletedQueueItemId: queueItemId,
      });
    },
    [syncQueueState]
  );

  useEffect(() => {
    if (busy || queuePaused) {
      return;
    }

    const currentState = queueStateRef.current;
    if (currentState.activeQueueItemId || currentState.awaitingRenderAck) {
      return;
    }

    const nextQuestion = takeNextQueuedQuestion();
    if (!nextQuestion) {
      return;
    }

    syncQueueState({
      activeQueueItemId: nextQuestion.id,
      awaitingRenderAck: false,
      lastCompletedQueueItemId: currentState.lastCompletedQueueItemId,
    });

    queueMicrotask(() => {
      onRunQueuedQuestion(nextQuestion);
    });
  }, [busy, onRunQueuedQuestion, queuePaused, queuedQuestionsLength, syncQueueState, takeNextQueuedQuestion]);

  const registerQueuedAssistantMessage = useCallback(
    (queueItemId: string, messageId: string) => {
      assistantMessageIdByQueueIdRef.current.set(queueItemId, messageId);
      completeQueueItemIfRendered(queueItemId);
    },
    [completeQueueItemIfRendered]
  );

  const markQueuedQuestionAwaitingRender = useCallback(
    (queueItemId: string) => {
      const next = updateQueueState((current) => {
        if (current.activeQueueItemId !== queueItemId) {
          return current;
        }

        return {
          ...current,
          awaitingRenderAck: true,
        };
      });

      if (next.activeQueueItemId === queueItemId && next.awaitingRenderAck) {
        completeQueueItemIfRendered(queueItemId);
      }
    },
    [completeQueueItemIfRendered, updateQueueState]
  );

  const acknowledgeRenderedAssistantMessage = useCallback(
    (messageId: string) => {
      renderedAssistantMessageIdsRef.current.add(messageId);

      const activeQueueItemId = queueStateRef.current.activeQueueItemId;
      if (!activeQueueItemId) {
        return;
      }

      const activeAssistantMessageId = assistantMessageIdByQueueIdRef.current.get(activeQueueItemId);
      if (activeAssistantMessageId !== messageId) {
        return;
      }

      completeQueueItemIfRendered(activeQueueItemId);
    },
    [completeQueueItemIfRendered]
  );

  return {
    activeQueueItemId: queueState.activeQueueItemId,
    awaitingRenderAck: queueState.awaitingRenderAck,
    lastCompletedQueueItemId: queueState.lastCompletedQueueItemId,
    registerQueuedAssistantMessage,
    markQueuedQuestionAwaitingRender,
    acknowledgeRenderedAssistantMessage,
  };
}
