"use client";

import { useMemo, useState } from "react";
import { Clock3, SendHorizontal, X } from "lucide-react";

import type { QueuedQuestion } from "@/hooks/useQuestionQueue";
import { Button } from "@/components/ui/button";

interface Props {
  onSubmit: (question: string) => void;
  onQueue: (question: string) => void;
  queuedQuestions: QueuedQuestion[];
  onRemoveQueuedQuestion: (questionId: string) => void;
  onClearQueuedQuestions: () => void;
  busy?: boolean;
  queuePaused?: boolean;
  disabled?: boolean;
}

type SubmitMode = "submit" | "queue";

export default function ChatInput({
  onSubmit,
  onQueue,
  queuedQuestions,
  onRemoveQueuedQuestion,
  onClearQueuedQuestions,
  busy = false,
  queuePaused = false,
  disabled = false,
}: Props) {
  const [value, setValue] = useState("");
  const hasQueuedQuestions = queuedQuestions.length > 0;
  const isQueueMode = busy || hasQueuedQuestions;

  const helperText = useMemo(() => {
    if (queuePaused && hasQueuedQuestions) {
      return "세션 저장 오류를 해결하면 예약 질문이 이어서 실행됩니다.";
    }
    if (isQueueMode) {
      return "응답을 기다리는 동안 입력한 질문은 예약되고, 완료 후 순서대로 실행됩니다.";
    }
    return "Enter로 전송하고 Shift+Enter로 줄바꿈할 수 있습니다.";
  }, [hasQueuedQuestions, isQueueMode, queuePaused]);

  const queueHint = queuePaused
    ? "세션 저장 오류를 해결하면 예약 질문이 이어서 실행됩니다."
    : "현재 응답과 저장이 끝나면 예약 질문이 순서대로 자동 실행됩니다.";

  const submitMode: SubmitMode = isQueueMode ? "queue" : "submit";

  const commitValue = (mode: SubmitMode) => {
    const nextValue = value.trim();
    if (!nextValue || disabled) {
      return;
    }

    if (mode === "queue") {
      onQueue(nextValue);
    } else {
      onSubmit(nextValue);
    }

    setValue("");
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        commitValue(submitMode);
      }}
      className="mx-4 mb-4 space-y-3 rounded-2xl border border-border/80 bg-card/95 p-3 shadow-[0_18px_36px_-26px_rgba(25,25,25,0.85)] backdrop-blur"
    >
      {hasQueuedQuestions && (
        <div className="rounded-xl border border-border/70 bg-background/85 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                예약 질문
              </p>
              <p className="text-xs text-muted-foreground">{queueHint}</p>
            </div>
            <Button type="button" size="xs" variant="ghost" onClick={onClearQueuedQuestions}>
              비우기
            </Button>
          </div>

          <div className="mt-3 space-y-2">
            {queuedQuestions.map((item, index) => (
              <div
                key={item.id}
                className="flex items-start gap-3 rounded-xl border border-border/60 bg-card px-3 py-2"
              >
                <span className="mt-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                  {index + 1}
                </span>
                <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm text-foreground">
                  {item.question}
                </p>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  className="shrink-0"
                  onClick={() => onRemoveQueuedQuestion(item.id)}
                  aria-label="예약 질문 삭제"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{helperText}</p>
        {hasQueuedQuestions && (
          <span className="rounded-full border border-input/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            예약 {queuedQuestions.length}개
          </span>
        )}
      </div>

      <div className="flex items-end gap-2">
        <textarea
          className="min-h-[42px] max-h-40 flex-1 resize-none rounded-xl border border-input/70 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
          placeholder="마케팅 데이터에 대해 질문해보세요."
          value={value}
          rows={1}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              commitValue(submitMode);
            }
          }}
          disabled={disabled}
        />

        <Button
          type="submit"
          size="sm"
          className="min-w-[88px] bg-[#191919] text-white shadow-[0_12px_22px_-16px_rgba(25,25,25,0.72)] hover:bg-[#111111] focus-visible:ring-[3px] focus-visible:ring-[#abb0b1]/45"
          disabled={disabled || !value.trim()}
          aria-label={isQueueMode ? "질문 예약" : "질문 전송"}
        >
          {isQueueMode ? <Clock3 className="h-4 w-4" /> : <SendHorizontal className="h-4 w-4" />}
          {isQueueMode ? "예약" : "전송"}
        </Button>
      </div>
    </form>
  );
}
