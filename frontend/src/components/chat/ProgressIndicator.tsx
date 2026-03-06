"use client";

import { SseFrame } from "@/hooks/useSse";

const STEP_LABELS: Record<string, string> = {
  buildSQL: "SQL 생성 중",
  executeQuery: "Athena 조회 중",
  computeDelta: "데이터 분석 중",
  buildChart: "차트 생성 중",
  approval: "액션 승인 중",
  finalizing: "응답 정리 중",
};

interface Props {
  frames: SseFrame[];
}

export default function ProgressIndicator({ frames }: Props) {
  const latest = frames[frames.length - 1];
  const step = latest?.data.step as string;
  const label = STEP_LABELS[step] ?? (latest?.data.message as string) ?? "처리 중";

  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted/70 px-2.5 py-1.5 text-sm text-muted-foreground">
      <div className="flex items-end gap-0.5 pb-0.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-primary"
            style={{ animationDelay: `${i * 160}ms`, animationDuration: "0.8s" }}
          />
        ))}
      </div>
      <span className="transition-all duration-300">{label}</span>
    </div>
  );
}
