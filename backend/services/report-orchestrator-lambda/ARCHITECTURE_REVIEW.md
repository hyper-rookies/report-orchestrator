# Architecture Compatibility Review
## Lambda Orchestrator ↔ Python Ingestion/Curation Pipeline

---

## 1. Existing Curated View / Table Inventory

Created by `run_e2e_smoke.py` Phase 7.5 (`CREATE OR REPLACE VIEW`):

| View name                             | Base table                    | Source      | Status    |
|---------------------------------------|-------------------------------|-------------|-----------|
| `v_latest_ga4_acquisition_daily`      | `ga4_acquisition_daily`       | ga4         | ✅ Exists |
| `v_latest_ga4_engagement_daily`       | `ga4_engagement_daily`        | ga4         | ✅ Exists |
| `v_latest_appsflyer_installs_daily`   | `appsflyer_installs_daily`    | appsflyer   | ✅ Exists |
| `v_latest_appsflyer_events_daily`     | `appsflyer_events_daily`      | appsflyer   | ✅ Exists |
| `v_latest_appsflyer_retention_daily`  | `appsflyer_retention_daily`   | appsflyer   | ⚠️ Exists (NOT in orchestrator scope — no data source yet) |

**View SQL pattern** (from `run_e2e_smoke.py:494`):
```sql
CREATE OR REPLACE VIEW {database}.v_latest_{dataset} AS
SELECT * FROM (
  SELECT *,
         DENSE_RANK() OVER (PARTITION BY dt ORDER BY run_id DESC) AS _run_rank
  FROM {database}.{dataset}
) t
WHERE t._run_rank = 1
```

**Consequence**: `_run_rank` (BIGINT) is included in `SELECT *` output.
The orchestrator and discovery script MUST filter it. ✅ Already handled in `catalog_discovered.json`.

---

## 2. Fits As-Is

| Item | Detail |
|------|--------|
| View naming convention | `v_latest_*` — stable, predictable, no orchestrator changes needed |
| Partition scheme | `PARTITIONED BY (dt STRING, run_id STRING)` — orchestrator queries views, never the base tables, so compound partition is transparent |
| S3 layout | `curated/{dataset}/dt={dt}/run={run_id}/` — orchestrator does not need to know this |
| Athena workgroup | `hyper-intern-m1c-wg` — reuse for orchestrator Athena queries |
| Database name | `hyper_intern_m1c` — matches `env_guard.py` expected values |
| Region | `ap-northeast-2` (Seoul) — matches `env_guard.py` guard |
| GA4 schema | `_CURATED_SCHEMAS` for `ga4_acquisition_daily` and `ga4_engagement_daily` match actual CTAS SQL — no conflict |

---

## 3. Confirmed Conflicts (exact locations)

### CONFLICT 1 — CRITICAL: `_CURATED_SCHEMAS` stale for AppsFlyer tables

**File**: `scripts/run_e2e_smoke.py:86-107`

The AppsFlyer curated table DDL in `_CURATED_SCHEMAS` does NOT match the CTAS SELECT bodies in `ctas.py`.

| Dataset | `_CURATED_SCHEMAS` declares | CTAS actually writes |
|---------|-----------------------------|----------------------|
| `appsflyer_installs_daily` | `media_source, campaign, is_organic BOOLEAN, installs` (4 cols) | `media_source, campaign, keyword, adset, ad, channel, app_version, campaign_type, match_type, store_reinstall, installs` (11 cols) |
| `appsflyer_events_daily` | `media_source, campaign, event_name, is_organic BOOLEAN, event_count, event_revenue` (6 cols) | `media_source, campaign, event_name, keyword, adset, ad, channel, app_version, campaign_type, match_type, store_reinstall, event_count, event_revenue` (13 cols) |

**Impact**: If `run_e2e_smoke.py --recreate-curated-tables` is run, the Glue table is created with the OLD 4/6-column schema. Parquet files written by CTAS have 12/14 columns. Athena's `SELECT *` via the view returns wrong/missing columns. `catalog_discovered.json` would then contain wrong column info.

