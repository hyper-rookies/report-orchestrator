"""Seed November 2024 mock data through the current run_id-based Athena pipeline.

Pipeline (all 30 days, 5 datasets):
  1) Generate mock raw JSONL.GZ files locally
  2) Upload local files to S3 raw/source=<source>/report=<dataset>/dt=<date>/
  3) Create raw external tables (raw_* tables)
  4) Register raw dt partitions
  5) Run Athena CTAS to curated/<dataset>/dt=<date>/run=<run_id>/
  6) Create or recreate curated external tables (dt, run_id)
  7) Register curated (dt, run_id) partitions
  8) Create v_latest_<dataset> views using run_id DESC
  9) Verify month counts from the views

This script is intended to align the shared Athena catalog with the current
repository design. It must not recreate the older dt-only dataset tables.

Usage:
    python backend/scripts/seed_nov2024.py --local-only
    python backend/scripts/seed_nov2024.py --recreate-curated-tables
    python backend/scripts/seed_nov2024.py --skip-upload --recreate-curated-tables
"""

from __future__ import annotations

import argparse
import os
import random
import sys
import time
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from report_system.application.common.env_guard import assert_prod_env
from report_system.domain.ingestion.models import (
    DimensionValue,
    MetricValue,
    ReportDataset,
    ReportRow,
)
from report_system.infrastructure.athena.ctas import REGISTRY, AthenaCtasRunner
from report_system.infrastructure.persistence.s3_key_builder import build_raw_key
from report_system.infrastructure.persistence.serializer import to_jsonl_gz


START_DATE = date(2024, 11, 1)
END_DATE = date(2024, 11, 30)
NOV_DATES = [START_DATE + timedelta(days=i) for i in range((END_DATE - START_DATE).days + 1)]


_RNG = random.Random(42)


def _day_mult(current_date: date) -> float:
    if current_date.day == 29:
        return 3.0
    if current_date.day == 30:
        return 1.8
    if current_date.day in (26, 27, 28):
        return 1.0 + 0.1 * (current_date.day - 25)
    if current_date.day == 25:
        return 1.1
    return 0.75 if current_date.weekday() >= 5 else 1.0


def _jitter(value: float, pct: float = 0.10) -> float:
    return value * (1.0 + _RNG.uniform(-pct, pct))


_GA4_ACQ = [
    ("Organic Search", "google", "organic", 1200, 1100, 45, 380_000.0),
    ("Paid Search", "google", "cpc", 800, 750, 30, 250_000.0),
    ("Paid Social", "facebook", "cpc", 600, 560, 22, 180_000.0),
    ("Direct", "(direct)", "(none)", 300, 280, 10, 90_000.0),
    ("Referral", "blog.hyperrookies.com", "referral", 150, 140, 5, 40_000.0),
    ("Email", "newsletter", "email", 100, 95, 8, 60_000.0),
]

_GA4_ENG = [
    ("Organic Search", "google", "organic", 0.72, 0.28),
    ("Paid Search", "google", "cpc", 0.65, 0.35),
    ("Paid Social", "facebook", "cpc", 0.55, 0.45),
    ("Direct", "(direct)", "(none)", 0.80, 0.20),
    ("Referral", "blog.hyperrookies.com", "referral", 0.68, 0.32),
    ("Email", "newsletter", "email", 0.78, 0.22),
]

_AF_COMBOS = [
    ("Facebook Ads", "hyper_ua_nov24", "interest_gaming", "Facebook Ads", "UA", "", "", 15),
    ("Facebook Ads", "hyper_retarget_nov24", "lal_purchasers", "Facebook Ads", "retargeting", "", "", 8),
    ("Google Ads", "brand_awareness", "", "Google Ads", "UA", "hyper rookies game", "Broad", 20),
    ("Google Ads", "competitor_ua", "", "Google Ads", "UA", "mobile rpg game", "Exact", 12),
    ("organic", "", "", "organic", "", "", "", 40),
    ("TikTok Ads", "tiktok_ua_nov24", "young_gamers", "TikTok Ads", "UA", "", "", 10),
    ("Apple Search Ads", "asa_brand_nov24", "", "Apple Search Ads", "UA", "", "", 9),
]

