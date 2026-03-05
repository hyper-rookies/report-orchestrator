"""Generate November 2024 mock raw data and run the full raw→curated pipeline.

Pipeline (all 30 days, 5 datasets):
  1)  Generate mock JSONL.GZ files locally  (30 days × 5 datasets)
  2)  Upload local files → S3 raw/
  3)  Create raw external tables            (once, IF NOT EXISTS)
  4)  Add raw dt-partitions                 (30 × 5)
  5)  Verify raw row counts
  6)  Run Athena CTAS                       (30 dates; datasets submitted in parallel per date)
  7)  Create curated external tables        (once, IF NOT EXISTS)
  8)  Add curated (dt, run_id) partitions   (30 × 5)
  9)  Create v_latest_<dataset> views       (5 views)
  10) Verify via views                      (COUNT + LIMIT 3 per dataset)

Usage (generate locally only — no AWS calls):
    python scripts/seed_nov2024.py --local-only

Usage (full pipeline):
    python scripts/seed_nov2024.py

Usage (skip re-upload if files already in S3):
    python scripts/seed_nov2024.py --skip-upload

Usage (skip table creation if tables already exist):
    python scripts/seed_nov2024.py --skip-create-raw-tables --skip-create-curated-tables

Env vars required for full pipeline:
    AWS_REGION       = ap-northeast-2
    ATHENA_WORKGROUP = hyper-intern-m1c-wg
    ATHENA_DATABASE  = hyper_intern_m1c          (optional, defaults to this)
    ATHENA_OUTPUT_S3 = s3://..../athena-results/
    DATA_BUCKET      = hyper-intern-m1c-data-bucket

PowerShell env setup:
    $env:AWS_REGION       = "ap-northeast-2"
    $env:ATHENA_WORKGROUP = "hyper-intern-m1c-wg"
    $env:ATHENA_DATABASE  = "hyper_intern_m1c"
    $env:ATHENA_OUTPUT_S3 = "s3://hyper-intern-m1c-athena-results-bucket/athena-results/"
    $env:DATA_BUCKET      = "hyper-intern-m1c-data-bucket"
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


# ---------------------------------------------------------------------------
# Date range
# ---------------------------------------------------------------------------

_START = date(2024, 11, 1)
_END = date(2024, 11, 30)
NOV_DATES = [_START + timedelta(days=i) for i in range(30)]

# ---------------------------------------------------------------------------
# Reproducible RNG
# ---------------------------------------------------------------------------

_RNG = random.Random(42)


def _day_mult(d: date) -> float:
    """Return a volume multiplier based on date.

    Nov 29 = Black Friday (Fri), Nov 28 = Thanksgiving (Thu).
    """
    if d.day == 29:          # Black Friday — 3× spike
        return 3.0
    if d.day == 30:          # Post-BF Saturday — still elevated
        return 1.8
    if d.day in (26, 27, 28):  # Tue/Wed/Thu leading into BF
        return 1.0 + 0.1 * (d.day - 25)  # 1.1 → 1.2 → 1.3 → 1.4
    if d.day == 25:          # Mon before BF week
        return 1.1
    return 0.75 if d.weekday() >= 5 else 1.0  # weekend vs weekday


def _j(v: float, pct: float = 0.10) -> float:
    """Apply ±pct random jitter (uses module-level _RNG)."""
    return v * (1.0 + _RNG.uniform(-pct, pct))


# ---------------------------------------------------------------------------
# GA4 data templates  (pre-aggregated: 1 row per channel/day)
# ---------------------------------------------------------------------------

# (channel_group, sessionSource, sessionMedium, sessions, totalUsers, conversions, totalRevenue)
_GA4_ACQ = [
    ("Organic Search", "google",               "organic",  1200, 1100, 45,  380_000.0),
    ("Paid Search",    "google",               "cpc",       800,  750, 30,  250_000.0),
    ("Paid Social",    "facebook",             "cpc",       600,  560, 22,  180_000.0),
    ("Direct",         "(direct)",             "(none)",    300,  280, 10,   90_000.0),
    ("Referral",       "blog.hyperrookies.com","referral",  150,  140,  5,   40_000.0),
    ("Email",          "newsletter",           "email",     100,   95,  8,   60_000.0),
]

# (channel_group, sessionSource, sessionMedium, engagementRate, bounceRate)
_GA4_ENG = [
    ("Organic Search", "google",               "organic",  0.72, 0.28),
    ("Paid Search",    "google",               "cpc",      0.65, 0.35),
    ("Paid Social",    "facebook",             "cpc",      0.55, 0.45),
    ("Direct",         "(direct)",             "(none)",   0.80, 0.20),
    ("Referral",       "blog.hyperrookies.com","referral", 0.68, 0.32),
    ("Email",          "newsletter",           "email",    0.78, 0.22),
]


def _gen_ga4_acq(d: date) -> list[ReportRow]:
    m = _day_mult(d)
    rows = []
    for ch, src, med, sess, users, conv, rev in _GA4_ACQ:
        rows.append(ReportRow(
            dimensions=[
                DimensionValue("sessionDefaultChannelGroup", ch),
                DimensionValue("sessionSource", src),
                DimensionValue("sessionMedium", med),
            ],
            metrics=[
                MetricValue("sessions",     str(max(1, round(_j(sess * m))))),
                MetricValue("totalUsers",   str(max(1, round(_j(users * m))))),
                MetricValue("conversions",  str(max(0, round(_j(conv * m))))),
                MetricValue("totalRevenue", str(round(_j(rev * m), 2))),
            ],
        ))
    return rows


def _gen_ga4_eng(d: date) -> list[ReportRow]:
    rows = []
    for ch, src, med, eng, bnc in _GA4_ENG:
        e = round(min(0.99, max(0.01, _j(eng, 0.03))), 4)
        b = round(min(0.99, max(0.01, _j(bnc, 0.03))), 4)
        rows.append(ReportRow(
            dimensions=[
                DimensionValue("sessionDefaultChannelGroup", ch),
                DimensionValue("sessionSource", src),
                DimensionValue("sessionMedium", med),
            ],
            metrics=[
                MetricValue("engagementRate", str(e)),
                MetricValue("bounceRate",     str(b)),
            ],
        ))
    return rows


# ---------------------------------------------------------------------------
# AppsFlyer data templates  (event-level: each row = 1 install / 1 event)
# ---------------------------------------------------------------------------
# CTAS uses COUNT(*) GROUP BY for installs, COUNT(*)/SUM() for events.
#
# (media_source, campaign, adset, channel, campaign_type, keyword, match_type, base_installs_per_day)

_AF_COMBOS = [
    ("Facebook Ads",  "hyper_ua_nov24",       "interest_gaming",  "Facebook Ads",  "UA",          "",                  "",        15),
    ("Facebook Ads",  "hyper_retarget_nov24", "lal_purchasers",   "Facebook Ads",  "retargeting", "",                  "",         8),
    ("Google Ads",    "brand_awareness",      "",                 "Google Ads",    "UA",          "hyper rookies game","Broad",   20),
    ("Google Ads",    "competitor_ua",        "",                 "Google Ads",    "UA",          "mobile rpg game",  "Exact",   12),
    ("Organic",       "",                     "",                 "Organic",       "",            "",                  "",        40),
    ("TikTok Ads",    "tiktok_ua_nov24",      "young_gamers",     "TikTok Ads",    "UA",          "",                  "",        10),
]

_APP_VERSION = "2.5.1"

# (event_name, fraction_of_installs, revenue_per_event_krw)
_EVENT_TYPES = [
    ("tutorial_complete", 0.70,  0.0),
    ("level_complete",    0.40,  0.0),
    ("add_to_cart",       0.30,  0.0),
    ("purchase",          0.10, 85_000.0),
]


def _install_row(ms: str, camp: str, adset: str, ch: str, camp_type: str,
                 kw: str, match: str, reinstall: str) -> ReportRow:
    return ReportRow(
        dimensions=[
            DimensionValue("media_source",    ms),
            DimensionValue("campaign",        camp),
            DimensionValue("keyword",         kw),
            DimensionValue("adset",           adset),
            DimensionValue("ad",              ""),
            DimensionValue("channel",         ch),
            DimensionValue("app_version",     _APP_VERSION),
            DimensionValue("campaign_type",   camp_type),
            DimensionValue("match_type",      match),
            DimensionValue("store_reinstall", reinstall),
        ],
        metrics=[],
    )


def _event_row(ms: str, camp: str, adset: str, ch: str, camp_type: str,
               kw: str, match: str, reinstall: str,
               event_name: str, revenue: float) -> ReportRow:
    return ReportRow(
        dimensions=[
            DimensionValue("media_source",    ms),
            DimensionValue("campaign",        camp),
            DimensionValue("event_name",      event_name),
            DimensionValue("keyword",         kw),
            DimensionValue("adset",           adset),
            DimensionValue("ad",              ""),
            DimensionValue("channel",         ch),
            DimensionValue("app_version",     _APP_VERSION),
            DimensionValue("campaign_type",   camp_type),
            DimensionValue("match_type",      match),
            DimensionValue("store_reinstall", reinstall),
        ],
        metrics=[MetricValue("event_revenue", str(revenue))],
    )


def _gen_af_installs(d: date) -> list[ReportRow]:
    m = _day_mult(d)
    rows: list[ReportRow] = []
    for ms, camp, adset, ch, ct, kw, match, base in _AF_COMBOS:
        count = max(1, round(_j(base * m)))
        for _ in range(count):
            reinstall = "true" if _RNG.random() < 0.15 else "false"
            rows.append(_install_row(ms, camp, adset, ch, ct, kw, match, reinstall))
    return rows


def _gen_af_events(d: date) -> list[ReportRow]:
    m = _day_mult(d)
    rows: list[ReportRow] = []
    for ms, camp, adset, ch, ct, kw, match, base in _AF_COMBOS:
        install_count = max(1, round(_j(base * m)))
        for event_name, rate, unit_rev in _EVENT_TYPES:
            event_count = max(0, round(_j(install_count * rate)))
            for _ in range(event_count):
                reinstall = "true" if _RNG.random() < 0.15 else "false"
                rows.append(_event_row(ms, camp, adset, ch, ct, kw, match, reinstall,
                                       event_name, unit_rev))
    return rows


# ---------------------------------------------------------------------------
# AppsFlyer Retention  (pre-aggregated: 1 row per combo/day)
# ---------------------------------------------------------------------------

# (media_source, campaign, is_organic, retention_d1, retention_d7, retention_d30)
_AF_RET = [
    ("Facebook Ads",  "hyper_ua_nov24",  "false", 0.41, 0.22, 0.08),
    ("Google Ads",    "brand_awareness", "false", 0.38, 0.19, 0.06),
    ("Organic",       "",                "true",  0.55, 0.33, 0.15),
    ("TikTok Ads",    "tiktok_ua_nov24", "false", 0.36, 0.18, 0.05),
]


def _gen_af_retention(_d: date) -> list[ReportRow]:
    # Retention rates don't vary by date multiplier (they reflect cohort quality)
    rows: list[ReportRow] = []
    for ms, camp, org, d1, d7, d30 in _AF_RET:
        rows.append(ReportRow(
            dimensions=[
                DimensionValue("media_source", ms),
                DimensionValue("campaign",     camp),
                DimensionValue("is_organic",   org),
            ],
            metrics=[
                MetricValue("retention_d1",  str(round(max(0.01, _j(d1,  0.05)), 4))),
                MetricValue("retention_d7",  str(round(max(0.01, _j(d7,  0.05)), 4))),
                MetricValue("retention_d30", str(round(max(0.01, _j(d30, 0.05)), 4))),
            ],
        ))
    return rows


# ---------------------------------------------------------------------------
# Local file generation
# ---------------------------------------------------------------------------

_GENERATORS = {
    "ga4_acquisition_daily":     _gen_ga4_acq,
    "ga4_engagement_daily":      _gen_ga4_eng,
    "appsflyer_installs_daily":  _gen_af_installs,
    "appsflyer_events_daily":    _gen_af_events,
    "appsflyer_retention_daily": _gen_af_retention,
}


def generate_local(out_dir: Path) -> dict[str, dict[str, Path]]:
    """Generate JSONL.GZ files for all 30 days and return {dt: {dataset_id: path}}."""
    print(f"Generating mock data  {_START} → {_END}  ({len(NOV_DATES)} days × {len(_GENERATORS)} datasets)")
    print(f"Output: {out_dir.resolve()}")
    print()

    file_map: dict[str, dict[str, Path]] = {}

    for d in NOV_DATES:
        dt_str = str(d)
        file_map[dt_str] = {}
        total_rows = 0

        for dataset_id in sorted(_GENERATORS):
            gen = _GENERATORS[dataset_id]
            rows = gen(d)
            total_rows += len(rows)

            spec = REGISTRY[dataset_id]
            ds = ReportDataset(source=spec.source, rows=rows)
            data_bytes = to_jsonl_gz(ds)

            out_path = (
                out_dir
                / f"source={spec.source}"
                / f"report={dataset_id}"
                / f"dt={dt_str}"
                / f"{dataset_id}.jsonl.gz"
            )
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_bytes(data_bytes)
            file_map[dt_str][dataset_id] = out_path

        print(f"  [{dt_str}]  {total_rows:5d} rows")

    print()
    print(f"All files written to {out_dir}")
    return file_map


# ---------------------------------------------------------------------------
# Curated table schemas  (KEEP IN SYNC WITH run_e2e_smoke.py)
# ---------------------------------------------------------------------------

_CURATED_SCHEMAS: dict[str, str] = {
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
    "appsflyer_retention_daily": (
        "  media_source  STRING,\n"
        "  campaign      STRING,\n"
        "  is_organic    BOOLEAN,\n"
        "  retention_d1  DOUBLE,\n"
        "  retention_d7  DOUBLE,\n"
        "  retention_d30 DOUBLE"
    ),
}


# ---------------------------------------------------------------------------
# Athena helpers  (adapted from run_e2e_smoke.py)
# ---------------------------------------------------------------------------


def _wait(athena_client, query_id: str, timeout: int = 120) -> tuple[str, str | None]:
    deadline = time.monotonic() + timeout
    while True:
        resp = athena_client.get_query_execution(QueryExecutionId=query_id)
        status = resp["QueryExecution"]["Status"]
        state: str = status["State"]
        if state in ("SUCCEEDED", "FAILED", "CANCELLED"):
            return state, status.get("StateChangeReason")
        if time.monotonic() > deadline:
            raise RuntimeError(f"Query {query_id} timed out after {timeout}s (state={state})")
        time.sleep(2)


def _run_ddl(athena_client, sql: str, database: str, workgroup: str,
             label: str = "DDL", timeout: int = 120) -> None:
    resp = athena_client.start_query_execution(
        QueryString=sql,
        QueryExecutionContext={"Database": database},
        WorkGroup=workgroup,
    )
    qid = resp["QueryExecutionId"]
    state, reason = _wait(athena_client, qid, timeout)
    if state != "SUCCEEDED":
        raise RuntimeError(
            f"{label} failed  state={state}  reason={reason}\nSQL:\n{sql}"
        )


def _run_select(athena_client, sql: str, database: str, workgroup: str,
                timeout: int = 120) -> list[list[str]]:
    resp = athena_client.start_query_execution(
        QueryString=sql,
        QueryExecutionContext={"Database": database},
        WorkGroup=workgroup,
    )
    qid = resp["QueryExecutionId"]
    state, reason = _wait(athena_client, qid, timeout)
    if state != "SUCCEEDED":
        raise RuntimeError(f"SELECT failed  state={state}  reason={reason}\nSQL: {sql}")
    results = athena_client.get_query_results(QueryExecutionId=qid)
    return [
        [col.get("VarCharValue", "") for col in row["Data"]]
        for row in results["ResultSet"]["Rows"]
    ]


def _section(n: int | str, title: str) -> None:
    print(f"\n{'=' * 66}")
    print(f"  Phase {n}: {title}")
    print(f"{'=' * 66}")


def _print_table(rows: list[list[str]], max_col_width: int = 20) -> None:
    if len(rows) <= 1:
        print("    (no data rows)")
        return
    headers = rows[0]
    data = rows[1:]
    col_w = [
        min(max_col_width, max(len(h), *(len(r[i]) for r in data if i < len(r))))
        for i, h in enumerate(headers)
    ]
    sep = "  ".join("-" * w for w in col_w)
    header_line = "  ".join(h.ljust(col_w[i]) for i, h in enumerate(headers))
    print(f"    {header_line}")
    print(f"    {sep}")
    for row in data:
        line = "  ".join(
            (row[i] if i < len(row) else "")[:col_w[i]].ljust(col_w[i])
            for i in range(len(headers))
        )
        print(f"    {line}")


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------


def run_pipeline(
    file_map: dict[str, dict[str, Path]],
    data_bucket: str,
    region: str,
    database: str,
    workgroup: str,
    skip_upload: bool,
    skip_create_raw_tables: bool,
    skip_create_curated_tables: bool,
) -> None:
    try:
        import boto3  # noqa: PLC0415
    except ImportError:
        print("ERROR: boto3 not installed.  Run: pip install boto3", file=sys.stderr)
        sys.exit(1)

    s3 = boto3.client("s3", region_name=region)
    athena = boto3.client("athena", region_name=region)

    runner = AthenaCtasRunner(
        database=database,
        workgroup=workgroup,
        curated_bucket=data_bucket,
        curated_prefix="curated",
        region_name=region,
    )
    run_id = runner.run_id
    all_dates = sorted(file_map)
    datasets = sorted(REGISTRY)
    failures: list[tuple[str, str]] = []

    print(f"\nPipeline run_id : {run_id}")
    print(f"Dates           : {all_dates[0]} → {all_dates[-1]}  ({len(all_dates)} days)")
    print(f"Datasets        : {datasets}")
    print(f"Bucket          : {data_bucket}")

    # ================================================================
    # Phase 1: Upload raw JSONL.GZ files to S3
    # ================================================================
    if not skip_upload:
        _section(1, "Upload raw JSONL.GZ → S3")
        uploaded = 0
        for dt_str, ds_paths in sorted(file_map.items()):
            for dataset_id, local_path in sorted(ds_paths.items()):
                spec = REGISTRY[dataset_id]
                s3_key = build_raw_key(spec.source, dataset_id, dt_str,
                                       f"{dataset_id}.jsonl.gz")
                with open(local_path, "rb") as fh:
                    s3.put_object(Bucket=data_bucket, Key=s3_key, Body=fh.read())
                uploaded += 1
                if uploaded % 10 == 0:
                    print(f"  uploaded {uploaded}/{len(all_dates) * len(datasets)} ...")
        print(f"  [done]  {uploaded} files uploaded")
    else:
        _section(1, "Skip upload (--skip-upload)")

    # ================================================================
    # Phase 2: Create raw external tables  (once)
    # ================================================================
    if not skip_create_raw_tables:
        _section(2, "Create raw external tables  (IF NOT EXISTS)")
        for dataset_id in datasets:
            spec = REGISTRY[dataset_id]
            location = f"s3://{data_bucket}/raw/source={spec.source}/report={dataset_id}/"
            ddl = (
                f"CREATE EXTERNAL TABLE IF NOT EXISTS {database}.{spec.raw_table} (\n"
                f"    dimensions MAP<STRING, STRING>,\n"
                f"    metrics    MAP<STRING, STRING>\n"
                f")\n"
                f"PARTITIONED BY (dt STRING)\n"
                f"ROW FORMAT SERDE 'org.apache.hive.hcatalog.data.JsonSerDe'\n"
                f"STORED AS TEXTFILE\n"
                f"LOCATION '{location}'\n"
                f"TBLPROPERTIES ('ignore.malformed.json' = 'true')"
            )
            try:
                _run_ddl(athena, ddl, database, workgroup, label=f"CREATE {spec.raw_table}")
                print(f"  [ok]  {database}.{spec.raw_table}")
            except RuntimeError as exc:
                print(f"  [FAIL]  {spec.raw_table}: {exc}")
                failures.append((f"create_raw_{dataset_id}", str(exc)))
    else:
        _section(2, "Skip raw table creation (--skip-create-raw-tables)")

    # ================================================================
    # Phase 3: Add raw dt-partitions  (30 dates × 5 datasets)
    # ================================================================
    _section(3, f"Add raw dt-partitions  ({len(all_dates)} dates × {len(datasets)} datasets)")
    for dt_str in all_dates:
        for dataset_id in datasets:
            spec = REGISTRY[dataset_id]
            raw_part_loc = (
                f"s3://{data_bucket}/raw/source={spec.source}"
                f"/report={dataset_id}/dt={dt_str}/"
            )
            alter_sql = (
                f"ALTER TABLE {database}.{spec.raw_table}\n"
                f"ADD IF NOT EXISTS PARTITION (dt='{dt_str}')\n"
                f"LOCATION '{raw_part_loc}'"
            )
            try:
                _run_ddl(athena, alter_sql, database, workgroup,
                         label=f"ADD PARTITION {spec.raw_table} dt={dt_str}")
            except RuntimeError as exc:
                print(f"  [FAIL]  {spec.raw_table} dt={dt_str}: {exc}")
                failures.append((f"add_raw_partition_{dataset_id}_{dt_str}", str(exc)))
    print(f"  [done]  {len(all_dates) * len(datasets)} partitions registered")

    # ================================================================
    # Phase 4: Verify raw data  (COUNT per dataset for first+last date)
    # ================================================================
    _section(4, "Spot-check raw data  (COUNT(*) for 2024-11-01 and 2024-11-30)")
    for check_dt in ("2024-11-01", "2024-11-30"):
        for dataset_id in datasets:
            spec = REGISTRY[dataset_id]
            sql = (
                f"SELECT COUNT(*) AS cnt "
                f"FROM {database}.{spec.raw_table} "
                f"WHERE dt='{check_dt}'"
            )
            try:
                rows = _run_select(athena, sql, database, workgroup)
                count = rows[1][0] if len(rows) > 1 else "?"
                ok = "[ok]" if int(count) > 0 else "[WARN: 0 rows]"
                print(f"  {ok}  {spec.raw_table:45s}  dt={check_dt}  COUNT={count}")
            except RuntimeError as exc:
                print(f"  [FAIL]  {spec.raw_table} {check_dt}: {exc}")
                failures.append((f"verify_raw_{dataset_id}_{check_dt}", str(exc)))

    # ================================================================
    # Phase 5: Run Athena CTAS  (30 dates; submit all datasets per date in parallel)
    # ================================================================
    _section(5, f"Run Athena CTAS  (run_id={run_id})")
    ctas_partitions: list[tuple[str, str]] = []  # (dataset_id, dt_str) for succeeded

    for dt_str in all_dates:
        # Submit all 5 datasets for this date (async)
        batch: list[tuple[str, str, str]] = []  # (query_id, ctas_table, dataset_id)
        for dataset_id in datasets:
            try:
                qid, ctas_table = runner.start_ctas_query(dataset_id, dt_str)
                batch.append((qid, ctas_table, dataset_id))
            except (ValueError, RuntimeError) as exc:
                print(f"  [SUBMIT FAIL]  {dataset_id} {dt_str}: {exc}")
                failures.append((f"ctas_submit_{dataset_id}_{dt_str}", str(exc)))

        # Wait for all 5 queries of this date
        ok_count = 0
        for qid, ctas_table, dataset_id in batch:
            state, _, reason = runner.wait_query(qid, timeout_sec=180)
            if state == "SUCCEEDED":
                runner.drop_ctas_table(ctas_table)
                ctas_partitions.append((dataset_id, dt_str))
                ok_count += 1
            else:
                print(f"  [FAIL]  CTAS {dataset_id} {dt_str}  state={state}  reason={reason}")
                failures.append((f"ctas_{dataset_id}_{dt_str}", f"{state}: {reason}"))

        print(f"  [{dt_str}]  {ok_count}/{len(batch)} datasets succeeded")

    print(f"\n  CTAS complete: {len(ctas_partitions)} partitions created")

    # ================================================================
    # Phase 6: Create curated external tables  (once)
    # ================================================================
    if not skip_create_curated_tables:
        _section(6, "Create curated external tables  (IF NOT EXISTS)")
        for dataset_id in datasets:
            schema = _CURATED_SCHEMAS[dataset_id]
            location = f"s3://{data_bucket}/curated/{dataset_id}/"
            ddl = (
                f"CREATE EXTERNAL TABLE IF NOT EXISTS {database}.{dataset_id} (\n"
                f"{schema}\n"
                f")\n"
                f"PARTITIONED BY (dt STRING, run_id STRING)\n"
                f"STORED AS PARQUET\n"
                f"LOCATION '{location}'\n"
                f"TBLPROPERTIES ('parquet.compress' = 'SNAPPY')"
            )
            try:
                _run_ddl(athena, ddl, database, workgroup, label=f"CREATE {dataset_id}")
                print(f"  [ok]  {database}.{dataset_id}")
            except RuntimeError as exc:
                print(f"  [FAIL]  {dataset_id}: {exc}")
                failures.append((f"create_curated_{dataset_id}", str(exc)))
    else:
        _section(6, "Skip curated table creation (--skip-create-curated-tables)")

    # ================================================================
    # Phase 7: Add curated (dt, run_id) partitions
    # ================================================================
    _section(7, f"Add curated (dt, run_id) partitions  ({len(ctas_partitions)} partitions)")
    for dataset_id, dt_str in ctas_partitions:
        loc = (
            f"s3://{data_bucket}/curated/{dataset_id}"
            f"/dt={dt_str}/run={run_id}/"
        )
        alter_sql = (
            f"ALTER TABLE {database}.{dataset_id}\n"
            f"ADD IF NOT EXISTS PARTITION (dt='{dt_str}', run_id='{run_id}')\n"
            f"LOCATION '{loc}'"
        )
        try:
            _run_ddl(athena, alter_sql, database, workgroup,
                     label=f"ADD PARTITION {dataset_id} dt={dt_str}")
        except RuntimeError as exc:
            print(f"  [FAIL]  {dataset_id} dt={dt_str}: {exc}")
            failures.append((f"add_curated_partition_{dataset_id}_{dt_str}", str(exc)))
    print(f"  [done]  {len(ctas_partitions)} partitions registered")

    # ================================================================
    # Phase 8: Create v_latest_<dataset> views
    # ================================================================
    _section(8, "Create v_latest_<dataset> views")
    for dataset_id in datasets:
        view_name = f"v_latest_{dataset_id}"
        view_sql = (
            f"CREATE OR REPLACE VIEW {database}.{view_name} AS\n"
            f"SELECT * FROM (\n"
            f"  SELECT *,\n"
            f"         DENSE_RANK() OVER (\n"
            f"           PARTITION BY dt ORDER BY run_id DESC\n"
            f"         ) AS _run_rank\n"
            f"  FROM {database}.{dataset_id}\n"
            f") t\n"
            f"WHERE t._run_rank = 1"
        )
        try:
            _run_ddl(athena, view_sql, database, workgroup, label=f"CREATE VIEW {view_name}")
            print(f"  [ok]  {database}.{view_name}")
        except RuntimeError as exc:
            print(f"  [FAIL]  {view_name}: {exc}")
            failures.append((f"create_view_{dataset_id}", str(exc)))

    # ================================================================
    # Phase 9: Final verification  (COUNT + LIMIT 3 sample per dataset)
    # ================================================================
    _section(9, "Final verification via views  (COUNT(*) for full month + LIMIT 3 sample)")
    verify_dt_start = "2024-11-01"
    verify_dt_end   = "2024-11-30"
    for dataset_id in datasets:
        view_name = f"v_latest_{dataset_id}"
        print(f"\n  [{dataset_id}]")

        sql_count = (
            f"SELECT COUNT(*) AS cnt "
            f"FROM {database}.{view_name} "
            f"WHERE dt BETWEEN '{verify_dt_start}' AND '{verify_dt_end}'"
        )
        try:
            count_rows = _run_select(athena, sql_count, database, workgroup)
            count = count_rows[1][0] if len(count_rows) > 1 else "?"
            ok = int(count) > 0 if count.isdigit() else False
            print(f"    COUNT(*) = {count}  {'✓' if ok else 'WARN: 0 rows'}")
        except RuntimeError as exc:
            print(f"    COUNT FAILED: {exc}")
            failures.append((f"verify_count_{dataset_id}", str(exc)))
            continue

        sql_sample = (
            f"SELECT * "
            f"FROM {database}.{view_name} "
            f"WHERE dt = '2024-11-29' "
            f"LIMIT 3"
        )
        try:
            sample_rows = _run_select(athena, sql_sample, database, workgroup)
            _print_table(sample_rows)
        except RuntimeError as exc:
            print(f"    SAMPLE FAILED: {exc}")
            failures.append((f"verify_sample_{dataset_id}", str(exc)))

    # ================================================================
    # Summary
    # ================================================================
    print(f"\n{'=' * 66}")
    if not failures:
        print("  PIPELINE SUCCEEDED.")
        print(f"  {len(all_dates)} days × {len(datasets)} datasets seeded.  run_id={run_id}")
    else:
        print(f"  PIPELINE FINISHED WITH {len(failures)} ERROR(S):")
        for step, msg in failures:
            print(f"    [{step}]  {msg.splitlines()[0][:90]}")
        sys.exit(1)
    print(f"{'=' * 66}")


# ---------------------------------------------------------------------------
# Test questions  (printed after local generation)
# ---------------------------------------------------------------------------

_TEST_QUESTIONS = """\

