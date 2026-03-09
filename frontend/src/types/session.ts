import type { SseFrame } from "@/hooks/useSse";

export interface SessionMeta {
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  frames?: SseFrame[];
}

export interface SessionData extends SessionMeta {
  messages: StoredMessage[];
}