_APP_VERSION = "2.5.1"

_EVENT_TYPES = [
    ("tutorial_complete", 0.70, 0.0),
    ("level_complete", 0.40, 0.0),
    ("add_to_cart", 0.30, 0.0),
    ("purchase", 0.10, 85_000.0),
]

_COHORT_COMBOS = [
    ("Facebook Ads", "hyper_ua_nov24", 220, {0: 0.95, 1: 0.48, 7: 0.26, 14: 0.18, 30: 0.09}),
    ("Google Ads", "brand_awareness", 260, {0: 0.95, 1: 0.44, 7: 0.24, 14: 0.16, 30: 0.08}),
    ("organic", "", 340, {0: 0.98, 1: 0.58, 7: 0.38, 14: 0.27, 30: 0.14}),
    ("TikTok Ads", "tiktok_ua_nov24", 180, {0: 0.94, 1: 0.41, 7: 0.21, 14: 0.13, 30: 0.06}),
]

_COHORT_DAYS = [0, 1, 7, 14, 30]


def _ga4_acquisition_dataset(current_date: date) -> ReportDataset:
    multiplier = _day_mult(current_date)
    rows: list[ReportRow] = []
    for channel, source, medium, sessions, users, conversions, revenue in _GA4_ACQ:
        rows.append(
            ReportRow(
                dimensions=[
                    DimensionValue("sessionDefaultChannelGroup", channel),
                    DimensionValue("sessionSource", source),
                    DimensionValue("sessionMedium", medium),
                ],
                metrics=[
                    MetricValue("sessions", str(max(1, round(_jitter(sessions * multiplier))))),
                    MetricValue("totalUsers", str(max(1, round(_jitter(users * multiplier))))),
                    MetricValue("conversions", str(max(0, round(_jitter(conversions * multiplier))))),
                    MetricValue("totalRevenue", str(round(_jitter(revenue * multiplier), 2))),
                ],
            )
        )
    return ReportDataset(source="ga4", rows=rows)


def _ga4_engagement_dataset(current_date: date) -> ReportDataset:
    rows: list[ReportRow] = []
    for channel, source, medium, engagement_rate, bounce_rate in _GA4_ENG:
        rows.append(
            ReportRow(
                dimensions=[
                    DimensionValue("sessionDefaultChannelGroup", channel),
                    DimensionValue("sessionSource", source),
                    DimensionValue("sessionMedium", medium),
                ],
                metrics=[
                    MetricValue("engagementRate", str(round(min(0.99, max(0.01, _jitter(engagement_rate, 0.03))), 4))),
                    MetricValue("bounceRate", str(round(min(0.99, max(0.01, _jitter(bounce_rate, 0.03))), 4))),
                ],
            )
        )
    return ReportDataset(source="ga4", rows=rows)


def _install_row(
    media_source: str,
    campaign: str,
    adset: str,
    channel: str,
    campaign_type: str,
    keyword: str,
    match_type: str,
    reinstall: str,
) -> ReportRow:
    return ReportRow(
        dimensions=[
            DimensionValue("media_source", media_source),
            DimensionValue("campaign", campaign),
            DimensionValue("keyword", keyword),
            DimensionValue("adset", adset),
            DimensionValue("ad", ""),
            DimensionValue("channel", channel),
            DimensionValue("app_version", _APP_VERSION),
            DimensionValue("campaign_type", campaign_type),
            DimensionValue("match_type", match_type),
            DimensionValue("store_reinstall", reinstall),
        ],
        metrics=[],
    )


