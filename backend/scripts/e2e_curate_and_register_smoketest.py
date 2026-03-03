"""
End-to-end smoke test: raw S3 data → Athena CTAS → curated Parquet → Athena partition.

Two modes, controlled by --dry-run:

  --dry-run  (safe, no credentials needed)
      Prints the CTAS SQL that *would* be submitted to Athena.
      No AWS calls of any kind.

  (no --dry-run)  ← real-credentials run
      1. Runs Athena CTAS query (raw → curated Parquet on S3)
      2. Registers the dt-partition on the curated table
      Requires:
        - AWS credentials (env vars, ~/.aws/credentials, or IAM role)
        - Raw JSONL.GZ already written at the expected S3 path
        - Raw external tables already created in Glue Catalog
        - .env.local with ATHENA_DATABASE / ATHENA_WORKGROUP
          (or pass --database / --workgroup explicitly)

IAM permissions needed (no --dry-run):
  - s3:PutObject, s3:GetObject, s3:ListBucket  — curated bucket
  - s3:DeleteObject                             — only when --overwrite
  - athena:StartQueryExecution, athena:GetQueryExecution
  - glue:GetTable, glue:BatchCreatePartition

Usage:
    # Safe dry-run — print CTAS SQL only:
    python scripts/e2e_curate_and_register_smoketest.py --dry-run

    # Real run after receiving AWS access:
    python scripts/e2e_curate_and_register_smoketest.py \\
        --bucket hyper-intern-m1c-data \\
        --dt 2026-02-27

    # Rerun for the same dt (overwrite existing curated files):
    python scripts/e2e_curate_and_register_smoketest.py \\
        --bucket hyper-intern-m1c-data \\
        --dt 2026-02-27 \\
        --overwrite
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
        description=(
            "E2E smoke test: raw S3 → Athena CTAS → curated Parquet → partition.\n"
            "Add --dry-run to print the CTAS SQL without calling AWS."
        ),
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
        "--bucket",
        default="hyper-intern-m1c-data",
        help="S3 bucket name (default: hyper-intern-m1c-data)",
    )
    parser.add_argument(
        "--prefix",
        default="curated",
        help="S3 key prefix for curated output (default: curated)",
    )
    parser.add_argument(
        "--database",
        default=None,
        help="Athena database — overrides settings / ATHENA_DATABASE",
    )
    parser.add_argument(
        "--workgroup",
        default=None,
        help="Athena workgroup — overrides settings / ATHENA_WORKGROUP",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Delete existing curated S3 objects before running CTAS (needed for reruns)",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=120,
        help="Athena query timeout in seconds (default: 120)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the CTAS SQL without calling S3 or Athena",
    )
    args = parser.parse_args()

    # ------------------------------------------------------------------
    # Dry-run: just print the SQL and exit
    # ------------------------------------------------------------------
    if args.dry_run:
        sql, ctas_table = build_ctas_sql(
            dataset_id=args.dataset_id,
            dt=args.dt,
            database=args.database or "<ATHENA_DATABASE>",
            curated_bucket=args.bucket,
            curated_prefix=args.prefix,
        )
        print("=== DRY-RUN: CTAS SQL that would be submitted ===")
        print(f"  dataset      : {args.dataset_id}")
        print(f"  dt           : {args.dt}")
        print(f"  ctas_table   : {ctas_table}")
        print()
        print(sql)
        return

    # ------------------------------------------------------------------
    # Resolve Athena config: CLI args > settings file
    # ------------------------------------------------------------------
    database: str | None = args.database
    workgroup: str | None = args.workgroup

    if database is None or workgroup is None:
        try:
            from report_system.config.settings import get_settings  # noqa: PLC0415
            settings = get_settings()
            database = database or settings.ATHENA_DATABASE
            workgroup = workgroup or settings.ATHENA_WORKGROUP
        except FileNotFoundError as exc:
            print(
                f"ERROR: {exc}\n"
                "Tip: pass --database / --workgroup explicitly, or create .env.local.",
                file=sys.stderr,
            )
            sys.exit(1)

    # ------------------------------------------------------------------
    # Build use-case and run
    # ------------------------------------------------------------------
    from report_system.application.curation.use_cases import CtasCurateAndRegisterUseCase  # noqa: PLC0415
    from report_system.infrastructure.athena.ctas import AthenaCtasRunner  # noqa: PLC0415
    from report_system.infrastructure.athena.partition_manager import AthenaPartitionManager  # noqa: PLC0415

    runner = AthenaCtasRunner(
        database=database,
        workgroup=workgroup,
        curated_bucket=args.bucket,
        curated_prefix=args.prefix,
        overwrite=args.overwrite,
    )
    registrar = AthenaPartitionManager(database=database, workgroup=workgroup)
    use_case = CtasCurateAndRegisterUseCase(ctas_runner=runner, registrar=registrar)

    print("=== E2E curate-and-register (Athena CTAS) ===")
    print(f"  dataset   : {args.dataset_id}")
    print(f"  dt        : {args.dt}")
    print(f"  bucket    : s3://{args.bucket}/{args.prefix}")
    print(f"  database  : {database}")
    print(f"  workgroup : {workgroup}")
    print(f"  overwrite : {args.overwrite}")
    print()

    try:
        result = use_case.execute(args.dataset_id, args.dt)
    except (ValueError, RuntimeError) as exc:
        print(f"FAILED: {exc}", file=sys.stderr)
        sys.exit(1)

    print("=== RESULT ===")
    print(f"  status    : {result.status}")
    print(f"  location  : {result.location}")
    print()
    print("Athena partition registered.")


if __name__ == "__main__":
    main()
