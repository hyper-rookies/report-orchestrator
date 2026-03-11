"""CTAS runner smoke test — raw S3 → curated Parquet via Athena CTAS.

Runs a full CTAS pipeline for one dataset + one dt and verifies that Parquet
files appear at the expected curated S3 path.

Required env vars:
    AWS_REGION          ap-northeast-2
    ATHENA_WORKGROUP    hyper-intern-m1c-wg
    ATHENA_DATABASE     hyper_intern_m1c
    ATHENA_OUTPUT_LOCATION
    DATA_BUCKET         hyper-intern-m1c-data-bucket

PowerShell — set env vars once, then run:
    $env:AWS_REGION       = "ap-northeast-2"
    $env:ATHENA_WORKGROUP = "hyper-intern-m1c-wg"
    $env:ATHENA_DATABASE  = "hyper_intern_m1c"
    $env:ATHENA_OUTPUT_LOCATION = "s3://hyper-intern-m1c-athena-results-bucket/athena-results/"
    $env:DATA_BUCKET      = "hyper-intern-m1c-data-bucket"

    # Dry-run (print CTAS SQL, no AWS calls):
    python scripts/smoke_ctas_runner.py --dry-run --dt 2026-02-27

    # Real run (needs raw data at s3://DATA_BUCKET/raw/...):
    python scripts/smoke_ctas_runner.py --dt 2026-02-27

    # Rerun (overwrite existing curated files):
    python scripts/smoke_ctas_runner.py --dt 2026-02-27 --overwrite

Expected curated path:
    s3://hyper-intern-m1c-data-bucket/curated/<dataset_id>/dt=<dt>/

Raw data must already exist at:
    s3://hyper-intern-m1c-data-bucket/raw/source=<source>/report=<dataset_id>/dt=<dt>/data.jsonl.gz
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from report_system.application.common.env_guard import assert_prod_env
from report_system.infrastructure.athena.ctas import REGISTRY, AthenaCtasRunner, build_ctas_sql

_CURATED_PREFIX = "curated"
_RAW_PREFIX = "raw"


def _check_raw_data(s3_client, bucket: str, dataset_id: str, dt: str) -> bool:
    """Return True if raw JSONL.GZ exists for this dataset/dt; warn if not."""
    spec = REGISTRY[dataset_id]
    key = f"{_RAW_PREFIX}/source={spec.source}/report={dataset_id}/dt={dt}/data.jsonl.gz"
    try:
        s3_client.head_object(Bucket=bucket, Key=key)
        return True
    except s3_client.exceptions.ClientError as exc:
        code = exc.response["Error"]["Code"]
        if code in ("404", "NoSuchKey"):
            print(
                f"  WARNING: raw file not found at s3://{bucket}/{key}\n"
                "  CTAS will likely return 0 rows or fail on a missing partition.",
                file=sys.stderr,
            )
            return False
        raise


def _list_curated_files(s3_client, bucket: str, dataset_id: str, dt: str) -> list[str]:
    """Return keys of files written under the curated partition prefix."""
    prefix = f"{_CURATED_PREFIX}/{dataset_id}/dt={dt}/"
    paginator = s3_client.get_paginator("list_objects_v2")
    keys: list[str] = []
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            keys.append(obj["Key"])
    return keys


def main() -> None:
    parser = argparse.ArgumentParser(
        description="CTAS runner smoke test — raw S3 → curated Parquet.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--dataset-id",
        choices=sorted(REGISTRY),
        default="ga4_acquisition_daily",
        help="Dataset to process (default: ga4_acquisition_daily)",
    )
    parser.add_argument(
        "--dt",
        default=str(date.today()),
        help="Partition date YYYY-MM-DD (default: today)",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Delete existing curated S3 objects before CTAS (needed for reruns)",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=180,
        help="Athena query timeout in seconds (default: 180)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print CTAS SQL without calling AWS (env guard still runs)",
    )
    args = parser.parse_args()

    # ----------------------------------------------------------------
    # Guard: fail fast if wrong region / bucket
    # ----------------------------------------------------------------
    assert_prod_env()

    region = os.environ["AWS_REGION"]
    workgroup = os.environ["ATHENA_WORKGROUP"]
    database = os.environ.get("ATHENA_DATABASE", "hyper_intern_m1c")
    data_bucket = os.environ["DATA_BUCKET"]

    # ----------------------------------------------------------------
    # Always show the CTAS SQL for review
    # ----------------------------------------------------------------
    sql, ctas_table = build_ctas_sql(
        dataset_id=args.dataset_id,
        dt=args.dt,
        database=database,
        curated_bucket=data_bucket,
        curated_prefix=_CURATED_PREFIX,
    )

    print("=== CTAS runner smoke test ===")
    print(f"  dataset   : {args.dataset_id}")
    print(f"  dt        : {args.dt}")
    print(f"  region    : {region}")
    print(f"  workgroup : {workgroup}")
    print(f"  database  : {database}")
    print(f"  bucket    : {data_bucket}")
    print(f"  overwrite : {args.overwrite}")
    print()
    print("--- CTAS SQL (for review) ---")
    print(sql)
    print()

    if args.dry_run:
        print("DRY-RUN mode — no AWS calls made.")
        return

    # ----------------------------------------------------------------
    # Real run
    # ----------------------------------------------------------------
    try:
        import boto3  # noqa: PLC0415
    except ImportError:
        print("ERROR: boto3 not installed.  Run: pip install boto3", file=sys.stderr)
        sys.exit(1)

    s3 = boto3.client("s3", region_name=region)

    # Pre-flight: warn if raw data is missing
    _check_raw_data(s3, data_bucket, args.dataset_id, args.dt)

    runner = AthenaCtasRunner(
        database=database,
        workgroup=workgroup,
        curated_bucket=data_bucket,
        curated_prefix=_CURATED_PREFIX,
        overwrite=args.overwrite,
        region_name=region,
    )

    print("Submitting CTAS query...")
    try:
        query_id, curated_location = runner.run(args.dataset_id, args.dt)
    except (ValueError, RuntimeError) as exc:
        print(f"\nFAILED: {exc}", file=sys.stderr)
        sys.exit(1)

    print(f"  query_id        : {query_id}")
    print(f"  curated_location: {curated_location}")
    print()

    # ----------------------------------------------------------------
    # Verify: list curated output files
    # ----------------------------------------------------------------
    print("--- Curated S3 artifacts ---")
    keys = _list_curated_files(s3, data_bucket, args.dataset_id, args.dt)
    if keys:
        parquet_keys = [k for k in keys if k.endswith(".parquet") or ".snappy.parquet" in k]
        print(f"  Total files   : {len(keys)}")
        print(f"  Parquet files : {len(parquet_keys)}")
        for k in keys:
            print(f"    s3://{data_bucket}/{k}")
    else:
        print(
            "  WARNING: no files found at curated path.\n"
            "  This is expected if the raw table had 0 rows for this dt.",
            file=sys.stderr,
        )

    print()
    print("CTAS smoke test PASSED.")


if __name__ == "__main__":
    main()