def _event_row(
    media_source: str,
    campaign: str,
    adset: str,
    channel: str,
    campaign_type: str,
    keyword: str,
    match_type: str,
    reinstall: str,
    event_name: str,
    revenue: float,
) -> ReportRow:
    return ReportRow(
        dimensions=[
            DimensionValue("media_source", media_source),
            DimensionValue("campaign", campaign),
            DimensionValue("event_name", event_name),
            DimensionValue("keyword", keyword),
            DimensionValue("adset", adset),
            DimensionValue("ad", ""),
            DimensionValue("channel", channel),
            DimensionValue("app_version", _APP_VERSION),
            DimensionValue("campaign_type", campaign_type),
            DimensionValue("match_type", match_type),
            DimensionValue("store_reinstall", reinstall),
        ],
        metrics=[MetricValue("event_revenue", str(revenue))],
    )


def _appsflyer_installs_dataset(current_date: date) -> ReportDataset:
    multiplier = _day_mult(current_date)
    rows: list[ReportRow] = []
    for media_source, campaign, adset, channel, campaign_type, keyword, match_type, base in _AF_COMBOS:
        count = max(1, round(_jitter(base * multiplier)))
        for _ in range(count):
            reinstall = "true" if _RNG.random() < 0.15 else "false"
            rows.append(
                _install_row(
                    media_source=media_source,
                    campaign=campaign,
                    adset=adset,
                    channel=channel,
                    campaign_type=campaign_type,
                    keyword=keyword,
                    match_type=match_type,
                    reinstall=reinstall,
                )
            )
    return ReportDataset(source="appsflyer", rows=rows)


def _appsflyer_events_dataset(current_date: date) -> ReportDataset:
    multiplier = _day_mult(current_date)
    rows: list[ReportRow] = []
    for media_source, campaign, adset, channel, campaign_type, keyword, match_type, base in _AF_COMBOS:
        install_count = max(1, round(_jitter(base * multiplier)))
        for event_name, rate, unit_revenue in _EVENT_TYPES:
            event_count = max(0, round(_jitter(install_count * rate)))
            for _ in range(event_count):
                reinstall = "true" if _RNG.random() < 0.15 else "false"
                rows.append(
                    _event_row(
                        media_source=media_source,
                        campaign=campaign,
                        adset=adset,
                        channel=channel,
                        campaign_type=campaign_type,
                        keyword=keyword,
                        match_type=match_type,
                        reinstall=reinstall,
                        event_name=event_name,
                        revenue=unit_revenue,
                    )
                )
    return ReportDataset(source="appsflyer", rows=rows)


def _appsflyer_cohort_dataset(current_date: date) -> ReportDataset:
    rows: list[ReportRow] = []
    for media_source, campaign, cohort_size, day_rates in _COHORT_COMBOS:
        for cohort_day in _COHORT_DAYS:
            retention_rate = round(max(0.01, _jitter(day_rates[cohort_day], 0.05)), 4)
            retained_users = max(1, round(cohort_size * retention_rate))
            cohort_date = (current_date - timedelta(days=cohort_day)).isoformat()
            rows.append(
                ReportRow(
                    dimensions=[
                        DimensionValue("media_source", media_source),
                        DimensionValue("campaign", campaign),
                        DimensionValue("cohort_date", cohort_date),
                        DimensionValue("cohort_day", str(cohort_day)),
                    ],
                    metrics=[
                        MetricValue("retained_users", str(retained_users)),
                        MetricValue("cohort_size", str(cohort_size)),
                    ],
                )
            )
    return ReportDataset(source="appsflyer", rows=rows)


GENERATORS = {
    "ga4_acquisition_daily": _ga4_acquisition_dataset,
    "ga4_engagement_daily": _ga4_engagement_dataset,
    "appsflyer_installs_daily": _appsflyer_installs_dataset,
    "appsflyer_events_daily": _appsflyer_events_dataset,
    "appsflyer_cohort_daily": _appsflyer_cohort_dataset,
}