======================================================================
  Test Questions -- November 2024 Mock Data
======================================================================
  Ask these to the Bedrock Agent at the orchestrator Function URL.
  All questions assume 2024-11-01 ~ 2024-11-30 unless stated.

  1. "11\uc6d4 \uc804\uccb4 \uae30\uac04 \ucc44\ub110\ubcc4 \uc720\uc785 \uc138\uc158 \uc218\ub97c \ub0b4\ub9bc\ucc28\uc21c\uc73c\ub85c \uc54c\ub824\uc918"
     => Organic Search > Paid Search > Paid Social > Direct > Referral > Email

  2. "11\uc6d4 \ubbf8\ub514\uc5b4 \uc18c\uc2a4\ubcc4 \ucd1d \uc124\uce58 \uac74\uc218\ub97c \ubcf4\uc5ec\uc918"
     => Organic >> Google Ads > Facebook Ads > TikTok Ads

  3. "11\uc6d4 29\uc77c \ube14\ub799\ud504\ub77c\uc774\ub370\uc774\uc5d0 \ucc44\ub110\ubcc4 \uc138\uc158 \uc218\ub294 \uc5bc\ub9c8\uc600\uc5b4?"
     => \uc77c\ubc18 \uae08\uc694\uc77c \ub300\ube44 \uc57d 3\ubc30 spike \ud655\uc778

  4. "11\uc6d4 \uc804\ubc18(1~15\uc77c) vs \ud6c4\ubc18(16~30\uc77c) Organic Search \uc138\uc158\uacfc \uc804\ud658 \uc218\ub97c \ube44\uad50\ud574\uc918"
     => computeDelta \uc0ac\uc6a9 -- \ud6c4\ubc18\uc774 BF \ud6a8\uacfc\ub85c \ub192\uc74c

  5. "Facebook Ads \ub450 \uce90\uc2dc\ud398\uc778(hyper_ua_nov24, hyper_retarget_nov24) \uc911
     11\uc6d4 \uc124\uce58\uac00 \ub354 \ub9ce\uc740 \uce90\uc2dc\ud398\uc778\uc740?"
     => hyper_ua_nov24 (base 15/day) > hyper_retarget_nov24 (base 8/day)

  6. "11\uc6d4 \ud55c \ub2ec \ub3d9\uc548 purchase \uc774\ubca4\ud2b8\uac00 \uac00\uc7a5 \ub9ce\uc774 \ubc1c\uc0dd\ud55c \ubbf8\ub514\uc5b4 \uc18c\uc2a4\ub294?"
     => Organic\uc774 installs \uac00\uc7a5 \ub9ce\uc544 \uc774\ubca4\ud2b8\ub3c4 \ucd5c\ub2e4

  7. "11\uc6d4 Google Ads\uc758 \uc2e0\uaddc \uc124\uce58(store_reinstall != 'true')\uc640 \uc7ac\uc124\uce58 \uac74\uc218\ub97c \ub530\ub85c \ubcf4\uc5ec\uc918"
     => store_reinstall \ud544\ud130 \ud65c\uc6a9 -- \uc7ac\uc124\uce58 \uc57d 15%

  8. "11\uc6d4 \ucc44\ub110\ubcc4 engagement_rate\ub97c \ub192\uc740 \uc21c\uc73c\ub85c \ubcf4\uc5ec\uc918"
     => Direct > Email > Organic Search > Referral > Paid Search > Paid Social
