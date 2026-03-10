import type { ChatMessage } from "@/types/chat";

export interface SessionMeta {
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export type StoredMessage = ChatMessage;

export interface SessionData extends SessionMeta {
  messages: StoredMessage[];
}
