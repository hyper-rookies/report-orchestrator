import { existsSync, readFileSync } from "fs";
import path from "path";

type PolicyViewConfig = {
  allowed: string[];
  phase_deferred: string[];
};

type MetricConfig = {
  allowed: string[];
  derived?: Record<string, { definition: string; note?: string }>;
};

type ReportingPolicy = {
  allowed_views: string[];
  date_filter_policy: {
    column: string;
    max_lookback_days: number;
  };
  dimensions: Record<string, PolicyViewConfig>;
  metrics: Record<string, MetricConfig>;
};

type Catalog = {
  datasets: Record<
    string,
    {
      view_name: string;
      source: string;
      columns: Array<{ name: string; type: string; role: string }>;
    }
  >;
};

export type ViewSchema = {
  view: string;
  source: string;
  dimensions: string[];
  metrics: string[];
  derivedMetrics: string[];
  phaseDeferred: string[];
  dateColumn: string;
};

type SharedSchemaConfig = {
  maxLookbackDays: number;
  dateColumn: string;
  allowedViews: string[];
  views: Record<string, ViewSchema>;
};

let cachedConfig: SharedSchemaConfig | null = null;

export function getSharedSchemaConfig(): SharedSchemaConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const policy = readSharedJson<ReportingPolicy>("reporting_policy.json");
  const catalog = readSharedJson<Catalog>("catalog_discovered.json");

  const views = Object.fromEntries(
    policy.allowed_views.map((view) => {
      const dataset = catalog.datasets[view];
      const dimensionConfig = policy.dimensions[view];
      const metricConfig = policy.metrics[view];
      if (!dataset || !dimensionConfig || !metricConfig) {
        throw new Error(`Shared schema config is incomplete for view '${view}'.`);
      }
      const derivedMetrics = Object.keys(metricConfig.derived ?? {});
      return [
        view,
        {
          view,
          source: dataset.source,
          dimensions: [...dimensionConfig.allowed],
          metrics: [...metricConfig.allowed],
          derivedMetrics,
          phaseDeferred: [...dimensionConfig.phase_deferred],
          dateColumn: policy.date_filter_policy.column,
        } satisfies ViewSchema,
      ];
    })
  );

  cachedConfig = {
    maxLookbackDays: policy.date_filter_policy.max_lookback_days,
    dateColumn: policy.date_filter_policy.column,
    allowedViews: [...policy.allowed_views],
    views,
  };
  return cachedConfig;
}

function readSharedJson<T>(filename: string): T {
  for (const baseDir of resolveSharedDirectories()) {
    const fullPath = path.join(baseDir, filename);
    if (existsSync(fullPath)) {
      return JSON.parse(readFileSync(fullPath, "utf-8")) as T;
    }
  }
  throw new Error(`Shared schema asset '${filename}' was not found.`);
}

function resolveSharedDirectories(): string[] {
  return [
    path.resolve(__dirname, "shared"),
    path.resolve(__dirname, "../src/shared"),
  ];
}
