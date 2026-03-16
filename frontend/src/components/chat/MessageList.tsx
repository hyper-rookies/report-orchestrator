import type { RefObject } from "react";

import { SseFrame } from "@/hooks/useSse";
import type { ChatMessage } from "@/types/chat";

import AssistantMessage from "./AssistantMessage";

interface Props {
  messages: ChatMessage[];
  streamingFrames: SseFrame[];
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
  onAssistantRendered?: (messageId: string) => void;
}

function findPromptForAssistant(
  messages: ChatMessage[],
  assistantIndex: number
): string | undefined {
  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (candidate.role === "user") {
      return candidate.content;
    }
  }

  return undefined;
}

export default function MessageList({
  messages,
  streamingFrames,
  scrollContainerRef,
  onAssistantRendered,
}: Props) {
  return (
    <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        {messages.map((msg, idx) =>
          msg.role === "user" ? (
            <div key={msg.id} className="flex justify-end">
              <div className="max-w-[72%] rounded-2xl bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-[0_10px_22px_-16px_rgba(25,25,25,0.72)]">
                {msg.content}
              </div>
            </div>
          ) : (
            <AssistantMessage
              key={msg.id}
              messageId={msg.id}
              frames={msg.frames ?? []}
              prompt={findPromptForAssistant(messages, idx)}
              onRendered={onAssistantRendered}
            />
          )
        )}
        {streamingFrames.length > 0 && <AssistantMessage frames={streamingFrames} streaming />}
      </div>
    </div>
  );
}