======================================================================
"""


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------


def main() -> None:
    # Ensure UTF-8 output on Windows consoles that default to cp949
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(
        description="Generate November 2024 mock data and seed the raw→curated pipeline.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--local-only",
        action="store_true",
        help="Only generate local JSONL.GZ files. Skip all AWS operations.",
    )
    parser.add_argument(
        "--skip-upload",
        action="store_true",
        help="Skip S3 upload (assume raw files already in S3 from a previous run).",
    )
    parser.add_argument(
        "--skip-create-raw-tables",
        action="store_true",
        help="Skip CREATE EXTERNAL TABLE for raw tables (already exist).",
    )
    parser.add_argument(
        "--skip-create-curated-tables",
        action="store_true",
        help="Skip CREATE EXTERNAL TABLE for curated tables (already exist).",
    )
    parser.add_argument(
        "--out-dir",
        default=str(Path(__file__).parent.parent / "tmp" / "mock_raw_nov2024"),
        help="Local directory for generated JSONL.GZ files.",
    )
    args = parser.parse_args()

    out_dir = Path(args.out_dir)

    # Phase 1: Generate local files
    file_map = generate_local(out_dir)

    print(_TEST_QUESTIONS)

    if args.local_only:
        print("--local-only: skipping AWS pipeline.")
        return

    # Guard against wrong environment
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
    )


if __name__ == "__main__":
    main()
