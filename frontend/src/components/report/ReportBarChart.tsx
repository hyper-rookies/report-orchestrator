"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface ChartSpec {
  type?: string;
  title?: string;
  xAxis: string;
  series: Array<{ dataKey: string; label?: string }>;
  data: Record<string, unknown>[];
}

interface LegacyChartSpec {
  title?: string;
  xKey: string;
  yKey: string;
}

interface Props {
  spec: ChartSpec | LegacyChartSpec;
  [key: string]: unknown;
}

function isBackendChartSpec(spec: ChartSpec | LegacyChartSpec): spec is ChartSpec {
  return "xAxis" in spec && Array.isArray((spec as ChartSpec).series) && Array.isArray((spec as ChartSpec).data);
}

export default function ReportBarChart(props: Props) {
  const { spec } = props;

  const normalized = isBackendChartSpec(spec)
    ? spec
    : {
        title: spec.title,
        xAxis: spec.xKey,
        series: [{ dataKey: spec.yKey, label: spec.yKey }],
        data: (Array.isArray(props.rows) ? props.rows : []) as Record<string, unknown>[],
      };

  if (!Array.isArray(normalized.series) || normalized.series.length === 0) return null;
  if (!Array.isArray(normalized.data) || normalized.data.length === 0) return null;
  if (!normalized.xAxis) return null;

  const firstSeries = normalized.series[0];
  if (!firstSeries?.dataKey) {
    return null;
  }

  return (
    <div className="space-y-2 rounded-xl border border-border/90 bg-background p-3 shadow-[0_12px_30px_-22px_rgba(25,25,25,0.45)]">
      {normalized.title && <p className="text-sm font-semibold text-foreground">{normalized.title}</p>}
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={normalized.data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey={normalized.xAxis}
            tick={{ fontSize: 11, fill: "var(--foreground)" }}
            tickLine={{ stroke: "var(--border)" }}
            axisLine={{ stroke: "var(--border)" }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--foreground)" }}
            tickLine={{ stroke: "var(--border)" }}
            axisLine={{ stroke: "var(--border)" }}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--card)",
              color: "var(--foreground)",
            }}
          />
          <Bar
            dataKey={firstSeries.dataKey}
            name={firstSeries.label ?? firstSeries.dataKey}
            fill="var(--chart-3)"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
