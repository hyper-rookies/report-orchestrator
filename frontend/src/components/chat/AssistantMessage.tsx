import { useState } from "react";
import { SseFrame } from "@/hooks/useSse";
import BookmarkButton from "@/components/bookmark/BookmarkButton";
import DataTable from "@/components/report/DataTable";
import ReportBarChart from "@/components/report/ReportBarChart";
import ReportPieChart, { type PieSpec } from "@/components/report/ReportPieChart";
import { downloadCsv } from "@/lib/exportCsv";

import ProgressIndicator from "./ProgressIndicator";

interface Props {
  frames: SseFrame[];
  streaming?: boolean;
  prompt?: string;
}

type ChartSpec = Parameters<typeof ReportBarChart>[0]["spec"];
const ACTION_BUTTON_CLASS =
  "rounded-md border border-input/80 px-2 py-1 text-xs font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 aria-pressed:bg-muted";

export default function AssistantMessage({ frames, streaming, prompt }: Props) {
  const [showTable, setShowTable] = useState(false);
  const [selectedChartFrameIndex, setSelectedChartFrameIndex] = useState<number | null>(null);
  const currentChartFrameIndex = frames.findLastIndex((f) => f.type === "chart");
  const currentChartFrame = currentChartFrameIndex >= 0 ? frames[currentChartFrameIndex] : undefined;
  const progressFrames = frames.filter((f) => f.type === "progress");
  const chunkFrames = frames.filter((f) => f.type === "chunk");
  const tableFrame = [...frames].reverse().find((f) => f.type === "table");
  const chartFrame = currentChartFrame;
  const errorFrame = [...frames].reverse().find((f) => f.type === "error");
  const finalFrame = [...frames].reverse().find((f) => f.type === "final");

  const streamingText = chunkFrames.map((f) => (f.data.text as string) ?? "").join("");
  const finalSummary =
    ((finalFrame?.data.agentSummary as string | undefined) ??
      (finalFrame?.data.summary as string | undefined) ??
      "")
      .toString()
      .trim();
  const tableRows = ((tableFrame?.data.rows as Record<string, unknown>[] | undefined) ?? []).filter(
    (row) => typeof row === "object" && row !== null
  );

  const rawChartSpec = chartFrame?.data.spec as Record<string, unknown> | undefined;
  const chartType = typeof rawChartSpec?.type === "string" ? rawChartSpec.type : undefined;
  const chartRows = ((rawChartSpec?.data as Record<string, unknown>[] | undefined) ?? []).filter(
    (row) => typeof row === "object" && row !== null
  );

  const pieSpec: PieSpec | null =
    chartType === "pie" &&
    Array.isArray(rawChartSpec?.data) &&
    typeof rawChartSpec?.nameKey === "string" &&
    typeof rawChartSpec?.valueKey === "string"
      ? {
          type: "pie",
          data: rawChartSpec.data as Record<string, unknown>[],
          nameKey: rawChartSpec.nameKey,
          valueKey: rawChartSpec.valueKey,
          ...(typeof rawChartSpec?.title === "string" ? { title: rawChartSpec.title } : {}),
        }
      : null;

  const barLikeSpec: ChartSpec | null =
    Array.isArray(rawChartSpec?.data) &&
    typeof rawChartSpec?.xAxis === "string" &&
    Array.isArray(rawChartSpec?.series)
      ? {
          type: chartType,
          title: typeof rawChartSpec?.title === "string" ? rawChartSpec.title : undefined,
          xAxis: rawChartSpec.xAxis,
          series: rawChartSpec.series as Array<{ metric?: string; dataKey?: string; label?: string }>,
          data: rawChartSpec.data as Record<string, unknown>[],
        }
      : null;

  const hasChart = chartFrame && (pieSpec || barLikeSpec);
  const isShowingCurrentChartTable =
    showTable && currentChartFrameIndex >= 0 && selectedChartFrameIndex === currentChartFrameIndex;
  const showStandaloneTable = Boolean(tableFrame) && (!hasChart || streaming);
  const showBookmarkAction = !streaming && Boolean(finalFrame) && Boolean(prompt);

  return (
    <div className="flex justify-start">
      <div className="nhn-panel max-w-[88%] space-y-3 px-4 py-3">
        {streaming && progressFrames.length > 0 && <ProgressIndicator frames={progressFrames} />}
        {showBookmarkAction && (
          <div className="flex justify-end">
            <BookmarkButton prompt={prompt!} frames={frames} />
          </div>
        )}
        {streamingText && <p className="whitespace-pre-wrap text-sm leading-6">{streamingText}</p>}
        {!streamingText && finalSummary && (
          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{finalSummary}</p>
        )}
        {showStandaloneTable && (
          <div className="space-y-2">
            <div className="flex justify-end gap-1">
              <button
                type="button"
                className={ACTION_BUTTON_CLASS}
                disabled={tableRows.length === 0}
                onClick={() => downloadCsv(tableRows, "data.csv")}
              >
                CSV
              </button>
            </div>
            <DataTable rows={tableRows} />
          </div>
        )}
        {hasChart && (
          <div className="space-y-2">
            <div className="flex justify-end gap-1">
              <button
                type="button"
                className={ACTION_BUTTON_CLASS}
                onClick={() => {
                  setShowTable(false);
                  setSelectedChartFrameIndex(currentChartFrameIndex);
                }}
                aria-pressed={!isShowingCurrentChartTable}
              >
                Chart
              </button>
              <button
                type="button"
                className={ACTION_BUTTON_CLASS}
                onClick={() => {
                  setSelectedChartFrameIndex(currentChartFrameIndex);
                  setShowTable(true);
                }}
                aria-pressed={isShowingCurrentChartTable}
              >
                Data
              </button>
              <button
                type="button"
                className={ACTION_BUTTON_CLASS}
                disabled={chartRows.length === 0}
                onClick={() => downloadCsv(chartRows, "data.csv")}
              >
                CSV
              </button>
            </div>
            {isShowingCurrentChartTable ? (
              <DataTable rows={chartRows} />
            ) : (
              <>
                {pieSpec && <ReportPieChart spec={pieSpec} />}
                {!pieSpec && barLikeSpec && <ReportBarChart spec={barLikeSpec} />}
              </>
            )}
          </div>
        )}
        {errorFrame && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorFrame.data.message as string}
          </p>
        )}
      </div>
    </div>
  );
}

