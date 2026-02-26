"""
Local smoke-test: write mock raw partitions for all 5 datasets to disk
using LocalRawWriter, then print every generated file path.

Usage:
    python scripts/local_raw_smoketest.py --base-dir /tmp/out
    python scripts/local_raw_smoketest.py --base-dir ./tmp/smoketest_out
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

# Allow running from the project root without prior `pip install -e .`
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from report_system.domain.ingestion.models import (
    DimensionValue,
    MetricValue,
    ReportDataset,
    ReportRow,
)
from report_system.infrastructure.persistence.raw_writer import LocalRawWriter
from report_system.infrastructure.persistence.s3_key_builder import build_raw_key


# ---------------------------------------------------------------------------
# Mock data factories — GA4
# ---------------------------------------------------------------------------


def _make_ga4_acquisition_dataset() -> ReportDataset:
    rows = [
        ReportRow(
            dimensions=[
                DimensionValue("sessionDefaultChannelGroup", "Organic Search"),
                DimensionValue("sessionSource", "google"),
                DimensionValue("sessionMedium", "organic"),
            ],
            metrics=[
                MetricValue("sessions", 1200),
                MetricValue("totalUsers", 980),
                MetricValue("conversions", 45),
                MetricValue("totalRevenue", 1350000.0),
            ],
        ),
        ReportRow(
            dimensions=[
                DimensionValue("sessionDefaultChannelGroup", "Paid Search"),
                DimensionValue("sessionSource", "google"),
                DimensionValue("sessionMedium", "cpc"),
            ],
            metrics=[
                MetricValue("sessions", 540),
                MetricValue("totalUsers", 480),
                MetricValue("conversions", 28),
                MetricValue("totalRevenue", 840000.0),
            ],
        ),
    ]
    return ReportDataset(source="ga4", rows=rows, generated_at=datetime.now(tz=timezone.utc))


def _make_ga4_engagement_dataset() -> ReportDataset:
    rows = [
        ReportRow(
            dimensions=[
                DimensionValue("sessionDefaultChannelGroup", "Organic Search"),
                DimensionValue("sessionSource", "google"),
                DimensionValue("sessionMedium", "organic"),
            ],
            metrics=[
                MetricValue("engagementRate", 0.72),
                MetricValue("bounceRate", 0.28),
            ],
        ),
        ReportRow(
            dimensions=[
                DimensionValue("sessionDefaultChannelGroup", "Paid Search"),
                DimensionValue("sessionSource", "google"),
                DimensionValue("sessionMedium", "cpc"),
            ],
            metrics=[
                MetricValue("engagementRate", 0.61),
                MetricValue("bounceRate", 0.39),
            ],
        ),
    ]
    return ReportDataset(source="ga4", rows=rows, generated_at=datetime.now(tz=timezone.utc))


# ---------------------------------------------------------------------------
# Mock data factories — AppsFlyer
# ---------------------------------------------------------------------------


def _make_appsflyer_installs_dataset() -> ReportDataset:
    rows = [
        ReportRow(
            dimensions=[
                DimensionValue("media_source", "googleadwords_int"),
                DimensionValue("campaign", "brand_search_ko"),
                DimensionValue("is_organic", "false"),
            ],
            metrics=[
                MetricValue("installs", 320),
                MetricValue("cost", 480000.0),
            ],
        ),
        ReportRow(
            dimensions=[
                DimensionValue("media_source", "organic"),
                DimensionValue("campaign", ""),
                DimensionValue("is_organic", "true"),
            ],
            metrics=[
                MetricValue("installs", 150),
                MetricValue("cost", 0.0),
            ],
        ),
    ]
    return ReportDataset(source="appsflyer", rows=rows, generated_at=datetime.now(tz=timezone.utc))


def _make_appsflyer_events_dataset() -> ReportDataset:
    rows = [
        ReportRow(
            dimensions=[
                DimensionValue("media_source", "googleadwords_int"),
                DimensionValue("campaign", "brand_search_ko"),
                DimensionValue("event_name", "af_purchase"),
                DimensionValue("is_organic", "false"),
            ],
            metrics=[
                MetricValue("event_count", 10),
                MetricValue("event_revenue", 120000.0),
            ],
        ),
        ReportRow(
            dimensions=[
                DimensionValue("media_source", "organic"),
                DimensionValue("campaign", ""),
                DimensionValue("event_name", "af_level_achieved"),
                DimensionValue("is_organic", "true"),
            ],
            metrics=[
                MetricValue("event_count", 47),
                MetricValue("event_revenue", 0.0),
            ],
        ),
    ]
    return ReportDataset(source="appsflyer", rows=rows, generated_at=datetime.now(tz=timezone.utc))


def _make_appsflyer_retention_dataset() -> ReportDataset:
    rows = [
        ReportRow(
            dimensions=[
                DimensionValue("media_source", "googleadwords_int"),
                DimensionValue("campaign", "brand_search_ko"),
                DimensionValue("is_organic", "false"),
            ],
            metrics=[
                MetricValue("retention_d1", 0.45),
                MetricValue("retention_d7", 0.18),
                MetricValue("retention_d30", 0.07),
            ],
        ),
        ReportRow(
            dimensions=[
                DimensionValue("media_source", "organic"),
                DimensionValue("campaign", ""),
                DimensionValue("is_organic", "true"),
            ],
            metrics=[
                MetricValue("retention_d1", 0.38),
                MetricValue("retention_d7", 0.14),
                MetricValue("retention_d30", 0.05),
            ],
        ),
    ]
    return ReportDataset(source="appsflyer", rows=rows, generated_at=datetime.now(tz=timezone.utc))


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Write mock raw partitions to a local directory."
    )
    parser.add_argument(
        "--base-dir",
        default="./tmp/smoketest_out",
        help="Root directory for raw output (default: ./tmp/smoketest_out)",
    )
    parser.add_argument(
        "--dt",
        default="2026-02-25",
        help="Partition date in YYYY-MM-DD (default: 2026-02-25)",
    )
    args = parser.parse_args()

    base_dir = args.base_dir
    dt = args.dt

    jobs = [
        {
            "source": "ga4",
            "dataset_id": "ga4_acquisition_daily",
            "ds": _make_ga4_acquisition_dataset(),
        },
        {
            "source": "ga4",
            "dataset_id": "ga4_engagement_daily",
            "ds": _make_ga4_engagement_dataset(),
        },
        {
            "source": "appsflyer",
            "dataset_id": "appsflyer_installs_daily",
            "ds": _make_appsflyer_installs_dataset(),
        },
        {
            "source": "appsflyer",
            "dataset_id": "appsflyer_events_daily",
            "ds": _make_appsflyer_events_dataset(),
        },
        {
            "source": "appsflyer",
            "dataset_id": "appsflyer_retention_daily",
            "ds": _make_appsflyer_retention_dataset(),
        },
    ]

    generated: list[Path] = []
    for job in jobs:
        writer = LocalRawWriter(base_dir=base_dir, source=job["source"])
        writer.write_raw(
            dataset_id=job["dataset_id"],
            dt=dt,
            ds=job["ds"],
            start_date=dt,
            end_date=dt,
        )
        for filename in ("data.jsonl.gz", "_manifest.json"):
            key = build_raw_key(job["source"], job["dataset_id"], dt, filename)
            generated.append(Path(base_dir) / key)

    print("Generated files:")
    for p in generated:
        print(f"  {p}")


if __name__ == "__main__":
    main()
