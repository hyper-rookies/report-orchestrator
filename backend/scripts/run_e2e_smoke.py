"""E2E smoke test: mock raw -> S3 upload -> Athena CTAS -> curated verify.

Pipeline (8 phases + view creation):
  1) Upload local mock JSONL.GZ -> S3 raw/
  2) Create raw external tables   (CREATE EXTERNAL TABLE IF NOT EXISTS)
  3) Add raw dt-partitions        (ALTER TABLE ADD IF NOT EXISTS PARTITION)
  4) Verify raw row counts        (SELECT COUNT(*) per raw table)
  5) Run Athena CTAS              (raw -> curated Parquet, all 5 datasets)
       Each run writes to: curated/<dataset>/dt=<dt>/run=<run_id>/
       run_id is auto-generated (UTC YYYYMMDDTHHMMSSz) -- no delete needed.
  6) Create curated external tables (PARTITIONED BY dt STRING, run_id STRING)
  7) Add curated (dt, run_id) partitions
  7.5) Create v_latest_<dataset> views (latest run per dt via ROW_NUMBER)
  8) Final verify via views       (SELECT COUNT(*) + SELECT * LIMIT 3)

Prerequisites:
  1. Mock raw files already generated locally:
       python scripts/make_mock_raw_data.py --dt 2026-02-27
  2. Env vars set (PowerShell):
       $env:AWS_REGION       = "ap-northeast-2"
       $env:ATHENA_WORKGROUP = "hyper-intern-m1c-wg"
       $env:ATHENA_DATABASE  = "hyper_intern_m1c"
       $env:ATHENA_OUTPUT_S3 = "s3://hyper-intern-m1c-athena-results-bucket/athena-results/"
       $env:DATA_BUCKET      = "hyper-intern-m1c-data-bucket"

Usage:
    # First run:
    python scripts/run_e2e_smoke.py --dt 2026-02-27

    # Rerun same dt (each run gets a new run_id, no delete needed):
    python scripts/run_e2e_smoke.py --dt 2026-02-27

    # Skip S3 upload (raw already in S3 from a previous run):
    python scripts/run_e2e_smoke.py --dt 2026-02-27 --skip-upload

    # Skip raw table creation (tables already exist):
    python scripts/run_e2e_smoke.py --dt 2026-02-27 --skip-create-raw-tables

    # Recreate curated tables (needed once to migrate to (dt, run_id) scheme):
    python scripts/run_e2e_smoke.py --dt 2026-02-27 --recreate-curated-tables

IAM required:
    s3:PutObject, s3:GetObject, s3:ListBucket
    athena:StartQueryExecution, athena:GetQueryExecution, athena:GetQueryResults
    glue:GetTable, glue:GetDatabase, glue:CreateTable, glue:BatchCreatePartition
    glue:DeleteTable (only when --recreate-curated-tables)
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from report_system.application.common.env_guard import assert_prod_env
from report_system.infrastructure.athena.ctas import REGISTRY, AthenaCtasRunner
from report_system.infrastructure.athena.partition_manager import AthenaPartitionManager
from report_system.infrastructure.persistence.s3_key_builder import build_raw_key

# ---------------------------------------------------------------------------
# Curated table schemas (columns must match CTAS SELECT output).
#
# EXCLUDED from this dict (handled by PARTITIONED BY clause):
#   dt STRING, run_id STRING
#
# run_id is also written as a literal data column inside Parquet by CTAS
# (useful for direct-file inspection), but Athena uses the partition
# metadata value — no duplicate declaration is needed here.
#
# KEEP IN SYNC WITH: src/report_system/infrastructure/athena/ctas.py
#   _SELECT_REGISTRY — that file's SELECT bodies are the single source of
#   truth for column names and types.
# ---------------------------------------------------------------------------

_CURATED_SCHEMAS: dict[str, str] = {
    "ga4_acquisition_daily": (
        "  channel_group STRING,\n"
        "  source        STRING,\n"
        "  medium        STRING,\n"
        "  sessions      BIGINT,\n"
        "  total_users   BIGINT,\n"
        "  conversions   BIGINT,\n"
        "  total_revenue DOUBLE"
    ),
    "ga4_engagement_daily": (
        "  channel_group   STRING,\n"
        "  source          STRING,\n"
        "  medium          STRING,\n"
        "  engagement_rate DOUBLE,\n"
        "  bounce_rate     DOUBLE"
    ),
    # Columns match ctas.py _SELECT_REGISTRY["appsflyer_installs_daily"].
    # Raw event-level rows → COUNT(*) GROUP BY in CTAS.
    # is_organic removed (was stub-era; organic = media_source='Organic').
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
    # Columns match ctas.py _SELECT_REGISTRY["appsflyer_events_daily"].
    # Raw event-level rows → COUNT(*) / SUM() GROUP BY in CTAS.
    # is_organic removed (was stub-era; organic = media_source='Organic').
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
    "appsflyer_retention_daily": (
        "  media_source  STRING,\n"
        "  campaign      STRING,\n"
        "  is_organic    BOOLEAN,\n"
        "  retention_d1  DOUBLE,\n"
        "  retention_d7  DOUBLE,\n"
        "  retention_d30 DOUBLE"
    ),
}

# ---------------------------------------------------------------------------
# Athena helpers (no ResultConfiguration -- rely on workgroup output location)
# ---------------------------------------------------------------------------


def _wait(athena_client, query_id: str, timeout: int = 90) -> tuple[str, str | None]:
    """Poll GetQueryExecution until a terminal state. Returns (state, reason)."""
    deadline = time.monotonic() + timeout
    while True:
        resp = athena_client.get_query_execution(QueryExecutionId=query_id)
        status = resp["QueryExecution"]["Status"]
        state: str = status["State"]
        if state in ("SUCCEEDED", "FAILED", "CANCELLED"):
            return state, status.get("StateChangeReason")
        if time.monotonic() > deadline:
            raise RuntimeError(
                f"Athena query {query_id} timed out after {timeout}s (last state={state})"
            )
        time.sleep(2)


def _run_ddl(
    athena_client,
    sql: str,
    database: str,
    workgroup: str,
    label: str = "DDL",
    timeout: int = 90,
) -> None:
    """Execute a DDL statement and wait for success. Raises RuntimeError on failure."""
    resp = athena_client.start_query_execution(
        QueryString=sql,
        QueryExecutionContext={"Database": database},
        WorkGroup=workgroup,
    )
    qid = resp["QueryExecutionId"]
    state, reason = _wait(athena_client, qid, timeout)
    if state != "SUCCEEDED":
        raise RuntimeError(
            f"{label} failed  state={state}  reason={reason}\n"
            f"query_execution_id={qid}\n"
            f"SQL:\n{sql}"
        )


def _run_select(
    athena_client,
    sql: str,
    database: str,
    workgroup: str,
    timeout: int = 90,
) -> list[list[str]]:
    """Execute a SELECT and return all rows (row[0] = headers)."""
    resp = athena_client.start_query_execution(
        QueryString=sql,
        QueryExecutionContext={"Database": database},
        WorkGroup=workgroup,
    )
    qid = resp["QueryExecutionId"]
    state, reason = _wait(athena_client, qid, timeout)
    if state != "SUCCEEDED":
        raise RuntimeError(
            f"SELECT failed  state={state}  reason={reason}\n"
            f"query_execution_id={qid}\n"
            f"SQL: {sql}"
        )
    results = athena_client.get_query_results(QueryExecutionId=qid)
    return [
        [col.get("VarCharValue", "") for col in row["Data"]]
        for row in results["ResultSet"]["Rows"]
    ]


# ---------------------------------------------------------------------------
# Display helpers
# ---------------------------------------------------------------------------


def _section(n: int | str, title: str) -> None:
    print(f"\n{'=' * 62}")
    print(f"  Phase {n}: {title}")
    print(f"{'=' * 62}")


def _print_table(rows: list[list[str]], max_col_width: int = 22) -> None:
    """Print Athena result rows as a simple ASCII table."""
    if len(rows) <= 1:
        print("    (no data rows)")
        return
    headers = rows[0]
    data = rows[1:]
    col_w = [
        min(max_col_width, max(len(h), *(len(r[i]) for r in data if i < len(r))))
        for i, h in enumerate(headers)
    ]
    sep = "  ".join("-" * w for w in col_w)
    header_line = "  ".join(h.ljust(col_w[i]) for i, h in enumerate(headers))
    print(f"    {header_line}")
    print(f"    {sep}")
    for row in data:
        line = "  ".join(
            (row[i] if i < len(row) else "")[:col_w[i]].ljust(col_w[i])
            for i in range(len(headers))
        )
        print(f"    {line}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="E2E smoke test: mock raw -> CTAS -> curated verify.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--dt",
        default=str(date.today()),
        help="Partition date YYYY-MM-DD (default: today)",
    )
    parser.add_argument(
        "--skip-upload",
        action="store_true",
        help="Skip S3 upload -- assume raw files already in S3",
    )
    parser.add_argument(
        "--skip-create-raw-tables",
        action="store_true",
        help="Skip CREATE EXTERNAL TABLE for raw tables (already exist)",
    )
    parser.add_argument(
        "--skip-create-curated-tables",
        action="store_true",
        help="Skip CREATE EXTERNAL TABLE for curated tables (already exist)",
    )
    parser.add_argument(
        "--recreate-curated-tables",
        action="store_true",
        help=(
            "DROP + CREATE curated tables (use once to migrate from old "
            "PARTITIONED BY (dt) scheme to new (dt, run_id) scheme)"
        ),
    )
    parser.add_argument(
        "--mock-dir",
        default=str(Path(__file__).parent.parent / "tmp" / "mock_raw"),
        help="Local directory containing mock raw files (output of make_mock_raw_data.py)",
    )
    args = parser.parse_args()

    # ----------------------------------------------------------------
    # Guard: fail fast on wrong region / bucket
    # ----------------------------------------------------------------
    assert_prod_env()

    region = os.environ["AWS_REGION"]
    workgroup = os.environ["ATHENA_WORKGROUP"]
    database = os.environ.get("ATHENA_DATABASE", "hyper_intern_m1c")
    data_bucket = os.environ["DATA_BUCKET"]

    try:
        import boto3  # noqa: PLC0415
    except ImportError:
        print("ERROR: boto3 not installed.  Run: pip install boto3", file=sys.stderr)
        sys.exit(1)

    s3 = boto3.client("s3", region_name=region)
    athena = boto3.client("athena", region_name=region)

    mock_base = Path(args.mock_dir)
    datasets = sorted(REGISTRY)
    failures: list[tuple[str, str]] = []

    # Build runner early so run_id is available for the banner
    runner = AthenaCtasRunner(
        database=database,
        workgroup=workgroup,
        curated_bucket=data_bucket,
        curated_prefix="curated",
        region_name=region,
    )
    run_id = runner.run_id

    print("E2E Smoke Test")
    print(f"  dt        : {args.dt}")
    print(f"  run_id    : {run_id}")
    print(f"  region    : {region}")
    print(f"  workgroup : {workgroup}")
    print(f"  database  : {database}")
    print(f"  bucket    : {data_bucket}")

    # =================================================================
    # Phase 1: Upload mock raw JSONL.GZ -> S3
    # =================================================================
    if not args.skip_upload:
        _section(1, "Upload mock raw JSONL.GZ -> S3")
        for dataset_id in datasets:
            spec = REGISTRY[dataset_id]
            local_path = (
                mock_base
                / f"source={spec.source}"
                / f"report={dataset_id}"
                / f"dt={args.dt}"
                / f"{dataset_id}.jsonl.gz"
            )
            if not local_path.exists():
                print(
                    f"\n  ERROR: local file not found:\n    {local_path}\n"
                    f"  Run first: python scripts/make_mock_raw_data.py --dt {args.dt}",
                    file=sys.stderr,
                )
                sys.exit(1)

            s3_key = build_raw_key(spec.source, dataset_id, args.dt, f"{dataset_id}.jsonl.gz")
            with open(local_path, "rb") as fh:
                s3.put_object(Bucket=data_bucket, Key=s3_key, Body=fh.read())
            print(f"  [uploaded]  s3://{data_bucket}/{s3_key}  ({local_path.stat().st_size}B)")
    else:
        _section(1, "Skip upload (--skip-upload)")
        print("  Assuming raw files already in S3.")

    # =================================================================
    # Phase 2: Create raw external tables (IF NOT EXISTS)
    # =================================================================
    if not args.skip_create_raw_tables:
        _section(2, "Create raw external tables")
        for dataset_id in datasets:
            spec = REGISTRY[dataset_id]
            location = f"s3://{data_bucket}/raw/source={spec.source}/report={dataset_id}/"
            ddl = (
                f"CREATE EXTERNAL TABLE IF NOT EXISTS {database}.{spec.raw_table} (\n"
                f"    dimensions MAP<STRING, STRING>,\n"
                f"    metrics    MAP<STRING, STRING>\n"
                f")\n"
                f"PARTITIONED BY (dt STRING)\n"
                f"ROW FORMAT SERDE 'org.apache.hive.hcatalog.data.JsonSerDe'\n"
                f"STORED AS TEXTFILE\n"
                f"LOCATION '{location}'\n"
                f"TBLPROPERTIES ('ignore.malformed.json' = 'true')"
            )
            try:
                _run_ddl(athena, ddl, database, workgroup, label=f"CREATE {spec.raw_table}")
                print(f"  [ok]  {database}.{spec.raw_table}")
            except RuntimeError as exc:
                print(f"  [FAIL]  {spec.raw_table}: {exc}")
                failures.append((f"create_raw_{dataset_id}", str(exc)))
    else:
        _section(2, "Skip raw table creation (--skip-create-raw-tables)")

    # =================================================================
    # Phase 3: Add dt-partitions to raw tables
    # =================================================================
    _section(3, f"Add raw dt-partitions  (dt={args.dt})")
    partition_mgr = AthenaPartitionManager(
        database=database, workgroup=workgroup, region_name=region
    )
    for dataset_id in datasets:
        spec = REGISTRY[dataset_id]
        raw_part_location = (
            f"s3://{data_bucket}/raw/source={spec.source}"
            f"/report={dataset_id}/dt={args.dt}/"
        )
        try:
            partition_mgr.add_partition(
                table=spec.raw_table,
                dt=args.dt,
                location=raw_part_location,
            )
            print(f"  [ok]  {spec.raw_table}  dt={args.dt}")
        except RuntimeError as exc:
            print(f"  [FAIL]  {spec.raw_table}: {exc}")
            failures.append((f"add_raw_partition_{dataset_id}", str(exc)))

    # =================================================================
    # Phase 4: Verify raw row counts
    # =================================================================
    _section(4, "Verify raw data  (SELECT COUNT(*))")
    for dataset_id in datasets:
        spec = REGISTRY[dataset_id]
        sql = (
            f"SELECT COUNT(*) AS cnt "
            f"FROM {database}.{spec.raw_table} "
            f"WHERE dt='{args.dt}'"
        )
        try:
            rows = _run_select(athena, sql, database, workgroup)
            count = rows[1][0] if len(rows) > 1 else "?"
            status = "[ok]" if int(count) > 0 else "[WARN: 0 rows]"
            print(f"  {status}  {spec.raw_table:45s}  COUNT={count}")
        except RuntimeError as exc:
            print(f"  [FAIL]  {spec.raw_table}: {exc}")
            failures.append((f"verify_raw_{dataset_id}", str(exc)))

    # =================================================================
    # Phase 5: Run Athena CTAS (raw -> curated Parquet)
    # =================================================================
    _section(5, f"Run Athena CTAS  (raw -> curated Parquet, run_id={run_id})")
    ctas_ok: set[str] = set()
    for dataset_id in datasets:
        print(f"  [{dataset_id}]  running...", end="", flush=True)
        try:
            query_id, location = runner.run(dataset_id, args.dt)
            ctas_ok.add(dataset_id)
            print(f"  SUCCEEDED")
            print(f"    query_id : {query_id}")
            print(f"    location : {location}")
        except (ValueError, RuntimeError) as exc:
            print(f"  FAILED")
            print(f"    error    : {exc}")
            failures.append((f"ctas_{dataset_id}", str(exc)))

    # =================================================================
    # Phase 6: Create curated external tables (IF NOT EXISTS)
    #   PARTITIONED BY (dt STRING, run_id STRING)
    # =================================================================
    if not args.skip_create_curated_tables:
        title = "Recreate curated tables (dt, run_id)" if args.recreate_curated_tables \
            else "Create curated external tables (dt, run_id)"
        _section(6, title)
        for dataset_id in datasets:
            schema = _CURATED_SCHEMAS[dataset_id]
            location = f"s3://{data_bucket}/curated/{dataset_id}/"

            if args.recreate_curated_tables:
                drop_ddl = f"DROP TABLE IF EXISTS {database}.{dataset_id}"
                try:
                    _run_ddl(
                        athena, drop_ddl, database, workgroup,
                        label=f"DROP {dataset_id}",
                    )
                    print(f"  [dropped]  {database}.{dataset_id}")
                except RuntimeError as exc:
                    print(f"  [WARN] drop failed for {dataset_id}: {exc}")

            ddl = (
                f"CREATE EXTERNAL TABLE IF NOT EXISTS {database}.{dataset_id} (\n"
                f"{schema}\n"
                f")\n"
                f"PARTITIONED BY (dt STRING, run_id STRING)\n"
                f"STORED AS PARQUET\n"
                f"LOCATION '{location}'\n"
                f"TBLPROPERTIES ('parquet.compress' = 'SNAPPY')"
            )
            try:
                _run_ddl(athena, ddl, database, workgroup, label=f"CREATE {dataset_id}")
                print(f"  [ok]  {database}.{dataset_id}")
            except RuntimeError as exc:
                print(f"  [FAIL]  {dataset_id}: {exc}")
                failures.append((f"create_curated_{dataset_id}", str(exc)))
    else:
        _section(6, "Skip curated table creation (--skip-create-curated-tables)")

    # =================================================================
    # Phase 7: Add curated (dt, run_id) partitions
    # =================================================================
    _section(7, f"Add curated (dt, run_id) partitions  (dt={args.dt}, run_id={run_id})")
    for dataset_id in datasets:
        curated_part_location = (
            f"s3://{data_bucket}/curated/{dataset_id}"
            f"/dt={args.dt}/run={run_id}/"
        )
        alter_sql = (
            f"ALTER TABLE {database}.{dataset_id}\n"
            f"ADD IF NOT EXISTS PARTITION (dt='{args.dt}', run_id='{run_id}')\n"
            f"LOCATION '{curated_part_location}'"
        )
        try:
            _run_ddl(
                athena, alter_sql, database, workgroup,
                label=f"ADD PARTITION {dataset_id}",
            )
            print(f"  [ok]  {database}.{dataset_id}  dt={args.dt}  run_id={run_id}")
        except RuntimeError as exc:
            print(f"  [FAIL]  {dataset_id}: {exc}")
            failures.append((f"add_curated_partition_{dataset_id}", str(exc)))

    # =================================================================
    # Phase 7.5: Create v_latest_<dataset> views
    #   Returns the most-recent run's rows per dt (ordered by run_id DESC).
    # =================================================================
    _section("7.5", "Create v_latest_<dataset> views")
    for dataset_id in datasets:
        view_name = f"v_latest_{dataset_id}"
        view_sql = (
            f"CREATE OR REPLACE VIEW {database}.{view_name} AS\n"
            f"SELECT * FROM (\n"
            f"  SELECT *,\n"
            f"         DENSE_RANK() OVER (\n"
            f"           PARTITION BY dt ORDER BY run_id DESC\n"
            f"         ) AS _run_rank\n"
            f"  FROM {database}.{dataset_id}\n"
            f") t\n"
            f"WHERE t._run_rank = 1"
        )
        try:
            _run_ddl(
                athena, view_sql, database, workgroup,
                label=f"CREATE VIEW {view_name}",
            )
            print(f"  [ok]  {database}.{view_name}")
        except RuntimeError as exc:
            print(f"  [FAIL]  {view_name}: {exc}")
            failures.append((f"create_view_{dataset_id}", str(exc)))

    # =================================================================
    # Phase 8: Final verification via views -- COUNT(*) + LIMIT 3 sample
    # =================================================================
    _section(8, "Final verification via views  (COUNT(*) + LIMIT 3 per dataset)")
    for dataset_id in datasets:
        view_name = f"v_latest_{dataset_id}"
        print(f"\n  [{dataset_id}]")

        # COUNT(*)
        sql_count = (
            f"SELECT COUNT(*) AS cnt "
            f"FROM {database}.{view_name} "
            f"WHERE dt='{args.dt}'"
        )
        try:
            count_rows = _run_select(athena, sql_count, database, workgroup)
            count = count_rows[1][0] if len(count_rows) > 1 else "?"
            ok = int(count) > 0 if count.isdigit() else False
            print(f"    COUNT(*) = {count}  {'OK' if ok else 'WARN: 0 rows'}")
        except RuntimeError as exc:
            print(f"    COUNT FAILED: {exc}")
            failures.append((f"verify_count_{dataset_id}", str(exc)))
            continue

        # LIMIT 3 sample
        sql_sample = (
            f"SELECT * "
            f"FROM {database}.{view_name} "
            f"WHERE dt='{args.dt}' "
            f"LIMIT 3"
        )
        try:
            sample_rows = _run_select(athena, sql_sample, database, workgroup)
            _print_table(sample_rows)
        except RuntimeError as exc:
            print(f"    SAMPLE FAILED: {exc}")
            failures.append((f"verify_sample_{dataset_id}", str(exc)))

    # =================================================================
    # Summary
    # =================================================================
    print(f"\n{'=' * 62}")
    if not failures:
        print("  E2E SMOKE TEST PASSED.")
        print(f"  All 5 datasets verified for dt={args.dt}, run_id={run_id}.")
    else:
        print(f"  E2E SMOKE TEST FAILED -- {len(failures)} error(s):")
        for step, msg in failures:
            short = msg.split("\n")[0][:100]
            print(f"    [{step}]  {short}")
        print()
        print("  See troubleshooting guide in script docstring.")
        sys.exit(1)
    print(f"{'=' * 62}\n")


if __name__ == "__main__":
    main()
