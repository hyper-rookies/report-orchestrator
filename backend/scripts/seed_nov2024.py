"""Seed November 2024 mock data using the batch-lambda architecture.

Pipeline (all 30 days, 5 datasets):
  1) Generate flat JSONL.GZ locally using batch-lambda generators
  2) Upload files to S3 raw paths
  3) Create external tables (dataset tables, not raw_* tables)
  4) Register dt partitions on dataset tables
  5) Create v_latest_<dataset> views without run_id
  6) Verify counts from views

S3 path rules:
  - default: raw/<dataset>/dt=<date>/data.jsonl.gz
  - cohort:  raw/source=appsflyer/report=appsflyer_cohort_daily/dt=<date>/data.jsonl.gz

Usage:
    python backend/scripts/seed_nov2024.py --local-only
    python backend/scripts/seed_nov2024.py
"""

from __future__ import annotations

import argparse
import gzip
import json
import os
import sys
import time
from datetime import date, timedelta
from pathlib import Path
from typing import Callable

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
sys.path.insert(0, str(Path(__file__).parent.parent / "services" / "batch-lambda"))

from report_system.application.common.env_guard import assert_prod_env

from mock_generators.appsflyer import (  # noqa: E402
    generate_appsflyer_events,
    generate_appsflyer_installs,
)
from mock_generators.cohort import generate_appsflyer_cohort  # noqa: E402
from mock_generators.ga4 import generate_ga4_acquisition, generate_ga4_engagement  # noqa: E402


START_DATE = date(2024, 11, 1)
END_DATE = date(2024, 11, 30)
NOV_DATES = [START_DATE + timedelta(days=i) for i in range((END_DATE - START_DATE).days + 1)]

DATABASE_NAME = "hyper_intern_m1c"

S3_PREFIX_OVERRIDES: dict[str, str] = {
    "appsflyer_cohort_daily": "raw/source=appsflyer/report=appsflyer_cohort_daily",
}

GENERATORS: dict[str, Callable[[str], list[dict]]] = {
    "ga4_acquisition_daily": generate_ga4_acquisition,
    "ga4_engagement_daily": generate_ga4_engagement,
    "appsflyer_installs_daily": generate_appsflyer_installs,
    "appsflyer_events_daily": generate_appsflyer_events,
    "appsflyer_cohort_daily": generate_appsflyer_cohort,
}

TABLE_SCHEMAS: dict[str, str] = {
    "ga4_acquisition_daily": (
        "  channel_group STRING,\n"
        "  source STRING,\n"
        "  medium STRING,\n"
        "  sessions BIGINT,\n"
        "  total_users BIGINT,\n"
        "  conversions BIGINT,\n"
        "  total_revenue DOUBLE"
    ),
    "ga4_engagement_daily": (
        "  channel_group STRING,\n"
        "  source STRING,\n"
        "  medium STRING,\n"
        "  engagement_rate DOUBLE,\n"
        "  bounce_rate DOUBLE"
    ),
    "appsflyer_installs_daily": (
        "  media_source STRING,\n"
        "  campaign STRING,\n"
        "  store_reinstall STRING,\n"
        "  installs BIGINT"
    ),
    "appsflyer_events_daily": (
        "  media_source STRING,\n"
        "  campaign STRING,\n"
        "  event_name STRING,\n"
        "  store_reinstall STRING,\n"
        "  event_count BIGINT,\n"
        "  event_revenue DOUBLE"
    ),
    "appsflyer_cohort_daily": (
        "  media_source STRING,\n"
        "  campaign STRING,\n"
        "  cohort_date STRING,\n"
        "  cohort_day INT,\n"
        "  retained_users BIGINT,\n"
        "  cohort_size BIGINT"
    ),
}


def _s3_prefix(dataset_name: str) -> str:
    return S3_PREFIX_OVERRIDES.get(dataset_name, f"raw/{dataset_name}")


def _to_jsonl_gz(rows: list[dict]) -> bytes:
    payload = "\n".join(json.dumps(row, ensure_ascii=False) for row in rows).encode("utf-8")
    return gzip.compress(payload)


def _wait_query(athena_client, query_id: str, timeout_sec: int = 120) -> tuple[str, str | None]:
    deadline = time.monotonic() + timeout_sec
    while True:
        response = athena_client.get_query_execution(QueryExecutionId=query_id)
        status = response["QueryExecution"]["Status"]
        state = status["State"]
        if state in ("SUCCEEDED", "FAILED", "CANCELLED"):
            return state, status.get("StateChangeReason")
        if time.monotonic() > deadline:
            raise RuntimeError(f"Query timeout: query_id={query_id}, state={state}")
        time.sleep(2)


