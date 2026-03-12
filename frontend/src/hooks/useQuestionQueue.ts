"use client";

import { useCallback, useRef, useState } from "react";

export interface QueuedQuestion {
  id: string;
  question: string;
}

export function useQuestionQueue() {
  const queuedQuestionsRef = useRef<QueuedQuestion[]>([]);
  const [queuedQuestions, setQueuedQuestions] = useState<QueuedQuestion[]>([]);

  const syncQueuedQuestions = useCallback((next: QueuedQuestion[]) => {
    queuedQuestionsRef.current = next;
    setQueuedQuestions(next);
  }, []);

  const enqueueQuestion = useCallback(
    (question: string) => {
      const trimmed = question.trim();
      if (!trimmed) {
        return null;
      }

      const queuedQuestion = {
        id: crypto.randomUUID(),
        question: trimmed,
      };

      syncQueuedQuestions([...queuedQuestionsRef.current, queuedQuestion]);
      return queuedQuestion;
    },
    [syncQueuedQuestions]
  );

  const removeQueuedQuestion = useCallback(
    (questionId: string) => {
      const next = queuedQuestionsRef.current.filter((item) => item.id !== questionId);
      syncQueuedQuestions(next);
    },
    [syncQueuedQuestions]
  );

  const clearQueuedQuestions = useCallback(() => {
    syncQueuedQuestions([]);
  }, [syncQueuedQuestions]);

  const takeNextQueuedQuestion = useCallback(() => {
    if (queuedQuestionsRef.current.length === 0) {
      return null;
    }

    const [nextQuestion, ...rest] = queuedQuestionsRef.current;
    syncQueuedQuestions(rest);
    return nextQuestion;
  }, [syncQueuedQuestions]);

  return {
    queuedQuestions,
    enqueueQuestion,
    removeQueuedQuestion,
    clearQueuedQuestions,
    takeNextQueuedQuestion,
  };
}