**Fix required** (additive, in `run_e2e_smoke.py`):
```python
# Replace _CURATED_SCHEMAS["appsflyer_installs_daily"] with:
"appsflyer_installs_daily": (
    "  media_source    STRING,\n"
    "  campaign        STRING,\n"
    "  keyword         STRING,\n"
    "  adset           STRING,\n"
    "  ad              STRING,\n"
    "  channel         STRING,\n"
    "  app_version     STRING,\n"
    "  campaign_type   STRING,\n"
    "  match_type      STRING,\n"
    "  store_reinstall STRING,\n"
    "  installs        BIGINT"
),
# Replace _CURATED_SCHEMAS["appsflyer_events_daily"] with:
"appsflyer_events_daily": (
    "  media_source    STRING,\n"
    "  campaign        STRING,\n"
    "  event_name      STRING,\n"
    "  keyword         STRING,\n"
    "  adset           STRING,\n"
    "  ad              STRING,\n"
    "  channel         STRING,\n"
    "  app_version     STRING,\n"
    "  campaign_type   STRING,\n"
    "  match_type      STRING,\n"
    "  store_reinstall STRING,\n"
    "  event_count     BIGINT,\n"
    "  event_revenue   DOUBLE"
),
```
After editing, run `--recreate-curated-tables` once, then re-run the smoke test.

---

### CONFLICT 2 — LOW: `CtasCurateAndRegisterUseCase` broken for compound partition

**File**: `src/report_system/application/curation/use_cases.py:61`

```python
self._registrar.add_partition(table=dataset_id, dt=dt, location=curated_location)
```

`AthenaPartitionManager.add_partition()` only generates `ALTER TABLE ... PARTITION (dt='...')`.
The new scheme requires `PARTITION (dt='...', run_id='...')`.

**Impact**: The curation use case cannot register partitions. The smoke script bypasses this with raw SQL. No orchestrator impact — the orchestrator queries views, not base tables — but the production Lambda ingestion pipeline would fail at the partition registration step.

**Fix required**: Not needed for orchestrator Phase 1. Log as a backlog item for the production ingestion pipeline.

---

### CONFLICT 3 — LOW: `store_reinstall` is STRING, not BOOLEAN

**File**: `ctas.py:110` (AppsFlyer installs SELECT), `ctas.py:121` (events SELECT)

The CTAS stores `store_reinstall` as `STRING` (`'true'` / `'false'`). The old schema had `is_organic BOOLEAN`. Policy doc and LLM must use `store_reinstall != 'true'` (string comparison), not `store_reinstall = FALSE`.

Already documented in `reporting_policy.json`. No code conflict, but LLM prompt engineering must be explicit.

---

## 4. Minimal-Change Plan

All changes are additive or in the smoke script only.

| Priority | Action | File | Type |
|----------|--------|------|------|
| P0 — Before running orchestrator | Fix `_CURATED_SCHEMAS` for appsflyer tables | `run_e2e_smoke.py:86-107` | Edit |
| P0 — Before running orchestrator | Run `--recreate-curated-tables` for appsflyer tables only | CLI | One-time |
| P0 — Before running orchestrator | Regenerate `catalog_discovered.json` | `npx ts-node scripts/discover-catalog.ts` | Script |
| P1 — Orchestrator bootstrap | Create TS package scaffold | `services/report-orchestrator-lambda/` | New |
| P2 — Backlog | Fix `CtasCurateAndRegisterUseCase` compound partition | `application/curation/use_cases.py` | Edit |

---

## 5. Risks / Concerns to Record

### R1 — Glue does NOT return column list for Athena views ⚠️
**Concern**: `GetTable` for an Athena view returns `StorageDescriptor.Columns = []`.
Actual columns are only available via `SHOW COLUMNS IN view_name` or parsing `ViewOriginalText` (stored as base64 in some Athena versions).
**Evidence looked at**: AWS Glue GetTable API behavior for views is documented as returning empty Columns.
**Mitigation in discovery script**: Three-tier fallback implemented. Phase 1 uses static fallback from existing `catalog_discovered.json`.
**Action required**: Validate after running `discover-catalog.ts` that column counts are correct; if Glue returns 0 columns, verify the static fallback is used.

### R2 — `_CURATED_SCHEMAS` and CTAS SQL are two sources of truth ⚠️
**Concern**: The Glue external table DDL (in `run_e2e_smoke.py`) and the CTAS SELECT (in `ctas.py`) can drift silently. They are not generated from a single source.
**Evidence**: Already drifted — appsflyer schemas are stale (Conflict 1 above).
**Mitigation**: Consider generating `_CURATED_SCHEMAS` from the CTAS registry at a future point. For now, treat `ctas.py` SELECT bodies as the canonical source and keep `_CURATED_SCHEMAS` in sync manually.

