from __future__ import annotations

import importlib.util
from pathlib import Path


def _load_module(module_file: str, module_name: str):
    module_path = Path(__file__).resolve().parents[1] / "mock_generators" / module_file
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    module = importlib.util.module_from_spec(spec)
    assert spec is not None and spec.loader is not None
    spec.loader.exec_module(module)
    return module


def _load_ga4_module():
    return _load_module("ga4.py", "batch_lambda_ga4")


def _load_appsflyer_module():
    return _load_module("appsflyer.py", "batch_lambda_appsflyer")


def test_generate_acquisition_schema():
    ga4 = _load_ga4_module()
    rows = ga4.generate_ga4_acquisition("2024-11-05")
    assert rows
    assert set(rows[0].keys()) == {
        "channel_group",
        "source",
        "medium",
        "sessions",
        "total_users",
        "conversions",
        "total_revenue",
        "dt",
    }


def test_generate_acquisition_row_count():
    ga4 = _load_ga4_module()
    rows = ga4.generate_ga4_acquisition("2024-11-05")
    assert len(rows) == 6


def test_generate_engagement_schema():
    ga4 = _load_ga4_module()
    rows = ga4.generate_ga4_engagement("2024-11-05")
    assert rows
    assert set(rows[0].keys()) == {
        "channel_group",
        "source",
        "medium",
        "engagement_rate",
        "bounce_rate",
        "dt",
    }


def test_generate_deterministic():
    ga4 = _load_ga4_module()
    date_str = "2024-11-05"
    first_acq = ga4.generate_ga4_acquisition(date_str)
    second_acq = ga4.generate_ga4_acquisition(date_str)
    first_eng = ga4.generate_ga4_engagement(date_str)
    second_eng = ga4.generate_ga4_engagement(date_str)
    assert first_acq == second_acq
    assert first_eng == second_eng


def test_generate_installs_schema():
    appsflyer = _load_appsflyer_module()
    rows = appsflyer.generate_appsflyer_installs("2024-11-05")
    assert rows
    assert set(rows[0].keys()) == {
        "media_source",
        "campaign",
        "store_reinstall",
        "installs",
        "dt",
    }


def test_generate_installs_row_count():
    appsflyer = _load_appsflyer_module()
    rows = appsflyer.generate_appsflyer_installs("2024-11-05")
    assert len(rows) == 20


def test_generate_installs_store_reinstall_values():
    appsflyer = _load_appsflyer_module()
    rows = appsflyer.generate_appsflyer_installs("2024-11-05")
    values = {row["store_reinstall"] for row in rows}
    assert values.issubset({"true", "false"})
    assert values


def test_generate_events_schema():
    appsflyer = _load_appsflyer_module()
    rows = appsflyer.generate_appsflyer_events("2024-11-05")
    assert rows
    assert set(rows[0].keys()) == {
        "media_source",
        "campaign",
        "event_name",
        "store_reinstall",
        "event_count",
        "event_revenue",
        "dt",
    }


def test_generate_events_row_count():
    appsflyer = _load_appsflyer_module()
    rows = appsflyer.generate_appsflyer_events("2024-11-05")
    assert len(rows) == 40


def test_generate_events_revenue_zero_for_non_purchase():
    appsflyer = _load_appsflyer_module()
    rows = appsflyer.generate_appsflyer_events("2024-11-05")
    non_purchase_rows = [row for row in rows if row["event_name"] != "purchase"]
    assert non_purchase_rows
    assert all(row["event_revenue"] == 0.0 for row in non_purchase_rows)

