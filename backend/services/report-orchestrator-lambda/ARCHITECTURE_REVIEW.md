# Architecture Compatibility Review
## Orchestrator and Athena Catalog Status

Last updated: 2026-03-10

## Summary

The current repository and the currently deployed Athena catalog are not in the same state.

- Repository intent at `HEAD`: curated tables are run-versioned and the `v_latest_*` views resolve the latest run per `dt` using `run_id`.
- Verified deployed Athena state on 2026-03-10: `appsflyer_installs_daily` exposes only `dt` partitions, and `run_id` cannot be resolved.
- Result: queries against `hyper_intern_m1c.v_latest_appsflyer_installs_daily` can fail even though the view itself exists.

This mismatch is the main reason the existing docs were confusing.

## History Confirmed From Git

The relevant schema changes did happen in the repo, and the docs did not fully keep up.

| Date | Commit | What changed | Why it matters |
|------|--------|--------------|----------------|
| 2026-02-27 | `7a79188` | Introduced run-versioned curation in `ctas.py` and `run_e2e_smoke.py` | Curated output moved to `curated/<dataset>/dt=<dt>/run=<run_id>/`, curated tables moved to `PARTITIONED BY (dt, run_id)`, and `v_latest_*` views began ranking by `run_id DESC` |
| 2026-03-06 | `3f4f358` | Renamed retention artifacts from `appsflyer_retention_daily` to `appsflyer_cohort_daily` | Older docs mentioning `appsflyer_retention_daily` became stale |

The previous version of this review still mixed pre-`run_id` assumptions, post-`run_id` design notes, and the old retention dataset name.

## Current Repo Design

The repository currently expects the following shape.

### CTAS output

`backend/src/report_system/infrastructure/athena/ctas.py` now:

- writes curated output under `curated/<dataset_id>/dt=<dt>/run=<run_id>/`
- appends a literal `run_id` column to the CTAS `SELECT` body when `run_id` is provided
- treats `run_id` as execution-version metadata for curated outputs

### Curated table DDL and views

`backend/scripts/run_e2e_smoke.py` now:

- creates curated external tables as `PARTITIONED BY (dt STRING, run_id STRING)`
- registers curated partitions with `ADD IF NOT EXISTS PARTITION (dt='...', run_id='...')`
- creates `v_latest_<dataset>` views using:

```sql
SELECT * FROM (
  SELECT *,
         DENSE_RANK() OVER (PARTITION BY dt ORDER BY run_id DESC) AS _run_rank
  FROM <base_table>
) t
WHERE t._run_rank = 1
```

### Query-layer assumptions

The query and orchestrator layer also assume this design:

- `backend/services/query-lambda/reporting_policy.json` denies `_run_rank` and `run_id`
- `backend/services/query-lambda/catalog_discovered.json` models the `v_latest_*` views, including internal `run_id`
- `backend/services/query-lambda/row_mapper.py` strips `_run_rank` and `run_id` from results

## Verified Deployed Athena State

Based on Athena console diagnostics run on 2026-03-10:

### `hyper_intern_m1c.v_latest_appsflyer_installs_daily`

- `SHOW CREATE VIEW hyper_intern_m1c.v_latest_appsflyer_installs_daily` succeeds
- the view exists in Glue/Athena

### `hyper_intern_m1c.appsflyer_installs_daily`

- `SHOW PARTITIONS hyper_intern_m1c.appsflyer_installs_daily` succeeds
- returned partitions are `dt=...` only
- no `run_id=...` partition entries were observed
- queries referencing `run_id` fail with:

```text
COLUMN_NOT_FOUND: Column 'run_id' cannot be resolved
```

### Practical implication

The deployed base table is still effectively a `dt`-only table, while the repo now expects a `dt + run_id` table.

That means one of the following is true in the deployed environment:

1. the curated tables were never migrated to the newer `PARTITIONED BY (dt, run_id)` design
2. the curated tables were recreated back to `dt`-only after the repo moved on
3. the `v_latest_*` views were recreated using the newer SQL against an older base table

Any of those states will break `v_latest_appsflyer_installs_daily` at query time.

## What Was Actually Stale

The previous review had multiple stale statements.

### Stale item 1: retention dataset name

Old docs referred to:

- `appsflyer_retention_daily`
- `v_latest_appsflyer_retention_daily`

Current repo code uses:

- `appsflyer_cohort_daily`
- `v_latest_appsflyer_cohort_daily`

### Stale item 2: AppsFlyer curated schema conflict

The old review said `_CURATED_SCHEMAS` in `run_e2e_smoke.py` was stale for AppsFlyer installs/events.

That was true before, but it is no longer true at `HEAD`.

Current `run_e2e_smoke.py` already matches `ctas.py` for:

- `appsflyer_installs_daily`
- `appsflyer_events_daily`
- `appsflyer_cohort_daily`

### Stale item 3: the main risk was framed as code conflict only

The larger active problem is not just code drift inside the repo.

The current active problem is:

- repo design expects `run_id`
- deployed Athena catalog does not currently expose `run_id`

That is an environment drift problem.

## Recommended Recovery Paths

### Option A: Align Athena to the repo design

Recommended if `v_latest_*` is supposed to mean "latest run per day".

1. Recreate curated base tables as `PARTITIONED BY (dt STRING, run_id STRING)`.
2. Register curated partitions with both `dt` and `run_id`.
3. Recreate the `v_latest_*` views.
4. Regenerate and redeploy `catalog_discovered.json` if needed.

This matches the current code and avoids more special cases.

### Option B: Emergency compatibility fallback

Recommended only if you need the chat product working immediately and cannot migrate Athena today.

1. Rebuild `v_latest_appsflyer_installs_daily` against the current `dt`-only base table.
2. Remove the `run_id` ranking logic from that view.
3. Accept that "latest run" semantics are temporarily lost.

This makes the environment match the older table shape, not the current repo design.

## Minimal Diagnostic Checklist

Use these commands to distinguish repo design from deployed reality.

```sql
SHOW CREATE VIEW hyper_intern_m1c.v_latest_appsflyer_installs_daily;
```

```sql
SHOW PARTITIONS hyper_intern_m1c.appsflyer_installs_daily;
```

```sql
SELECT
  media_source,
  SUM(installs) AS installs
FROM hyper_intern_m1c.appsflyer_installs_daily
WHERE dt BETWEEN '2024-11-01' AND '2024-11-30'
GROUP BY 1
ORDER BY 2 DESC;
```

If `SHOW PARTITIONS` returns only `dt=...` and `run_id` queries fail, the deployment has not been migrated to the repo's run-versioned design.

## Decision

Treat the repo's `run_id` model as the intended design.

Treat the currently deployed Athena catalog as behind that design until the curated tables and views are migrated together.
