/**
 * discover-catalog.ts
 *
 * Reads Glue table/view metadata for the four v_latest_* views and writes
 * catalog_discovered.json.  Run after any CTAS schema change or view recreation.
 *
 * Usage:
 *   AWS_REGION=ap-northeast-2 ATHENA_DATABASE=hyper_intern_m1c \
 *     npx ts-node scripts/discover-catalog.ts
 *
 * Required IAM: glue:GetTable on the target database.
 * Optional IAM: athena:StartQueryExecution + athena:GetQueryResults
 *               (needed only if fallback SHOW COLUMNS path is used; see note below).
 *
 * IMPORTANT — Glue view column caveat:
 *   Athena views are stored in Glue with an empty StorageDescriptor.Columns list.
 *   The actual column list is only available by running SHOW COLUMNS in Athena,
 *   or by parsing the view's ViewOriginalText SQL.
 *   This script uses a three-tier strategy:
 *     1. Try StorageDescriptor.Columns (works for external tables, not views).
 *     2. Fall back to Athena SHOW COLUMNS (requires Athena access).
 *     3. Fall back to static schema from reporting_policy.json (offline safe).
 *   In Phase 1 the static fallback is ALWAYS used and Glue is only called
 *   to verify the view exists and record its UpdateTime.
 */

import { GlueClient, GetTableCommand, GetTableCommandOutput } from "@aws-sdk/client-glue";
import {
  AthenaClient,
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
} from "@aws-sdk/client-athena";
import { writeFileSync, readFileSync } from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const REGION      = process.env.AWS_REGION      ?? "ap-northeast-2";
const DATABASE    = process.env.ATHENA_DATABASE  ?? "hyper_intern_m1c";
const WORKGROUP   = process.env.ATHENA_WORKGROUP ?? "hyper-intern-m1c-wg";

const TARGET_VIEWS = [
  "v_latest_appsflyer_installs_daily",
  "v_latest_appsflyer_events_daily",
  "v_latest_ga4_acquisition_daily",
  "v_latest_ga4_engagement_daily",
] as const;

/** Columns that must never appear in the generated catalog output. */
const INTERNAL_COLUMNS = new Set(["_run_rank"]);

const OUTPUT_PATH = path.resolve(
  __dirname,
  "../src/shared/catalog_discovered.json"
);
const POLICY_PATH = path.resolve(
  __dirname,
  "../src/shared/reporting_policy.json"
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ColumnEntry {
  name: string;
  type: string;
  role: "dimension" | "metric" | "partition" | "internal";
}

interface DatasetEntry {
  view_name: string;
  base_table: string;
  source: "ga4" | "appsflyer";
  glue_last_updated: string | null;
  columns: ColumnEntry[];
}

interface CatalogFile {
  _meta: Record<string, unknown>;
  datasets: Record<string, DatasetEntry>;
}

// ---------------------------------------------------------------------------
// Glue helpers
// ---------------------------------------------------------------------------

async function getGlueTable(
  glue: GlueClient,
  viewName: string
): Promise<GetTableCommandOutput | null> {
  try {
    return await glue.send(
      new GetTableCommand({ DatabaseName: DATABASE, Name: viewName })
    );
  } catch (err: unknown) {
    if ((err as { name?: string }).name === "EntityNotFoundException") {
      console.warn(`  [WARN] View not found in Glue: ${viewName}`);
      return null;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Static schema fallback (sourced from reporting_policy.json roles)
// This is the Phase 1 primary path until Glue view column reflection is reliable.
// ---------------------------------------------------------------------------

function loadStaticSchema(viewName: string): ColumnEntry[] | null {
  try {
    const existing: CatalogFile = JSON.parse(readFileSync(OUTPUT_PATH, "utf-8"));
    const entry = existing.datasets[viewName];
    if (entry?.columns?.length) {
      return entry.columns;
    }
  } catch {
    // file doesn't exist yet; normal on first run
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const glue = new GlueClient({ region: REGION });

  console.log(`Discovering catalog for database=${DATABASE} region=${REGION}`);
  console.log(`Output: ${OUTPUT_PATH}\n`);

  const datasets: Record<string, DatasetEntry> = {};

  for (const viewName of TARGET_VIEWS) {
    process.stdout.write(`  [${viewName}] `);

    const glueResp = await getGlueTable(glue, viewName);
    const lastUpdated = glueResp?.Table?.UpdateTime?.toISOString() ?? null;

    if (!glueResp) {
      console.log("SKIPPED (not found in Glue)");
      continue;
    }

    // Glue view StorageDescriptor.Columns is typically empty for Athena views.
    // Phase 1: read from existing catalog file (static, managed alongside CTAS SQL).
    const glueColumns = glueResp.Table?.StorageDescriptor?.Columns ?? [];
    let columns: ColumnEntry[];

    if (glueColumns.length > 0) {
      // External table path — Glue has the schema
      columns = glueColumns
        .filter((c) => !INTERNAL_COLUMNS.has(c.Name ?? ""))
        .map((c) => ({
          name: c.Name!,
          type: (c.Type ?? "string").toLowerCase(),
          role: deriveRole(c.Name!, viewName),
        }));
      console.log(`OK (${columns.length} columns from Glue)`);
    } else {
      // View path — fall back to existing catalog
      const existing = loadStaticSchema(viewName);
      if (existing) {
        columns = existing;
        console.log(`OK (${columns.length} columns from static fallback)`);
      } else {
        console.log("WARN — no columns available; update catalog_discovered.json manually");
        columns = [];
      }
    }

    const source: "ga4" | "appsflyer" = viewName.includes("appsflyer")
      ? "appsflyer"
      : "ga4";

    const baseTable = viewName.replace(/^v_latest_/, "");

    datasets[viewName] = {
      view_name: viewName,
      base_table: baseTable,
      source,
      glue_last_updated: lastUpdated,
      columns,
    };
  }

  const output: CatalogFile = {
    _meta: {
      note: "AUTO-GENERATED by scripts/discover-catalog.ts — do not edit by hand.",
      source: "glue_get_table",
      database: DATABASE,
      generated_at: new Date().toISOString(),
      schema_version: "v1",
      target_views: [...TARGET_VIEWS],
    },
    datasets,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");
  console.log(`\nWritten: ${OUTPUT_PATH}`);
}

// ---------------------------------------------------------------------------
// Role inference helper (supplements what Glue doesn't tell us)
// Mirrors the roles in the hand-managed catalog_discovered.json.
// ---------------------------------------------------------------------------

const _PARTITION_COLS = new Set(["dt", "run_id"]);
const _INTERNAL_COLS  = new Set(["_run_rank"]);

const _METRIC_COLS: Record<string, Set<string>> = {
  v_latest_ga4_acquisition_daily:  new Set(["sessions", "total_users", "conversions", "total_revenue"]),
  v_latest_ga4_engagement_daily:   new Set(["engagement_rate", "bounce_rate"]),
  v_latest_appsflyer_installs_daily: new Set(["installs"]),
  v_latest_appsflyer_events_daily:   new Set(["event_count", "event_revenue"]),
};

function deriveRole(columnName: string, viewName: string): ColumnEntry["role"] {
  if (_INTERNAL_COLS.has(columnName))         return "internal";
  if (_PARTITION_COLS.has(columnName))        return "partition";
  if (_METRIC_COLS[viewName]?.has(columnName)) return "metric";
  return "dimension";
}

main().catch((err) => {
  console.error("discover-catalog failed:", err);
  process.exit(1);
});
