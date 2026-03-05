import { SseFrame } from "@/hooks/useSse";

const STEP_LABELS: Record<string, string> = {
  buildSQL: "SQL 생성 중",
  executeQuery: "Athena 조회 중",
  computeDelta: "데이터 분석 중",
  buildChart: "차트 생성 중",
  approval: "액션 승인 중",
};

interface Props {
  frames: SseFrame[];
}

export default function ProgressIndicator({ frames }: Props) {
  const latest = frames[frames.length - 1];
  const step = latest?.data.step as string;
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
      {STEP_LABELS[step] ?? (latest?.data.message as string) ?? "처리 중..."}
    </div>
  );
}

