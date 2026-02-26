"""
End-to-end smoke test: mock raw records → S3 curated Parquet → Athena partition.

Two modes, controlled by --dry-run:

  --dry-run  (safe, no credentials needed)
      S3CuratedWriter prints what it *would* upload without calling S3.
      Athena registration is skipped entirely.

  (no --dry-run)  ← real-credentials run
      Writes Parquet to real S3, then registers the dt-partition in Athena.
      Requires:
        - AWS credentials (env vars, ~/.aws/credentials, or IAM role)
        - .env.local with ATHENA_DATABASE / ATHENA_WORKGROUP
          (or pass --database / --workgroup explicitly)
      IAM permissions needed:
        - s3:PutObject on the curated bucket
        - athena:StartQueryExecution, athena:GetQueryExecution
        - glue:GetTable, glue:BatchCreatePartition on the target table

Usage:
    # Safe check — no AWS credentials required:
    python scripts/e2e_curate_and_register_smoketest.py --dry-run

    # Real run after receiving AWS access:
    python scripts/e2e_curate_and_register_smoketest.py \\
        --bucket hyper-intern-m1c-data \\
        --dt 2026-02-25

    # Override Athena config without .env.local:
    python scripts/e2e_curate_and_register_smoketest.py \\
        --bucket hyper-intern-m1c-data \\
        --database my_db --workgroup my-wg \\
        --dt 2026-02-25
"""
from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from report_system.application.curation.transformers import REGISTRY
from report_system.application.curation.use_cases import CurateAndRegisterUseCase
from report_system.infrastructure.athena.partition_manager import AthenaPartitionManager
from report_system.infrastructure.persistence.curated_writer import S3CuratedWriter


# ---------------------------------------------------------------------------
# Mock raw records — must use {"dimensions": ..., "metrics": ...} format
# so the transformer functions can extract fields correctly.
# ---------------------------------------------------------------------------

_MOCK_RECORDS: dict[str, list[dict[str, Any]]] = {
    "ga4_acquisition_daily": [
        {
            "dimensions": {
                "sessionDefaultChannelGroup": "Organic Search",
                "sessionSource": "google",
                "sessionMedium": "organic",
            },
            "metrics": {
                "sessions": "1200",
                "totalUsers": "980",
                "conversions": "45",
                "totalRevenue": "1350000.0",
            },
        },
        {
            "dimensions": {
                "sessionDefaultChannelGroup": "Paid Search",
                "sessionSource": "google",
                "sessionMedium": "cpc",
            },
            "metrics": {
                "sessions": "540",
                "totalUsers": "480",
                "conversions": "28",
                "totalRevenue": "840000.0",
            },
        },
    ],
    "ga4_engagement_daily": [
        {
            "dimensions": {
                "sessionDefaultChannelGroup": "Organic Search",
                "sessionSource": "google",
                "sessionMedium": "organic",
            },
            "metrics": {
                "engagementRate": "0.72",
                "bounceRate": "0.28",
            },
        },
    ],
    "appsflyer_installs_daily": [
        {
            "dimensions": {
                "media_source": "googleadwords_int",
                "campaign": "brand_2026q1",
                "is_organic": "false",
            },
            "metrics": {"installs": "320"},
        },
        {
            "dimensions": {
                "media_source": "organic",
                "campaign": None,
                "is_organic": "true",
            },
            "metrics": {"installs": "890"},
        },
    ],
    "appsflyer_events_daily": [
        {
            "dimensions": {
                "media_source": "googleadwords_int",
                "campaign": "brand_2026q1",
                "event_name": "purchase",
                "is_organic": "false",
            },
            "metrics": {
                "event_count": "47",
                "event_revenue": "235000.0",
            },
        },
    ],
    "appsflyer_retention_daily": [
        {
            "dimensions": {
                "media_source": "googleadwords_int",
                "campaign": "brand_2026q1",
                "is_organic": "false",
            },
            "metrics": {
                "retention_d1": "0.45",
                "retention_d7": "0.18",
                "retention_d30": "0.07",
            },
        },
    ],
}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "E2E smoke test: mock raw records → S3 Parquet → Athena partition.\n"
            "Add --dry-run to skip actual S3 / Athena calls."
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
        help="S3 key prefix (default: curated)",
    )
    parser.add_argument(
        "--database",
        default=None,
        help="Athena database — overrides settings / ATHENA_DATABASE env var",
    )
    parser.add_argument(
        "--workgroup",
        default=None,
        help="Athena workgroup — overrides settings / ATHENA_WORKGROUP env var",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be written/registered without calling S3 or Athena",
    )
    args = parser.parse_args()

    # ------------------------------------------------------------------
    # Resolve Athena config: CLI > settings file.
    # Only required when actually calling Athena (not dry-run).
    # ------------------------------------------------------------------
    database: str | None = args.database
    workgroup: str | None = args.workgroup

    if not args.dry_run and (database is None or workgroup is None):
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
    # Build DI components.
    # When dry-run: registrar is None → use_case skips partition registration.
    # ------------------------------------------------------------------
    storage = S3CuratedWriter(
        bucket=args.bucket,
        prefix=args.prefix,
        dry_run=args.dry_run,
    )
    registrar = (
        None
        if args.dry_run
        else AthenaPartitionManager(database=database, workgroup=workgroup)
    )

    use_case = CurateAndRegisterUseCase(storage=storage, registrar=registrar)

    # ------------------------------------------------------------------
    # Print run plan
    # ------------------------------------------------------------------
    print("=== E2E curate-and-register smoke test ===")
    print(f"  dataset   : {args.dataset_id}")
    print(f"  dt        : {args.dt}")
    print(f"  bucket    : s3://{args.bucket}/{args.prefix}")
    if args.dry_run:
        print("  mode      : DRY-RUN (no S3 write, no Athena call)")
    else:
        print(f"  database  : {database}")
        print(f"  workgroup : {workgroup}")
    print()

    # ------------------------------------------------------------------
    # Execute
    # ------------------------------------------------------------------
    records = _MOCK_RECORDS[args.dataset_id]

    try:
        result = use_case.execute(args.dataset_id, args.dt, records)
    except (ValueError, RuntimeError) as exc:
        print(f"FAILED: {exc}", file=sys.stderr)
        sys.exit(1)

    print("=== RESULT ===")
    print(f"  status    : {result.status}")
    print(f"  rows      : {result.row_count}")
    print(f"  location  : {result.location}")
    if not args.dry_run:
        print()
        print("Athena partition registered.")


if __name__ == "__main__":
    main()