CURATED_SCHEMAS = {
    "ga4_acquisition_daily": (
        "  channel_group STRING,\n"
        "  source        STRING,\n"
        "  medium        STRING,\n"
        "  sessions      BIGINT,\n"
        "  total_users   BIGINT,\n"
        "  conversions   BIGINT,\n"
        "  total_revenue DOUBLE"
    ),
    "ga4_engagement_daily": (
        "  channel_group   STRING,\n"
        "  source          STRING,\n"
        "  medium          STRING,\n"
        "  engagement_rate DOUBLE,\n"
        "  bounce_rate     DOUBLE"
    ),
    "appsflyer_installs_daily": (
        "  media_source    STRING,\n"
        "  campaign        STRING,\n"
        "  keyword         STRING,\n"
        "  adset           STRING,\n"
        "  ad              STRING,\n"
        "  channel         STRING,\n"
        "  app_version     STRING,\n"
        "  campaign_type   STRING,\n"
        "  match_type      STRING,\n"
        "  store_reinstall STRING,\n"
        "  installs        BIGINT"
    ),
    "appsflyer_events_daily": (
        "  media_source    STRING,\n"
        "  campaign        STRING,\n"
        "  event_name      STRING,\n"
        "  keyword         STRING,\n"
        "  adset           STRING,\n"
        "  ad              STRING,\n"
        "  channel         STRING,\n"
        "  app_version     STRING,\n"
        "  campaign_type   STRING,\n"
        "  match_type      STRING,\n"
        "  store_reinstall STRING,\n"
        "  event_count     BIGINT,\n"
        "  event_revenue   DOUBLE"
    ),
    "appsflyer_cohort_daily": (
        "  media_source    STRING,\n"
        "  campaign        STRING,\n"
        "  cohort_date     STRING,\n"
        "  cohort_day      BIGINT,\n"
        "  retained_users  BIGINT,\n"
        "  cohort_size     BIGINT"
    ),
}


def _section(title: str) -> None:
    print(f"\n{'=' * 72}")
    print(title)
    print(f"{'=' * 72}")


def _wait_query(athena_client, query_id: str, timeout_sec: int = 180) -> tuple[str, str | None]:
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


def _run_ddl(
    athena_client,
    sql: str,
    database: str,
    workgroup: str,
    label: str,
    timeout_sec: int = 180,
) -> None:
    response = athena_client.start_query_execution(
        QueryString=sql,
        QueryExecutionContext={"Database": database},
        WorkGroup=workgroup,
    )
    query_id = response["QueryExecutionId"]
    state, reason = _wait_query(athena_client, query_id, timeout_sec=timeout_sec)
    if state != "SUCCEEDED":
        raise RuntimeError(f"{label} failed: state={state}, reason={reason}, query_id={query_id}")


def _run_select(
    athena_client,
    sql: str,
    database: str,
    workgroup: str,
    timeout_sec: int = 180,
) -> list[list[str]]:
    response = athena_client.start_query_execution(
        QueryString=sql,
        QueryExecutionContext={"Database": database},
        WorkGroup=workgroup,
    )
    query_id = response["QueryExecutionId"]
    state, reason = _wait_query(athena_client, query_id, timeout_sec=timeout_sec)
    if state != "SUCCEEDED":
        raise RuntimeError(f"SELECT failed: state={state}, reason={reason}, query_id={query_id}")
    result = athena_client.get_query_results(QueryExecutionId=query_id)
    return [
        [col.get("VarCharValue", "") for col in row["Data"]]
        for row in result["ResultSet"]["Rows"]
    ]


