import type { ChatMessage } from "@/types/chat";

export interface SessionMeta {
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredMessage extends ChatMessage {}

export interface SessionData extends SessionMeta {
  messages: StoredMessage[];
}
