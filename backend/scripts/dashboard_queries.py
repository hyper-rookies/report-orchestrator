from __future__ import annotations

import re

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _validate_date(value: str) -> str:
    if not _DATE_RE.match(value):
        raise ValueError(f"Invalid date format: {value!r}. Expected YYYY-MM-DD.")
    return value


DASHBOARD_QUERIES: dict[str, dict] = {
    "sessions": {
        "view": "v_latest_ga4_acquisition_daily",
        "select": "channel_group, SUM(sessions) AS sessions, SUM(conversions) AS conversions",
        "group_by": "1",
        "order_by": "sessions DESC",
    },
    "installs": {
        "view": "v_latest_appsflyer_installs_daily",
        "select": "media_source, SUM(installs) AS installs",
        "group_by": "1",
        "order_by": "installs DESC",
    },
    "engagement": {
        "view": "v_latest_ga4_engagement_daily",
        "select": "channel_group, AVG(engagement_rate) AS engagement_rate",
        "group_by": "1",
        "order_by": "engagement_rate DESC",
    },
    "trend_sessions": {
        "view": "v_latest_ga4_acquisition_daily",
        "select": "dt, SUM(sessions) AS sessions",
        "group_by": "1",
        "order_by": "dt ASC",
    },
    "trend_installs": {
        "view": "v_latest_appsflyer_installs_daily",
        "select": "dt, SUM(installs) AS installs",
        "group_by": "1",
        "order_by": "dt ASC",
    },
    "channel_revenue": {
        "view": "v_latest_ga4_acquisition_daily",
        "select": "channel_group, SUM(total_revenue) AS total_revenue",
        "group_by": "1",
        "order_by": "total_revenue DESC",
    },
    "campaign_installs": {
        "view": "v_latest_appsflyer_installs_daily",
        "select": "campaign, SUM(installs) AS installs",
        "group_by": "1",
        "order_by": "installs DESC",
    },
    "install_funnel": {
        "view": "v_latest_appsflyer_events_daily",
        "select": "event_name, SUM(event_count) AS event_count",
        "group_by": "1",
        "order_by": "event_count DESC",
    },
    "retention": {
        "view": "v_latest_appsflyer_cohort_daily",
        "select": "cohort_day, SUM(retained_users) AS retained_users, SUM(cohort_size) AS cohort_size",
        "group_by": "1",
        "order_by": "cohort_day ASC",
    },
}


def build_dashboard_sql(key: str, database: str, start: str, end: str) -> str:
    _validate_date(start)
    _validate_date(end)
    q = DASHBOARD_QUERIES[key]
    return (
        f"SELECT {q['select']} "
        f"FROM {database}.{q['view']} "
        f"WHERE dt BETWEEN '{start}' AND '{end}' "
        f"GROUP BY {q['group_by']} "
        f"ORDER BY {q['order_by']} "
        f"LIMIT 500"
    )
