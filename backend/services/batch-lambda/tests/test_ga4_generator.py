from __future__ import annotations

import importlib.util
from pathlib import Path


def _load_ga4_module():
    module_path = (
        Path(__file__).resolve().parents[1] / "mock_generators" / "ga4.py"
    )
    spec = importlib.util.spec_from_file_location("batch_lambda_ga4", module_path)
    module = importlib.util.module_from_spec(spec)
    assert spec is not None and spec.loader is not None
    spec.loader.exec_module(module)
    return module


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

