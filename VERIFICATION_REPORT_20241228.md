# Schema Drift Fix Verification Report
**Date**: 2026-02-27
**Partition date under test**: `dt=2024-12-28`
**run_id generated**: `20260227T074916Z`

---

## Environment

| Item | Value |
|------|-------|
| AWS Account | `148761639846` |
| Role | `HyperLimitedAccessRole` (assume-role) |
| Region | `ap-northeast-2` |
| Athena database | `hyper_intern_m1c` |
| Athena workgroup | `hyper-intern-m1c-wg` |
| Data bucket | `hyper-intern-m1c-data-bucket` |

---

## Pre-fix State (Baseline — confirmed stale)

Captured via `aws glue get-table` **before** running `--recreate-curated-tables`:

### `appsflyer_installs_daily` (OLD — stale)
```
media_source  string
campaign      string
is_organic    boolean   <- stub-era artifact
installs      bigint
```
Partition keys: `dt STRING`, `run_id STRING`

### `appsflyer_events_daily` (OLD — stale)
```
media_source  string
campaign      string
event_name    string
is_organic    boolean   <- stub-era artifact
event_count   bigint
event_revenue double
```

---

## Step 2: Smoke Script Execution

**Command run:**
```bash
AWS_REGION=ap-northeast-2 \
ATHENA_WORKGROUP=hyper-intern-m1c-wg \
ATHENA_DATABASE=hyper_intern_m1c \
ATHENA_OUTPUT_S3="s3://hyper-intern-m1c-athena-results-bucket/athena-results/" \
DATA_BUCKET=hyper-intern-m1c-data-bucket \
python scripts/run_e2e_smoke.py \
  --dt 2024-12-28 \
  --skip-upload \
  --skip-create-raw-tables \
  --recreate-curated-tables
```

**Result: E2E SMOKE TEST PASSED**

Key phase outputs (trimmed):

| Phase | Action | Result |
|-------|--------|--------|
| 3 | Add raw dt-partitions | all 5 ok |
| 4 | Verify raw row counts | all 0 (expected — no raw data for 2024-12-28) |
| 5 | Run CTAS (all 5 datasets) | all SUCCEEDED |
| 6 | DROP + CREATE curated tables | all dropped + recreated |
| 7 | Add curated (dt, run_id) partitions | all ok |
| 7.5 | CREATE OR REPLACE VIEW v_latest_* | all ok |
| 8 | Final COUNT(*) via views | all 0 (expected), PASSED |

CTAS query IDs for audit:
- `appsflyer_events_daily`: `92dfdc1f-ace9-4f63-b6e6-b63eb1c5a44b`
- `appsflyer_installs_daily`: `a0c9b903-1dd1-4349-8516-2221c62f1e34`

---

## Step 3A: `information_schema` — `appsflyer_installs_daily`

**Query:**
```sql
SELECT column_name, data_type, ordinal_position
FROM information_schema.columns
WHERE table_schema = 'hyper_intern_m1c'
  AND table_name   = 'appsflyer_installs_daily'
ORDER BY ordinal_position;
```

**Result:**
```
 1.  media_source         varchar
 2.  campaign             varchar
 3.  keyword              varchar
 4.  adset                varchar
 5.  ad                   varchar
 6.  channel              varchar
 7.  app_version          varchar
 8.  campaign_type        varchar
 9.  match_type           varchar
10.  store_reinstall      varchar
11.  installs             bigint
12.  dt                   varchar   (partition key)
13.  run_id               varchar   (partition key)
```

| Check | Result |
|-------|--------|
| `store_reinstall` present | PASS |
| `campaign_type` present | PASS |
| `match_type` present | PASS |
| `run_id` present (partition) | PASS |
| `is_organic` ABSENT | PASS |

---

## Step 3B: `information_schema` — `appsflyer_events_daily`

**Query:**
```sql
SELECT column_name, data_type, ordinal_position
FROM information_schema.columns
WHERE table_schema = 'hyper_intern_m1c'
  AND table_name   = 'appsflyer_events_daily'
ORDER BY ordinal_position;
```

**Result:**
```
 1.  media_source         varchar
 2.  campaign             varchar
 3.  event_name           varchar
 4.  keyword              varchar
 5.  adset                varchar
 6.  ad                   varchar
 7.  channel              varchar
 8.  app_version          varchar
 9.  campaign_type        varchar
10.  match_type           varchar
11.  store_reinstall      varchar
12.  event_count          bigint
13.  event_revenue        double
14.  dt                   varchar   (partition key)
15.  run_id               varchar   (partition key)
```

| Check | Result |
|-------|--------|
| `store_reinstall` present | PASS |
| `campaign_type` present | PASS |
| `match_type` present | PASS |
| `run_id` present (partition) | PASS |
| `event_name` present | PASS |
| `event_count` present | PASS |
| `event_revenue` present | PASS |
| `is_organic` ABSENT | PASS |

---

## Step 4: View Column Resolution — `v_latest_appsflyer_installs_daily`

**Query:**
```sql
SELECT store_reinstall, campaign_type, match_type, run_id, COUNT(*) AS n
FROM hyper_intern_m1c.v_latest_appsflyer_installs_daily
WHERE dt = '2024-12-28'
GROUP BY 1, 2, 3, 4
LIMIT 5;
```

**Result:**
```
Query state  : SUCCEEDED
Header       : ['store_reinstall', 'campaign_type', 'match_type', 'run_id', 'n']
Data rows    : 0  (expected — no raw data was uploaded for dt=2024-12-28)
```

| Check | Result |
|-------|--------|
| Query executed without column error | PASS |
| `store_reinstall` resolved by view | PASS |
| `campaign_type` resolved by view | PASS |
| `match_type` resolved by view | PASS |
| `run_id` resolved by view (partition key) | PASS |
| 0 data rows (no raw data for this dt) | EXPECTED |

---

## Overall Result

| Check | Status |
|-------|--------|
| Pre-fix: `is_organic` confirmed in stale schema | CONFIRMED |
| Smoke script table recreation succeeded | PASS |
| CTAS succeeded for all 5 datasets | PASS |
| `appsflyer_installs_daily` schema matches CTAS SELECT | PASS |
| `appsflyer_events_daily` schema matches CTAS SELECT | PASS |
| `is_organic` removed from both tables | PASS |
| All 8 additional_fields columns present in installs | PASS |
| All 8 additional_fields columns present in events | PASS |
| `run_id` accessible as partition column via views | PASS |
| `v_latest_appsflyer_installs_daily` view resolves new columns | PASS |

**SCHEMA DRIFT FIX: VERIFIED**

---

## Notes

1. **0-row count is expected**: `dt=2024-12-28` was chosen to avoid permission
   constraints. No raw data was uploaded for that date, so all COUNT(*) = 0.
   Schema correctness is verified independently of row count via `information_schema`
   and the view column resolution query.

2. **`run_id` is not in `_CURATED_SCHEMAS`**: It is correctly handled by the
   `PARTITIONED BY (dt STRING, run_id STRING)` clause in the DDL builder.
   `information_schema` shows it at position 13/15 because Athena exposes partition
   keys as virtual columns after the data columns.

3. **`appsflyer_retention_daily` still has `is_organic`**: This is intentional.
   That table has no production data source (Cohort API is out of Phase 1 scope)
   and is not in the orchestrator `allowed_views`. No change was made.

4. **Windows cp949 encoding note**: The verification script hit a `UnicodeEncodeError`
   on an em dash in an inline comment string when printed to the Windows console.
   This did not affect query execution. Query C was re-run as a separate script and
   succeeded.
