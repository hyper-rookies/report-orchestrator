import type { SseFrame } from "@/hooks/useSse";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  frames?: SseFrame[];
}
