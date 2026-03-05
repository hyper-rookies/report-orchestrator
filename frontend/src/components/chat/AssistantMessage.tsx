import { SseFrame } from "@/hooks/useSse";

import ReportRenderer from "../report/ReportRenderer";
import ProgressIndicator from "./ProgressIndicator";

interface Props {
  frames: SseFrame[];
  streaming?: boolean;
}

export default function AssistantMessage({ frames, streaming }: Props) {
  const progressFrames = frames.filter((f) => f.type === "progress");
  const chunkFrames = frames.filter((f) => f.type === "chunk");
  const finalFrame = frames.find((f) => f.type === "final");
  const errorFrame = frames.find((f) => f.type === "error");

  const streamingText = chunkFrames.map((f) => (f.data.text as string) ?? "").join("");

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-3">
        {streaming && progressFrames.length > 0 && <ProgressIndicator frames={progressFrames} />}
        {streamingText && <p className="whitespace-pre-wrap text-sm">{streamingText}</p>}
        {errorFrame && <p className="text-sm text-destructive">{errorFrame.data.message as string}</p>}
        {finalFrame && <ReportRenderer frame={finalFrame} />}
      </div>
    </div>
  );
}