def generate_local(out_dir: Path) -> dict[str, dict[str, Path]]:
    file_map: dict[str, dict[str, Path]] = {}
    out_dir.mkdir(parents=True, exist_ok=True)

    _section("1) Generate local raw JSONL.GZ files")
    for current_date in NOV_DATES:
        dt_str = current_date.isoformat()
        file_map[dt_str] = {}
        total_rows = 0

        for dataset_id in sorted(GENERATORS):
            dataset = GENERATORS[dataset_id](current_date)
            data_bytes = to_jsonl_gz(dataset)
            total_rows += len(dataset.rows)

            output_path = out_dir / build_raw_key(dataset.source, dataset_id, dt_str, "data.jsonl.gz")
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(data_bytes)
            file_map[dt_str][dataset_id] = output_path

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
    skip_create_raw_tables: bool,
    skip_create_curated_tables: bool,
    recreate_curated_tables: bool,
    skip_create_views: bool,
    run_id: str | None,
) -> None:
    try:
        import boto3  # noqa: PLC0415
    except ImportError as exc:
        raise RuntimeError("boto3 is required. Install with `pip install boto3`.") from exc

    s3 = boto3.client("s3", region_name=region)
    athena = boto3.client("athena", region_name=region)

    runner = AthenaCtasRunner(
        database=database,
        workgroup=workgroup,
        curated_bucket=data_bucket,
        curated_prefix="curated",
        region_name=region,
        run_id=run_id,
    )

    dataset_ids = sorted(REGISTRY)
    all_dates = sorted(file_map)
    failures: list[tuple[str, str]] = []
    successful_ctas: list[tuple[str, str]] = []

    print(f"Region      : {region}")
    print(f"Database    : {database}")
    print(f"Workgroup   : {workgroup}")
    print(f"Bucket      : {data_bucket}")
    print(f"Date range  : {all_dates[0]} ~ {all_dates[-1]} ({len(all_dates)} days)")
    print(f"Run ID      : {runner.run_id}")
    print(f"Datasets    : {dataset_ids}")

    if not skip_upload:
        _section("2) Upload local files to S3 raw paths")
        total = len(all_dates) * len(dataset_ids)
        uploaded = 0
        for dt_str, dataset_map in sorted(file_map.items()):
            for dataset_id, local_path in sorted(dataset_map.items()):
                spec = REGISTRY[dataset_id]
                key = build_raw_key(spec.source, dataset_id, dt_str, "data.jsonl.gz")
                s3.put_object(Bucket=data_bucket, Key=key, Body=local_path.read_bytes())
                uploaded += 1
                if uploaded % 20 == 0 or uploaded == total:
                    print(f"  uploaded {uploaded}/{total}")
    else:
        _section("2) Skip upload (--skip-upload)")

    if not skip_create_raw_tables:
        _section("3) Create raw external tables")
        for dataset_id in dataset_ids:
            spec = REGISTRY[dataset_id]
            location = f"s3://{data_bucket}/raw/source={spec.source}/report={dataset_id}/"
            ddl = (
                f"CREATE EXTERNAL TABLE IF NOT EXISTS {database}.{spec.raw_table} (\n"
                "    dimensions MAP<STRING, STRING>,\n"
                "    metrics    MAP<STRING, STRING>\n"
                ")\n"
                "PARTITIONED BY (dt STRING)\n"
                "ROW FORMAT SERDE 'org.apache.hive.hcatalog.data.JsonSerDe'\n"
                "STORED AS TEXTFILE\n"
                f"LOCATION '{location}'\n"
                "TBLPROPERTIES ('ignore.malformed.json' = 'true')"
            )
            try:
                _run_ddl(athena, ddl, database, workgroup, label=f"CREATE RAW {spec.raw_table}")
                print(f"  [ok] {spec.raw_table}")
            except RuntimeError as exc:
                failures.append((f"create_raw_{dataset_id}", str(exc)))
                print(f"  [FAIL] {spec.raw_table}: {exc}")
    else:
        _section("3) Skip raw table creation (--skip-create-raw-tables)")

    _section("4) Register raw dt partitions")
    for dt_str in all_dates:
        for dataset_id in dataset_ids:
            spec = REGISTRY[dataset_id]
            location = f"s3://{data_bucket}/raw/source={spec.source}/report={dataset_id}/dt={dt_str}/"
            ddl = (
                f"ALTER TABLE {database}.{spec.raw_table}\n"
                f"ADD IF NOT EXISTS PARTITION (dt='{dt_str}')\n"
                f"LOCATION '{location}'"
            )
            try:
                _run_ddl(athena, ddl, database, workgroup, label=f"ADD RAW PARTITION {spec.raw_table} {dt_str}")
            except RuntimeError as exc:
                failures.append((f"raw_partition_{dataset_id}_{dt_str}", str(exc)))
                print(f"  [FAIL] {spec.raw_table} dt={dt_str}: {exc}")
    print(f"  [done] {len(all_dates) * len(dataset_ids)} raw partition operations")

    _section("5) Run Athena CTAS to curated run partitions")
    for dt_str in all_dates:
        for dataset_id in dataset_ids:
            try:
                query_id, location = runner.run(dataset_id, dt_str)
                successful_ctas.append((dataset_id, dt_str))
                print(f"  [ok] {dataset_id} dt={dt_str} query_id={query_id} location={location}")
            except (RuntimeError, ValueError) as exc:
                failures.append((f"ctas_{dataset_id}_{dt_str}", str(exc)))
                print(f"  [FAIL] {dataset_id} dt={dt_str}: {exc}")

    if not skip_create_curated_tables:
        title = (
            "6) Recreate curated external tables (dt, run_id)"
            if recreate_curated_tables
            else "6) Create curated external tables (dt, run_id)"
        )
        _section(title)
        for dataset_id in dataset_ids:
            if recreate_curated_tables:
                try:
                    _run_ddl(
                        athena,
                        f"DROP TABLE IF EXISTS {database}.{dataset_id}",
                        database,
                        workgroup,
                        label=f"DROP CURATED {dataset_id}",
                    )
                    print(f"  [dropped] {dataset_id}")
                except RuntimeError as exc:
                    failures.append((f"drop_curated_{dataset_id}", str(exc)))
                    print(f"  [FAIL] drop {dataset_id}: {exc}")
                    continue

            location = f"s3://{data_bucket}/curated/{dataset_id}/"
            ddl = (
                f"CREATE EXTERNAL TABLE IF NOT EXISTS {database}.{dataset_id} (\n"
                f"{CURATED_SCHEMAS[dataset_id]}\n"
                ")\n"
                "PARTITIONED BY (dt STRING, run_id STRING)\n"
                "STORED AS PARQUET\n"
                f"LOCATION '{location}'\n"
                "TBLPROPERTIES ('parquet.compress' = 'SNAPPY')"
            )
            try:
                _run_ddl(athena, ddl, database, workgroup, label=f"CREATE CURATED {dataset_id}")
                print(f"  [ok] {dataset_id}")
            except RuntimeError as exc:
                failures.append((f"create_curated_{dataset_id}", str(exc)))
                print(f"  [FAIL] {dataset_id}: {exc}")
    else:
        _section("6) Skip curated table creation (--skip-create-curated-tables)")

    _section("7) Register curated (dt, run_id) partitions")
    for dataset_id, dt_str in successful_ctas:
        location = f"s3://{data_bucket}/curated/{dataset_id}/dt={dt_str}/run={runner.run_id}/"
        ddl = (
            f"ALTER TABLE {database}.{dataset_id}\n"
            f"ADD IF NOT EXISTS PARTITION (dt='{dt_str}', run_id='{runner.run_id}')\n"
            f"LOCATION '{location}'"
        )
        try:
            _run_ddl(athena, ddl, database, workgroup, label=f"ADD CURATED PARTITION {dataset_id} {dt_str}")
        except RuntimeError as exc:
            failures.append((f"curated_partition_{dataset_id}_{dt_str}", str(exc)))
            print(f"  [FAIL] {dataset_id} dt={dt_str} run_id={runner.run_id}: {exc}")
    print(f"  [done] {len(successful_ctas)} curated partition operations")

    if not skip_create_views:
        _section("8) Create v_latest_* views")
        for dataset_id in dataset_ids:
            view_name = f"v_latest_{dataset_id}"
            ddl = (
                f"CREATE OR REPLACE VIEW {database}.{view_name} AS\n"
                "SELECT * FROM (\n"
                "  SELECT *,\n"
                "         DENSE_RANK() OVER (\n"
                "           PARTITION BY dt ORDER BY run_id DESC\n"
                "         ) AS _run_rank\n"
                f"  FROM {database}.{dataset_id}\n"
                ") t\n"
                "WHERE t._run_rank = 1"
            )
            try:
                _run_ddl(athena, ddl, database, workgroup, label=f"CREATE VIEW {view_name}")
                print(f"  [ok] {view_name}")
            except RuntimeError as exc:
                failures.append((f"create_view_{dataset_id}", str(exc)))
                print(f"  [FAIL] {view_name}: {exc}")
    else:
        _section("8) Skip view creation (--skip-create-views)")

    _section("9) Verify month counts from views")
    for dataset_id in dataset_ids:
        view_name = f"v_latest_{dataset_id}"
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
            failures.append((f"verify_{dataset_id}", str(exc)))
            print(f"  [FAIL] {view_name}: {exc}")

    print(f"\n{'=' * 72}")
    if failures:
        print(f"Pipeline finished with {len(failures)} error(s):")
        for step, message in failures:
            print(f"  - {step}: {message.splitlines()[0][:140]}")
        sys.exit(1)
    print("Pipeline succeeded.")
    print(f"Run ID used: {runner.run_id}")
    print(f"{'=' * 72}")


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(
        description="Seed November 2024 mock data through the current run_id-based Athena pipeline.",
    )
    parser.add_argument(
        "--local-only",
        action="store_true",
        help="Only generate local raw files. Skip AWS upload and Athena work.",
    )
    parser.add_argument(
        "--skip-upload",
        action="store_true",
        help="Skip uploading raw files. Assume raw/source=... data already exists in S3.",
    )
    parser.add_argument(
        "--skip-create-raw-tables",
        action="store_true",
        help="Skip CREATE EXTERNAL TABLE for raw_* tables.",
    )
    parser.add_argument(
        "--skip-create-curated-tables",
        action="store_true",
        help="Skip CREATE EXTERNAL TABLE for curated tables.",
    )
    parser.add_argument(
        "--recreate-curated-tables",
        action="store_true",
        help="DROP + CREATE curated tables before partition registration.",
    )
    parser.add_argument(
        "--skip-create-views",
        action="store_true",
        help="Skip CREATE OR REPLACE VIEW for v_latest_*.",
    )
    parser.add_argument(
        "--run-id",
        default=None,
        help="Optional fixed run_id. Default: auto-generated UTC timestamp.",
    )
    parser.add_argument(
        "--out-dir",
        default=str(Path(__file__).parent.parent / "tmp" / "mock_raw_nov2024"),
        help="Local output directory for generated raw files.",
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
    database = os.environ.get("ATHENA_DATABASE", "hyper_intern_m1c")
    data_bucket = os.environ["DATA_BUCKET"]

    run_pipeline(
        file_map=file_map,
        data_bucket=data_bucket,
        region=region,
        database=database,
        workgroup=workgroup,
        skip_upload=args.skip_upload,
        skip_create_raw_tables=args.skip_create_raw_tables,
        skip_create_curated_tables=args.skip_create_curated_tables,
        recreate_curated_tables=args.recreate_curated_tables,
        skip_create_views=args.skip_create_views,
        run_id=args.run_id,
    )


if __name__ == "__main__":
    main()
