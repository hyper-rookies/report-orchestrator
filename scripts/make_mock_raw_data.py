"""Generate mock raw JSONL.GZ files for E2E smoke testing.

Produces small but valid JSONL.GZ records for all 5 datasets, using exactly
the dimensions/metrics keys that the CTAS SELECT registry references.

Record format (matching serializer.to_jsonl_gz output):
    {"dimensions": {"key": "str_value", ...}, "metrics": {"key": "str_value", ...}}

Note: metric values are stored as strings — the CTAS SELECT uses TRY_CAST to
convert them to BIGINT/DOUBLE when writing Parquet.

Output (default):
    ./tmp/mock_raw/source=<source>/report=<dataset>/dt=<dt>/<dataset>.jsonl.gz

No AWS calls, no credentials needed.

Usage:
    python scripts/make_mock_raw_data.py --dt 2026-02-27
    python scripts/make_mock_raw_data.py          # uses today's date
"""
from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

# Make src/ importable
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from report_system.domain.ingestion.models import (
    DimensionValue,
    MetricValue,
    ReportDataset,
    ReportRow,
)
from report_system.infrastructure.athena.ctas import REGISTRY
from report_system.infrastructure.persistence.serializer import to_jsonl_gz

# ---------------------------------------------------------------------------
# Mock records — keys must exactly match the CTAS SELECT registry
# ---------------------------------------------------------------------------
# All metric values are strings so TRY_CAST in CTAS always succeeds.

