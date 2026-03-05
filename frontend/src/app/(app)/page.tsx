"use client";

import { useEffect, useRef, useState } from "react";

import MessageList from "@/components/chat/MessageList";
import ChatInput from "@/components/chat/ChatInput";
import { SseFrame, useSse } from "@/hooks/useSse";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  frames?: SseFrame[];
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const { frames, streaming, error, ask } = useSse();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, frames]);

  const handleSubmit = async (question: string) => {
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
    };
    setMessages((prev) => [...prev, userMsg]);
    const completedFrames = await ask(question);
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        frames: completedFrames,
      },
    ]);
  };

  return (
    <div className="flex h-full flex-col">
      <MessageList messages={messages} streamingFrames={streaming ? frames : []} />
      {error && <p className="px-4 py-1 text-sm text-destructive">{error}</p>}
      <div ref={bottomRef} />
      <ChatInput onSubmit={handleSubmit} disabled={streaming} />
    </div>
  );
}

