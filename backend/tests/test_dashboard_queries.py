import pytest
from scripts.dashboard_queries import DASHBOARD_QUERIES, build_dashboard_sql

DATABASE = "hyper_intern_m1c"
START = "2024-11-22"
END = "2024-11-28"


def test_all_nine_query_keys_defined():
    expected_keys = {
        "sessions",
        "installs",
        "engagement",
        "trend_sessions",
        "trend_installs",
        "channel_revenue",
        "campaign_installs",
        "install_funnel",
        "retention",
    }
    assert set(DASHBOARD_QUERIES.keys()) == expected_keys


def test_sessions_sql_contains_conversions():
    sql = build_dashboard_sql("sessions", DATABASE, START, END)
    assert "SUM(sessions)" in sql
    assert "SUM(conversions)" in sql
    assert "v_latest_ga4_acquisition_daily" in sql
    assert f"dt BETWEEN '{START}' AND '{END}'" in sql
    assert "GROUP BY 1" in sql


def test_trend_sessions_order_by_dt_asc():
    sql = build_dashboard_sql("trend_sessions", DATABASE, START, END)
    assert "ORDER BY dt ASC" in sql


def test_trend_installs_order_by_dt_asc():
    sql = build_dashboard_sql("trend_installs", DATABASE, START, END)
    assert "ORDER BY dt ASC" in sql


def test_retention_has_cohort_size():
    sql = build_dashboard_sql("retention", DATABASE, START, END)
    assert "SUM(retained_users)" in sql
    assert "SUM(cohort_size)" in sql
    assert "ORDER BY cohort_day ASC" in sql


def test_install_funnel_groups_by_event_name():
    sql = build_dashboard_sql("install_funnel", DATABASE, START, END)
    assert "event_name" in sql
    assert "SUM(event_count)" in sql


def test_unknown_key_raises():
    with pytest.raises(KeyError):
        build_dashboard_sql("nonexistent", DATABASE, START, END)


def test_sql_injection_safe_dates():
    with pytest.raises(ValueError):
        build_dashboard_sql("sessions", DATABASE, "'; DROP TABLE foo; --", END)


def test_invalid_end_date_raises():
    with pytest.raises(ValueError):
        build_dashboard_sql("sessions", DATABASE, START, "2024/11/28")
