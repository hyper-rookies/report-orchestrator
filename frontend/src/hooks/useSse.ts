"use client";

import { useCallback, useRef, useState } from "react";
import { fetchAuthSession } from "aws-amplify/auth";

export interface SseFrame {
  type: string;
  data: Record<string, unknown>;
}

interface UseSseResult {
  frames: SseFrame[];
  streaming: boolean;
  error: string | null;
  ask: (question: string) => Promise<SseFrame[]>;
  reset: () => void;
}

const SSE_URL = process.env.NEXT_PUBLIC_SSE_URL!;
const USE_MOCK_AUTH = process.env.NEXT_PUBLIC_USE_MOCK_AUTH === "true";

async function getIdToken(): Promise<string | null> {
  if (USE_MOCK_AUTH) return null;
  try {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() ?? null;
  } catch {
    return null;
  }
}

function parseSseChunk(chunk: string): SseFrame[] {
  const frames: SseFrame[] = [];
  const events = chunk.split("\n\n").filter(Boolean);
  for (const event of events) {
    const lines = event.split("\n");
    const typeLine = lines.find((l) => l.startsWith("event:"));
    const dataLine = lines.find((l) => l.startsWith("data:"));
    if (!typeLine || !dataLine) continue;
    try {
      frames.push({
        type: typeLine.slice(typeLine.indexOf(":") + 1).trim(),
        data: JSON.parse(dataLine.slice(dataLine.indexOf(":") + 1).trim()),
      });
    } catch {
      // malformed frame - skip
    }
  }
  return frames;
}

export function useSse(): UseSseResult {
  const [frames, setFrames] = useState<SseFrame[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setFrames([]);
    setStreaming(false);
    setError(null);
  }, []);

  const ask = useCallback(
    async (question: string) => {
      reset();
      setStreaming(true);
      const collected: SseFrame[] = [];

      const idToken = await getIdToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (idToken) headers.Authorization = `Bearer ${idToken}`;

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(SSE_URL, {
          method: "POST",
          headers,
          body: JSON.stringify({ question }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lastDoubleNewline = buffer.lastIndexOf("\n\n");
          if (lastDoubleNewline === -1) continue;

          const toProcess = buffer.slice(0, lastDoubleNewline + 2);
          buffer = buffer.slice(lastDoubleNewline + 2);

          const newFrames = parseSseChunk(toProcess);
          if (newFrames.length > 0) {
            collected.push(...newFrames);
            setFrames((prev) => [...prev, ...newFrames]);
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError((err as Error).message);
        }
      } finally {
        setStreaming(false);
      }
      return collected;
    },
    [reset]
  );

  return { frames, streaming, error, ask, reset };
}