def _run_ddl(athena_client, sql: str, database: str, workgroup: str, label: str) -> None:
    response = athena_client.start_query_execution(
        QueryString=sql,
        QueryExecutionContext={"Database": database},
        WorkGroup=workgroup,
    )
    query_id = response["QueryExecutionId"]
    state, reason = _wait_query(athena_client, query_id)
    if state != "SUCCEEDED":
        raise RuntimeError(f"{label} failed: state={state}, reason={reason}, query_id={query_id}")


def _run_select(athena_client, sql: str, database: str, workgroup: str) -> list[list[str]]:
    response = athena_client.start_query_execution(
        QueryString=sql,
        QueryExecutionContext={"Database": database},
        WorkGroup=workgroup,
    )
    query_id = response["QueryExecutionId"]
    state, reason = _wait_query(athena_client, query_id)
    if state != "SUCCEEDED":
        raise RuntimeError(f"SELECT failed: state={state}, reason={reason}, query_id={query_id}")
    result = athena_client.get_query_results(QueryExecutionId=query_id)
    return [
        [col.get("VarCharValue", "") for col in row["Data"]]
        for row in result["ResultSet"]["Rows"]
    ]


def _section(title: str) -> None:
    print(f"\n{'=' * 72}")
    print(title)
    print(f"{'=' * 72}")


def generate_local(out_dir: Path) -> dict[str, dict[str, Path]]:
    """Generate local gzipped JSONL files and return {dt: {dataset: path}}."""
    file_map: dict[str, dict[str, Path]] = {}
    out_dir.mkdir(parents=True, exist_ok=True)

    _section("1) Generate local JSONL.GZ files")
    for current_date in NOV_DATES:
        dt_str = current_date.isoformat()
        file_map[dt_str] = {}
        total_rows = 0

        for dataset_name, generator in GENERATORS.items():
            rows = generator(dt_str)
            total_rows += len(rows)

            output_path = out_dir / _s3_prefix(dataset_name) / f"dt={dt_str}" / "data.jsonl.gz"
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(_to_jsonl_gz(rows))
            file_map[dt_str][dataset_name] = output_path

        print(f"  [{dt_str}] rows={total_rows}")

    print(f"\nLocal output directory: {out_dir.resolve()}")
    return file_map