_MOCK_ROWS: dict[str, list[ReportRow]] = {
    # CTAS reads: dimensions['sessionDefaultChannelGroup'], ['sessionSource'],
    #             ['sessionMedium']
    #             metrics['sessions'], ['totalUsers'], ['conversions'],
    #             ['totalRevenue']
    "ga4_acquisition_daily": [
        ReportRow(
            dimensions=[
                DimensionValue("sessionDefaultChannelGroup", "Organic Search"),
                DimensionValue("sessionSource", "google"),
                DimensionValue("sessionMedium", "organic"),
            ],
            metrics=[
                MetricValue("sessions", "1200"),
                MetricValue("totalUsers", "1100"),
                MetricValue("conversions", "45"),
                MetricValue("totalRevenue", "380000"),
            ],
        ),
        ReportRow(
            dimensions=[
                DimensionValue("sessionDefaultChannelGroup", "Paid Search"),
                DimensionValue("sessionSource", "google"),
                DimensionValue("sessionMedium", "cpc"),
            ],
            metrics=[
                MetricValue("sessions", "800"),
                MetricValue("totalUsers", "750"),
                MetricValue("conversions", "30"),
                MetricValue("totalRevenue", "250000"),
            ],
        ),
        ReportRow(
            dimensions=[
                DimensionValue("sessionDefaultChannelGroup", "Direct"),
                DimensionValue("sessionSource", "(direct)"),
                DimensionValue("sessionMedium", "(none)"),
            ],
            metrics=[
                MetricValue("sessions", "300"),
                MetricValue("totalUsers", "280"),
                MetricValue("conversions", "10"),
                MetricValue("totalRevenue", "90000"),
            ],
        ),
    ],

    # CTAS reads: dimensions['sessionDefaultChannelGroup'], ['sessionSource'],
    #             ['sessionMedium']
    #             metrics['engagementRate'], ['bounceRate']
    "ga4_engagement_daily": [
        ReportRow(
            dimensions=[
                DimensionValue("sessionDefaultChannelGroup", "Organic Search"),
                DimensionValue("sessionSource", "google"),
                DimensionValue("sessionMedium", "organic"),
            ],
            metrics=[
                MetricValue("engagementRate", "0.72"),
                MetricValue("bounceRate", "0.28"),
            ],
        ),
        ReportRow(
            dimensions=[
                DimensionValue("sessionDefaultChannelGroup", "Paid Search"),
                DimensionValue("sessionSource", "google"),
                DimensionValue("sessionMedium", "cpc"),
            ],
            metrics=[
                MetricValue("engagementRate", "0.65"),
                MetricValue("bounceRate", "0.35"),
            ],
        ),
        ReportRow(
            dimensions=[
                DimensionValue("sessionDefaultChannelGroup", "Direct"),
                DimensionValue("sessionSource", "(direct)"),
                DimensionValue("sessionMedium", "(none)"),
            ],
            metrics=[
                MetricValue("engagementRate", "0.80"),
                MetricValue("bounceRate", "0.20"),
            ],
        ),
    ],

    # CTAS reads: dimensions['media_source'], ['campaign'], ['is_organic']
    #             metrics['installs']
    # is_organic must be 'true' or 'false' (LOWER comparison in CTAS)
    "appsflyer_installs_daily": [
        ReportRow(
            dimensions=[
                DimensionValue("media_source", "Facebook Ads"),
                DimensionValue("campaign", "spring_promo"),
                DimensionValue("is_organic", "false"),
            ],
            metrics=[
                MetricValue("installs", "340"),
            ],
        ),
        ReportRow(
            dimensions=[
                DimensionValue("media_source", "Organic"),
                DimensionValue("campaign", ""),
                DimensionValue("is_organic", "true"),
            ],
            metrics=[
                MetricValue("installs", "520"),
            ],
        ),
        ReportRow(
            dimensions=[
                DimensionValue("media_source", "Google Ads"),
                DimensionValue("campaign", "brand_awareness"),
                DimensionValue("is_organic", "false"),
            ],
            metrics=[
                MetricValue("installs", "210"),
            ],
        ),
    ],

    # CTAS reads: dimensions['media_source'], ['campaign'], ['event_name'],
    #             ['is_organic']
    #             metrics['event_count'], ['event_revenue']
    "appsflyer_events_daily": [
        ReportRow(
            dimensions=[
                DimensionValue("media_source", "Facebook Ads"),
                DimensionValue("campaign", "spring_promo"),
                DimensionValue("event_name", "purchase"),
                DimensionValue("is_organic", "false"),
            ],
            metrics=[
                MetricValue("event_count", "88"),
                MetricValue("event_revenue", "12450"),
            ],
        ),
        ReportRow(
            dimensions=[
                DimensionValue("media_source", "Organic"),
                DimensionValue("campaign", ""),
                DimensionValue("event_name", "add_to_cart"),
                DimensionValue("is_organic", "true"),
            ],
            metrics=[
                MetricValue("event_count", "230"),
                MetricValue("event_revenue", "0"),
            ],
        ),
        ReportRow(
            dimensions=[
                DimensionValue("media_source", "Google Ads"),
                DimensionValue("campaign", "brand_awareness"),
                DimensionValue("event_name", "purchase"),
                DimensionValue("is_organic", "false"),
            ],
            metrics=[
                MetricValue("event_count", "55"),
                MetricValue("event_revenue", "8750"),
            ],
        ),
    ],

    # CTAS reads: dimensions['media_source'], ['campaign'], ['is_organic']
    #             metrics['retention_d1'], ['retention_d7'], ['retention_d30']
    "appsflyer_retention_daily": [
        ReportRow(
            dimensions=[
                DimensionValue("media_source", "Facebook Ads"),
                DimensionValue("campaign", "spring_promo"),
                DimensionValue("is_organic", "false"),
            ],
            metrics=[
                MetricValue("retention_d1", "0.41"),
                MetricValue("retention_d7", "0.22"),
                MetricValue("retention_d30", "0.08"),
            ],
        ),
        ReportRow(
            dimensions=[
                DimensionValue("media_source", "Organic"),
                DimensionValue("campaign", ""),
                DimensionValue("is_organic", "true"),
            ],
            metrics=[
                MetricValue("retention_d1", "0.55"),
                MetricValue("retention_d7", "0.33"),
                MetricValue("retention_d30", "0.15"),
            ],
        ),
        ReportRow(
            dimensions=[
                DimensionValue("media_source", "Google Ads"),
                DimensionValue("campaign", "brand_awareness"),
                DimensionValue("is_organic", "false"),
            ],
            metrics=[
                MetricValue("retention_d1", "0.38"),
                MetricValue("retention_d7", "0.19"),
                MetricValue("retention_d30", "0.06"),
            ],
        ),
    ],
}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate mock raw JSONL.GZ files for E2E smoke testing.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--dt",
        default=str(date.today()),
        help="Partition date YYYY-MM-DD (default: today)",
    )
    parser.add_argument(
        "--out-dir",
        default=str(Path(__file__).parent.parent / "tmp" / "mock_raw"),
        help="Local output root directory",
    )
    args = parser.parse_args()

    out_base = Path(args.out_dir)

    print(f"Generating mock raw data  dt={args.dt}")
    print(f"Output: {out_base.resolve()}")
    print()

    for dataset_id, rows in sorted(_MOCK_ROWS.items()):
        spec = REGISTRY[dataset_id]
        ds = ReportDataset(source=spec.source, rows=rows)
        data_bytes = to_jsonl_gz(ds)

        out_path = (
            out_base
            / f"source={spec.source}"
            / f"report={dataset_id}"
            / f"dt={args.dt}"
            / f"{dataset_id}.jsonl.gz"
        )
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(data_bytes)

        print(f"  [{dataset_id}]")
        print(f"    rows        : {len(rows)}")
        print(f"    size        : {len(data_bytes)} bytes")
        print(f"    local path  : {out_path}")

    print()
    print("Done. Next step:")
    print(f"  python scripts/run_e2e_smoke.py --dt {args.dt}")


if __name__ == "__main__":
    main()
