"""Athena connectivity smoke test — runs SELECT 1 in the configured workgroup.

Verifies that boto3 can reach Athena in the correct Seoul region and that the
workgroup + output bucket are reachable.  No tables or data are required.

Required env vars (set in PowerShell before running):
    $env:AWS_REGION          = "ap-northeast-2"
    $env:ATHENA_WORKGROUP    = "hyper-intern-m1c-wg"
    $env:ATHENA_DATABASE     = "hyper_intern_m1c"
    $env:ATHENA_OUTPUT_S3    = "s3://hyper-intern-m1c-athena-results-bucket/athena-results/"
    $env:DATA_BUCKET         = "hyper-intern-m1c-data-bucket"

Usage (PowerShell):
    python scripts/smoke_athena_select1.py

Success output:
    State: SUCCEEDED
    SELECT 1 SUCCEEDED.
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from report_system.application.common.env_guard import assert_prod_env


def main() -> None:
    assert_prod_env()

    region = os.environ["AWS_REGION"]
    workgroup = os.environ["ATHENA_WORKGROUP"]
    database = os.environ.get("ATHENA_DATABASE", "hyper_intern_m1c")
    output_s3 = os.environ["ATHENA_OUTPUT_S3"]

    try:
        import boto3  # noqa: PLC0415
    except ImportError:
        print("ERROR: boto3 not installed.  Run: pip install boto3", file=sys.stderr)
        sys.exit(1)

    athena = boto3.client("athena", region_name=region)

    print("=== Athena SELECT 1 smoke test ===")
    print(f"  region    : {region}")
    print(f"  workgroup : {workgroup}")
    print(f"  database  : {database}")
    print(f"  output    : {output_s3}")
    print()

    resp = athena.start_query_execution(
        QueryString="SELECT 1",
        QueryExecutionContext={"Database": database},
        WorkGroup=workgroup,
        ResultConfiguration={"OutputLocation": output_s3},
    )
    query_id = resp["QueryExecutionId"]
    print(f"Query submitted: {query_id}")

    timeout_sec = 60
    poll_sec = 3
    elapsed = 0

    while elapsed < timeout_sec:
        resp = athena.get_query_execution(QueryExecutionId=query_id)
        status = resp["QueryExecution"]["Status"]
        state = status["State"]
        print(f"  [{elapsed:>3}s] State: {state}")

        if state in ("SUCCEEDED", "FAILED", "CANCELLED"):
            reason = status.get("StateChangeReason", "")
            if state != "SUCCEEDED":
                print(f"\nFAILED — reason: {reason}", file=sys.stderr)
                sys.exit(1)
            print(f"\nSELECT 1 SUCCEEDED.  query_id={query_id}")
            return

        time.sleep(poll_sec)
        elapsed += poll_sec

    print(
        f"\nERROR: query {query_id} did not complete within {timeout_sec}s",
        file=sys.stderr,
    )
    sys.exit(1)


if __name__ == "__main__":
    main()
