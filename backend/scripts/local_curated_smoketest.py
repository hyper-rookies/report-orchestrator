"""
CTAS SQL preview — replaces the old pyarrow-based local curated smoketest.

Prints the exact Athena CTAS SQL that would be submitted for each dataset,
so you can review and copy-paste into the Athena console before the real run.

No AWS calls, no pyarrow, no credentials needed.

Usage:
    # Print CTAS SQL for all datasets:
    python scripts/local_curated_smoketest.py --dt 2026-02-27

    # Single dataset:
    python scripts/local_curated_smoketest.py \\
        --dataset-id ga4_acquisition_daily \\
        --dt 2026-02-27

    # Override bucket / prefix / database:
    python scripts/local_curated_smoketest.py \\
        --dt 2026-02-27 \\
        --bucket my-bucket \\
        --prefix curated \\
        --database my_db
"""
from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from report_system.infrastructure.athena.ctas import REGISTRY, build_ctas_sql


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Print Athena CTAS SQL for curated dataset(s) — no AWS calls.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--dataset-id",
        choices=sorted(REGISTRY),
        default=None,
        help="Single dataset to preview (default: all datasets)",
    )
    parser.add_argument(
        "--dt",
        default=str(date.today()),
        help="Partition date YYYY-MM-DD (default: today)",
    )
    parser.add_argument(
        "--bucket",
        default="hyper-intern-m1c-data",
        help="S3 bucket name (default: hyper-intern-m1c-data)",
    )
    parser.add_argument(
        "--prefix",
        default="curated",
        help="S3 key prefix (default: curated)",
    )
    parser.add_argument(
        "--database",
        default="hyper_intern_m1c",
        help="Athena database name (default: hyper_intern_m1c)",
    )
    args = parser.parse_args()

    dataset_ids = [args.dataset_id] if args.dataset_id else sorted(REGISTRY)

    print(f"CTAS SQL preview  dt={args.dt}  database={args.database}")
    print(f"curated target  : s3://{args.bucket}/{args.prefix}/{{dataset_id}}/dt={args.dt}/")
    print("=" * 70)

    for dataset_id in dataset_ids:
        sql, ctas_table = build_ctas_sql(
            dataset_id=dataset_id,
            dt=args.dt,
            database=args.database,
            curated_bucket=args.bucket,
            curated_prefix=args.prefix,
        )
        print(f"\n-- [{dataset_id}]  temp table: {ctas_table}")
        print(sql)

    print()


if __name__ == "__main__":
    main()