### R3 — `run_id` column appears in `SELECT *` from views ⚠️
**Concern**: `run_id` is a Hive partition column. `SELECT *` from the base table includes it. The view uses `SELECT *`, so `run_id` is visible to the orchestrator.
**Evidence**: `run_e2e_smoke.py:497` view SQL is `SELECT *`.
**Mitigation**: `run_id` is classified as `"role": "internal"` in `catalog_discovered.json` and listed in `denied_columns_global` in `reporting_policy.json`. The orchestrator must strip it during allowlist enforcement.

### R4 — Views may not exist on a fresh account / environment ⚠️
**Concern**: `v_latest_*` views are created by `run_e2e_smoke.py` Phase 7.5, not by any Terraform/CDK. If the environment is recreated (different Glue database), views must be manually recreated.
**Evidence**: No IaC code found in the repo that manages views.
**Mitigation**: Add view creation to a CDK/CloudFormation stack before production deployment.

### R5 — `appsflyer_retention_daily` has no data source ⚠️
**Concern**: `REGISTRY` in `ctas.py` contains `appsflyer_retention_daily`. The CTAS exists. A `v_latest_appsflyer_retention_daily` view is created by the smoke script. But there is no connector or use case for the AppsFlyer Cohort API (retention data).
**Evidence**: Comment from previous design session — "retention not from Pull API; Cohort API out of scope Phase 1".
**Mitigation**: Exclude `v_latest_appsflyer_retention_daily` from `allowed_views` in `reporting_policy.json` (already excluded). The empty table will remain in Glue but is never queried.

### R6 — Function URL SSE: Lambda response streaming constraints ⚠️
**Concern**: AWS Lambda Function URL supports streaming responses (SSE) only via `responseStream` mode using `awslambda.streamifyResponse()`. This requires Node.js 18+ runtime and `InvokeMode: RESPONSE_STREAM` on the Function URL.
**Evidence**: Not yet implemented; no Lambda code exists.
**Mitigation**: Document this constraint. Lambda IAM policy must include `lambda:InvokeFunctionUrl`.

### R7 — Bedrock model IAM permissions scope ⚠️
**Concern**: `bedrock:InvokeModel` must specify the exact model ARN. If `claude-3-sonnet` is used for the orchestrator, the model must be enabled in `ap-northeast-2`. Not all Bedrock models are available in Seoul.
**Evidence**: Not verified — no Bedrock code exists yet.
**Mitigation**: Verify model availability in `ap-northeast-2` before implementing.

### R8 — `is_organic` removal changes historical query compatibility
**Concern**: If any existing Athena queries, Superset dashboards, or BI tools use `is_organic` on AppsFlyer curated tables, they will break after `--recreate-curated-tables`.
**Evidence**: Only the smoke script currently queries these tables.
**Mitigation**: Safe to proceed for Phase 1 (no downstream consumers yet). Document for future stakeholder awareness.

---

## 6. Recommended TypeScript Package Folder Layout (DDD style)

```
services/
  report-orchestrator-lambda/
    src/
      domain/
        report/
          report-request.ts          # value object: {viewName, dateRange, dimensions, metrics}
          query-plan.ts              # value object: validated JSON the LLM produces
          report-result.ts           # value object: {rows, columnHeaders, rowCount, truncated}
          allowlist.ts               # pure functions: validateRequest(request, policy)
      application/
        generate-report.use-case.ts  # orchestrates: validate → prompt → execute → format
      infrastructure/
        athena/
          athena-query-runner.ts     # StartQueryExecution + poll + GetResults
          result-mapper.ts           # Athena ResultSet → ReportResult
        bedrock/
          bedrock-client.ts          # InvokeModelWithResponseStream
          prompt-builder.ts          # builds system prompt from catalog + policy
        glue/
          catalog-loader.ts          # loads catalog_discovered.json (local file, no runtime Glue call)
      interface/
        lambda-handler.ts            # Function URL entry point; SSE via awslambda.streamifyResponse
        sse-formatter.ts             # chunks ReportResult into SSE events
      shared/
        catalog_discovered.json      # AUTO-GENERATED (committed)
        reporting_policy.json        # HAND-MANAGED (committed)
    scripts/
      discover-catalog.ts            # npm run discover-catalog
    tests/
      unit/
        allowlist.test.ts
        prompt-builder.test.ts
        result-mapper.test.ts
      integration/
        athena-query-runner.test.ts  # requires real AWS creds
    package.json
    tsconfig.json
    .env.example
```

**Key design principle**: `catalog_discovered.json` and `reporting_policy.json` are loaded at Lambda cold-start as local files (not fetched from Glue/S3 at runtime). This keeps query latency low and makes the allowlist enforcement deterministic. Re-deploy the Lambda when schemas change.