def run_pipeline(
    file_map: dict[str, dict[str, Path]],
    data_bucket: str,
    region: str,
    database: str,
    workgroup: str,
    skip_upload: bool,
    skip_create_tables: bool,
    skip_create_views: bool,
) -> None:
    try:
        import boto3  # noqa: PLC0415
    except ImportError as exc:
        raise RuntimeError("boto3 is required. Install with `pip install boto3`.") from exc

    s3 = boto3.client("s3", region_name=region)
    athena = boto3.client("athena", region_name=region)

    dataset_names = sorted(GENERATORS.keys())
    all_dates = sorted(file_map.keys())
    failures: list[tuple[str, str]] = []

    print(f"Region      : {region}")
    print(f"Database    : {database}")
    print(f"Workgroup   : {workgroup}")
    print(f"Bucket      : {data_bucket}")
    print(f"Date range  : {all_dates[0]} ~ {all_dates[-1]} ({len(all_dates)} days)")
    print(f"Datasets    : {dataset_names}")

    if not skip_upload:
        _section("2) Upload local files to S3 raw paths")
        total = len(all_dates) * len(dataset_names)
        uploaded = 0
        for dt_str, dataset_map in sorted(file_map.items()):
            for dataset_name, local_path in sorted(dataset_map.items()):
                key = f"{_s3_prefix(dataset_name)}/dt={dt_str}/data.jsonl.gz"
                s3.put_object(Bucket=data_bucket, Key=key, Body=local_path.read_bytes())
                uploaded += 1
                if uploaded % 20 == 0 or uploaded == total:
                    print(f"  uploaded {uploaded}/{total}")
    else:
        _section("2) Skip upload (--skip-upload)")

    if not skip_create_tables:
        _section("3) Create external tables (dataset tables)")
        for dataset_name in dataset_names:
            schema = TABLE_SCHEMAS[dataset_name]
            location = f"s3://{data_bucket}/{_s3_prefix(dataset_name)}/"
            ddl = (
                f"CREATE EXTERNAL TABLE IF NOT EXISTS {database}.{dataset_name} (\n"
                f"{schema}\n"
                f")\n"
                "PARTITIONED BY (dt STRING)\n"
                "ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe'\n"
                "STORED AS TEXTFILE\n"
                f"LOCATION '{location}'\n"
                "TBLPROPERTIES ('ignore.malformed.json'='true')"
            )
            try:
                _run_ddl(athena, ddl, database, workgroup, label=f"CREATE {dataset_name}")
                print(f"  [ok] {dataset_name}")
            except RuntimeError as exc:
                failures.append((f"create_table_{dataset_name}", str(exc)))
                print(f"  [FAIL] {dataset_name}: {exc}")
    else:
        _section("3) Skip table creation (--skip-create-tables)")

    _section("4) Register dt partitions")
    for dt_str in all_dates:
        for dataset_name in dataset_names:
            location = f"s3://{data_bucket}/{_s3_prefix(dataset_name)}/dt={dt_str}/"
            ddl = (
                f"ALTER TABLE {database}.{dataset_name}\n"
                f"ADD IF NOT EXISTS PARTITION (dt='{dt_str}')\n"
                f"LOCATION '{location}'"
            )
            try:
                _run_ddl(
                    athena,
                    ddl,
                    database,
                    workgroup,
                    label=f"ADD PARTITION {dataset_name} dt={dt_str}",
                )
            except RuntimeError as exc:
                failures.append((f"partition_{dataset_name}_{dt_str}", str(exc)))
                print(f"  [FAIL] {dataset_name} dt={dt_str}: {exc}")
    print(f"  [done] {len(all_dates) * len(dataset_names)} partition operations")

    if not skip_create_views:
        _section("5) Create v_latest_* views (run_id-free)")
        for dataset_name in dataset_names:
            view_name = f"v_latest_{dataset_name}"
            ddl = (
                f"CREATE OR REPLACE VIEW {database}.{view_name} AS\n"
                f"SELECT *, CAST(1 AS BIGINT) AS _run_rank\n"
                f"FROM {database}.{dataset_name}"
            )
            try:
                _run_ddl(athena, ddl, database, workgroup, label=f"CREATE VIEW {view_name}")
                print(f"  [ok] {view_name}")
            except RuntimeError as exc:
                failures.append((f"create_view_{dataset_name}", str(exc)))
                print(f"  [FAIL] {view_name}: {exc}")
    else:
        _section("5) Skip view creation (--skip-create-views)")

    _section("6) Verify counts via views")
    for dataset_name in dataset_names:
        view_name = f"v_latest_{dataset_name}"
        sql = (
            f"SELECT COUNT(*) AS cnt "
            f"FROM {database}.{view_name} "
            "WHERE dt BETWEEN '2024-11-01' AND '2024-11-30'"
        )
        try:
            rows = _run_select(athena, sql, database, workgroup)
            count = rows[1][0] if len(rows) > 1 else "0"
            print(f"  {view_name:40s} count={count}")
        except RuntimeError as exc:
            failures.append((f"verify_{dataset_name}", str(exc)))
            print(f"  [FAIL] {view_name}: {exc}")

    print(f"\n{'=' * 72}")
    if failures:
        print(f"Pipeline finished with {len(failures)} error(s):")
        for step, message in failures:
            print(f"  - {step}: {message.splitlines()[0][:140]}")
        sys.exit(1)
    print("Pipeline succeeded.")
    print(f"{'=' * 72}")


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(
        description="Seed November 2024 data using batch-lambda architecture.",
    )
    parser.add_argument(
        "--local-only",
        action="store_true",
        help="Only generate local files, skip AWS upload/DDL.",
    )
    parser.add_argument(
        "--skip-upload",
        action="store_true",
        help="Skip S3 upload.",
    )
    parser.add_argument(
        "--skip-create-tables",
        action="store_true",
        help="Skip CREATE EXTERNAL TABLE.",
    )
    parser.add_argument(
        "--skip-create-views",
        action="store_true",
        help="Skip CREATE OR REPLACE VIEW.",
    )
    parser.add_argument(
        "--out-dir",
        default=str(Path(__file__).parent.parent / "tmp" / "mock_raw_nov2024"),
        help="Local output directory for generated files.",
    )
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    file_map = generate_local(out_dir)

    if args.local_only:
        print("--local-only set; AWS pipeline skipped.")
        return

    assert_prod_env()

    region = os.environ["AWS_REGION"]
    workgroup = os.environ["ATHENA_WORKGROUP"]
    database = os.environ.get("ATHENA_DATABASE", DATABASE_NAME)
    data_bucket = os.environ["DATA_BUCKET"]

    run_pipeline(
        file_map=file_map,
        data_bucket=data_bucket,
        region=region,
        database=database,
        workgroup=workgroup,
        skip_upload=args.skip_upload,
        skip_create_tables=args.skip_create_tables,
        skip_create_views=args.skip_create_views,
    )


if __name__ == "__main__":
    main()
