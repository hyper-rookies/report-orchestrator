import { Message } from "@/app/(app)/page";
import { SseFrame } from "@/hooks/useSse";

import AssistantMessage from "./AssistantMessage";

interface Props {
  messages: Message[];
  streamingFrames: SseFrame[];
}

export default function MessageList({ messages, streamingFrames }: Props) {
  return (
    <div className="flex-1 space-y-6 overflow-y-auto px-4 py-6">
      {messages.map((msg) =>
        msg.role === "user" ? (
          <div key={msg.id} className="flex justify-end">
            <div className="max-w-[70%] rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground">
              {msg.content}
            </div>
          </div>
        ) : (
          <AssistantMessage key={msg.id} frames={msg.frames ?? []} />
        )
      )}
      {streamingFrames.length > 0 && <AssistantMessage frames={streamingFrames} streaming />}
    </div>
  );
}

