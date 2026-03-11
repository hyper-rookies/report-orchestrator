"use client";

import { useState } from "react";
import { SendHorizontal } from "lucide-react";

import { useAgentApprovalSetting } from "@/hooks/useAgentApprovalSetting";
import { Button } from "@/components/ui/button";

interface Props {
  onSubmit: (question: string) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSubmit, disabled }: Props) {
  const [value, setValue] = useState("");
  const { autoApproveActions, setAutoApproveActions } = useAgentApprovalSetting();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || disabled) return;
    onSubmit(value.trim());
    setValue("");
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-4 mb-4 space-y-2 rounded-2xl border border-border/80 bg-card/95 p-3 shadow-[0_18px_36px_-26px_rgba(25,25,25,0.85)] backdrop-blur"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          도구 실행 설정: {autoApproveActions ? "자동 승인 켜짐" : "자동 승인 꺼짐"}
        </p>
        <button
          type="button"
          className="rounded-full border border-input/80 px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-muted"
          onClick={() => setAutoApproveActions(!autoApproveActions)}
        >
          {autoApproveActions ? "자동 승인 끄기" : "자동 승인 켜기"}
        </button>
      </div>

      <div className="flex items-end gap-2">
        <textarea
          className="min-h-[42px] max-h-40 flex-1 resize-none rounded-xl border border-input/70 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
          placeholder="마케팅 데이터에 대해 질문해보세요."
          value={value}
          rows={1}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleSubmit(e as unknown as React.FormEvent);
            }
          }}
          disabled={disabled}
        />
        <Button
          type="submit"
          size="icon"
          className="bg-[#191919] text-white shadow-[0_12px_22px_-16px_rgba(25,25,25,0.72)] hover:bg-[#111111] focus-visible:ring-[3px] focus-visible:ring-[#abb0b1]/45"
          disabled={disabled || !value.trim()}
        >
          <SendHorizontal className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}
