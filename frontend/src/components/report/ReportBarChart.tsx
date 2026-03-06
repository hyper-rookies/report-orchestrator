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
    <div className="space-y-1">
      {normalized.title && <p className="text-sm font-medium">{normalized.title}</p>}
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={normalized.data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={normalized.xAxis} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar
            dataKey={firstSeries.dataKey}
            name={firstSeries.label ?? firstSeries.dataKey}
            fill="var(--chart-1)"
            radius={[3, 3, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

