import { SseFrame } from "@/hooks/useSse";
import DataTable from "@/components/report/DataTable";
import ReportBarChart from "@/components/report/ReportBarChart";

import ProgressIndicator from "./ProgressIndicator";

interface Props {
  frames: SseFrame[];
  streaming?: boolean;
}

type ChartSpec = Parameters<typeof ReportBarChart>[0]["spec"];

export default function AssistantMessage({ frames, streaming }: Props) {
  const progressFrames = frames.filter((f) => f.type === "progress");
  const chunkFrames = frames.filter((f) => f.type === "chunk");
  const tableFrame = [...frames].reverse().find((f) => f.type === "table");
  const chartFrame = [...frames].reverse().find((f) => f.type === "chart");
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

  const rawChartSpec = chartFrame?.data.spec as
    | {
        type?: string;
        title?: string;
        xAxis?: string;
        series?: Array<{ metric?: string }>;
        data?: Record<string, unknown>[];
      }
    | undefined;
  const firstSeriesMetric = rawChartSpec?.series?.[0]?.metric;
  const chartSpec: ChartSpec | null =
    typeof rawChartSpec?.xAxis === "string" && typeof firstSeriesMetric === "string"
      ? {
          xKey: rawChartSpec.xAxis,
          yKey: firstSeriesMetric,
          ...(typeof rawChartSpec.title === "string" ? { title: rawChartSpec.title } : {}),
        }
      : null;
  const chartRows = Array.isArray(rawChartSpec?.data)
    ? (rawChartSpec.data as Record<string, unknown>[])
    : tableRows;

  return (
    <div className="flex justify-start">
      <div className="nhn-panel max-w-[88%] space-y-3 px-4 py-3">
        {streaming && progressFrames.length > 0 && <ProgressIndicator frames={progressFrames} />}
        {streamingText && <p className="whitespace-pre-wrap text-sm leading-6">{streamingText}</p>}
        {!streamingText && finalSummary && (
          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{finalSummary}</p>
        )}
        {tableFrame && <DataTable rows={tableRows} />}
        {chartFrame && chartSpec && chartRows.length > 0 && (
          <ReportBarChart rows={chartRows} spec={chartSpec} />
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

