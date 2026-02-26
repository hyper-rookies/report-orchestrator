"""
Curated smoketest: read raw jsonl.gz → transform → write Parquet.

Supports two backends via --backend:
  local   Write to the local filesystem under --base-dir  (default)
  s3      Upload to S3; requires --s3-bucket.
          Use --dry-run to print what would be uploaded without calling S3.

Skips any dataset whose raw file does not exist (with a warning to stderr).
Run local_raw_smoketest.py first to generate the raw files for the local backend.

Examples:
    python scripts/local_curated_smoketest.py --base-dir ./tmp/smoketest_out

    python scripts/local_curated_smoketest.py \\
        --backend s3 --s3-bucket my-bucket --dt 2026-02-25 --dry-run

    python scripts/local_curated_smoketest.py \\
        --backend s3 --s3-bucket my-bucket --s3-prefix curated \\
        --base-dir ./tmp/smoketest_out --dt 2026-02-25
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Allow running from the project root without prior `pip install -e .`
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from report_system.application.curation.transformers import REGISTRY
from report_system.domain.curation.ports import CuratedStoragePort
from report_system.infrastructure.persistence.curated_writer import (
    LocalCuratedWriter,
    S3CuratedWriter,
    read_raw_jsonl_gz,
)
from report_system.infrastructure.persistence.s3_key_builder import build_raw_key


# ---------------------------------------------------------------------------
# Writer factory
# ---------------------------------------------------------------------------


def _build_writer(args: argparse.Namespace) -> CuratedStoragePort:
    if args.backend == "local":
        return LocalCuratedWriter(base_dir=args.base_dir)

    # s3 backend
    if not args.s3_bucket:
        print("ERROR: --s3-bucket is required when --backend s3", file=sys.stderr)
        sys.exit(1)
    return S3CuratedWriter(
        bucket=args.s3_bucket,
        prefix=args.s3_prefix,
        dry_run=args.dry_run,
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert raw jsonl.gz partitions to curated Parquet."
    )
    parser.add_argument(
        "--base-dir",
        default="./tmp/smoketest_out",
        help="Base directory for raw input (and curated output when --backend local). "
             "Default: ./tmp/smoketest_out",
    )
    parser.add_argument(
        "--dt",
        default="2026-02-25",
        help="Partition date in YYYY-MM-DD (default: 2026-02-25)",
    )
    parser.add_argument(
        "--backend",
        choices=["local", "s3"],
        default="local",
        help="Storage backend to write curated Parquet (default: local)",
    )
    # S3-specific options
    parser.add_argument(
        "--s3-bucket",
        default="",
        help="[s3 backend] S3 bucket name",
    )
    parser.add_argument(
        "--s3-prefix",
        default="curated",
        help="[s3 backend] Key prefix inside the bucket (default: curated)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="[s3 backend] Print what would be uploaded without calling S3",
    )
    args = parser.parse_args()

    base_dir = Path(args.base_dir)
    dt = args.dt
    writer: CuratedStoragePort = _build_writer(args)

    print(f"Converting raw → curated  backend={args.backend}  dt={dt}")
    if args.backend == "local":
        print(f"  base-dir : {base_dir}")
    else:
        dry = "  [DRY-RUN]" if args.dry_run else ""
        print(f"  s3-bucket: {args.s3_bucket}  prefix: {args.s3_prefix}{dry}")
    print()

    for dataset_id, spec in REGISTRY.items():
        raw_key = build_raw_key(spec.source, dataset_id, dt, "data.jsonl.gz")
        raw_path = base_dir / raw_key

        if not raw_path.exists():
            print(
                f"  WARN  [{dataset_id}] raw file not found, skipping: {raw_path}",
                file=sys.stderr,
            )
            continue

        records = read_raw_jsonl_gz(raw_path)
        table = spec.transform(records, dt)
        result = writer.write_parquet(dataset_id, dt, table)

        columns = table.schema.names
        print(
            f"  OK    [{dataset_id}]"
            f"  rows={result.row_count}"
            f"  columns={columns}"
        )
        print(f"        -> {result.location}")

    print()
    print("Done.")


if __name__ == "__main__":
    main()
