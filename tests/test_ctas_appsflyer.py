"""Verify CTAS SQL for AppsFlyer datasets uses COUNT(*) GROUP BY (no pre-aggregation)."""
from __future__ import annotations

from report_system.infrastructure.athena.ctas import build_ctas_sql


def _sql(dataset_id: str) -> str:
    sql, _ = build_ctas_sql(
        dataset_id=dataset_id,
        dt="2024-01-01",
        database="test_db",
        curated_bucket="test-bucket",
    )
    return sql.upper()


def test_installs_uses_count_star():
    sql = _sql("appsflyer_installs_daily")
    assert "COUNT(*)" in sql
    assert "GROUP BY" in sql


def test_installs_has_store_reinstall():
    sql = _sql("appsflyer_installs_daily")
    assert "STORE_REINSTALL" in sql


def test_installs_has_additional_fields():
    sql = _sql("appsflyer_installs_daily")
    for col in ["KEYWORD", "ADSET", "AD", "CHANNEL", "APP_VERSION", "CAMPAIGN_TYPE", "MATCH_TYPE"]:
        assert col in sql, f"Missing column {col} in installs CTAS SQL"


def test_installs_no_is_organic():
    """is_organic was removed; store_reinstall is the guardrail now."""
    sql = _sql("appsflyer_installs_daily")
    assert "IS_ORGANIC" not in sql


def test_events_uses_count_star_and_sum():
    sql = _sql("appsflyer_events_daily")
    assert "COUNT(*)" in sql
    assert "SUM(" in sql
    assert "GROUP BY" in sql


def test_events_has_event_revenue():
    sql = _sql("appsflyer_events_daily")
    assert "EVENT_REVENUE" in sql


def test_events_has_all_dimensions():
    sql = _sql("appsflyer_events_daily")
    for col in ["MEDIA_SOURCE", "CAMPAIGN", "EVENT_NAME", "KEYWORD", "ADSET",
                "AD", "CHANNEL", "APP_VERSION", "CAMPAIGN_TYPE", "MATCH_TYPE", "STORE_REINSTALL"]:
        assert col in sql, f"Missing column {col} in events CTAS SQL"
