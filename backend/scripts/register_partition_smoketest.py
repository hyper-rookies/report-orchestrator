"""
Smoke-test: register a single Athena dt-partition manually via
    ALTER TABLE {database}.{table}
    ADD IF NOT EXISTS PARTITION (dt='{dt}')
    LOCATION '{location}';

Requires boto3 and valid AWS credentials (env vars or ~/.aws/credentials):
    pip install boto3

IAM permissions needed:
  - athena:StartQueryExecution, athena:GetQueryExecution
  - glue:GetTable, glue:BatchCreatePartition on the target table
  - s3:GetBucketLocation on the Athena workgroup output bucket

Usage:
    python scripts/register_partition_smoketest.py \\
        --dt 2026-02-25 \\
        --table ga4_acquisition_daily \\
        --location s3://hyper-intern-m1c-data/curated/ga4_acquisition_daily/dt=2026-02-25/

    # Override database / workgroup:
    python scripts/register_partition_smoketest.py \\
        --dt 2026-02-25 \\
        --table appsflyer_installs_daily \\
        --location s3://hyper-intern-m1c-data/curated/appsflyer_installs_daily/dt=2026-02-25/ \\
        --database hyper_intern_m1c \\
        --workgroup hyper-intern-m1c-wg
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from report_system.infrastructure.athena.partition_manager import AthenaPartitionManager


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Register an Athena dt-partition via ALTER TABLE ADD PARTITION.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--dt",
        required=True,
        help="Partition date in YYYY-MM-DD (e.g. 2026-02-25)",
    )
    parser.add_argument(
        "--table",
        required=True,
        help="Athena table name (e.g. ga4_acquisition_daily)",
    )
    parser.add_argument(
        "--location",
        required=True,
        help="S3 partition directory "
             "(e.g. s3://bucket/curated/ga4_acquisition_daily/dt=2026-02-25/)",
    )
    parser.add_argument(
        "--database",
        default="hyper_intern_m1c",
        help="Athena database (default: hyper_intern_m1c)",
    )
    parser.add_argument(
        "--workgroup",
        default="hyper-intern-m1c-wg",
        help="Athena workgroup (default: hyper-intern-m1c-wg)",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=60,
        help="Polling timeout in seconds (default: 60)",
    )
    args = parser.parse_args()

    # Normalise location — must end with /
    location = args.location if args.location.endswith("/") else args.location + "/"

    print("Registering Athena partition:")
    print(f"  database  : {args.database}")
    print(f"  workgroup : {args.workgroup}")
    print(f"  table     : {args.table}")
    print(f"  dt        : {args.dt}")
    print(f"  location  : {location}")
    print()

    try:
        mgr = AthenaPartitionManager(
            database=args.database,
            workgroup=args.workgroup,
        )

        qid = mgr.add_dt_partition(
            database=args.database,
            table=args.table,
            dt=args.dt,
            location=location,
            workgroup=args.workgroup,
        )
        print(f"  query_execution_id : {qid}")
        print(f"  polling ...        (timeout={args.timeout}s)")

        state, reason = mgr.wait(qid, timeout_sec=args.timeout)

        print(f"  final state        : {state}")
        if state == "SUCCEEDED":
            print("  OK — partition registered.")
        else:
            if reason:
                print(f"  failure reason : {reason}")
            sys.exit(1)

    except RuntimeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
