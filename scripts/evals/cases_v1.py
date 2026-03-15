from __future__ import annotations

import re
from typing import Any


Case = dict[str, Any]

TARGET_VIEWS: tuple[str, ...] = (
    "v_latest_ga4_acquisition_daily",
    "v_latest_ga4_engagement_daily",
    "v_latest_appsflyer_installs_daily",
    "v_latest_appsflyer_events_daily",
    "v_latest_appsflyer_cohort_daily",
)

IDENTIFIER_RE = re.compile(r"\b([A-Za-z_][A-Za-z0-9_]*)\b")


def _sql(
    view: str,
    projections: list[str],
    *,
    where: list[str] | None = None,
    group_by_count: int = 0,
    order_by: list[str] | None = None,
    limit: int | None = 20,
) -> str:
    lines = [
        f"SELECT {', '.join(projections)}",
        f"FROM {{database}}.{view}",
        "WHERE dt BETWEEN '{{start_date}}' AND '{{end_date}}'",
    ]
    for clause in where or []:
        lines.append(f"  AND {clause}")
    if group_by_count > 0:
        lines.append(f"GROUP BY {', '.join(str(index) for index in range(1, group_by_count + 1))}")
    if order_by:
        lines.append(f"ORDER BY {_buildsql_order_identifier(order_by, projections)} DESC")
    if limit is not None:
        lines.append(f"LIMIT {limit}")
    return "\n".join(lines)


def _buildsql_order_identifier(order_by: list[str], projections: list[str]) -> str:
    for clause in order_by:
        match = IDENTIFIER_RE.search(clause)
        if match:
            identifier = match.group(1)
            if identifier.upper() not in {"ASC", "DESC"}:
                return identifier

    for projection in projections:
        alias_match = re.search(r"\bAS\s+([A-Za-z_][A-Za-z0-9_]*)\b", projection, re.IGNORECASE)
        if alias_match:
            return alias_match.group(1)
        projection_text = projection.strip()
        if IDENTIFIER_RE.fullmatch(projection_text):
            return projection_text

    return "dt"


def _spec(
    key_columns: list[str],
    value_columns: list[str],
    *,
    float_tolerance: float = 0.0001,
) -> dict[str, Any]:
    return {
        "key_columns": key_columns,
        "value_columns": value_columns,
        "float_tolerance": float_tolerance,
    }


def _supported(
    *,
    case_id: str,
    question: str,
    view: str,
    intent: str,
    difficulty: str,
    date_mode: str,
    date_window: str,
    reference_query: str,
    compare_spec: dict[str, Any],
    expected_chart_type: str | None = None,
) -> Case:
    case: Case = {
        "id": case_id,
        "question": question,
        "expectation": "supported",
        "tags": {
            "view": view,
            "intent": intent,
            "difficulty": difficulty,
        },
        "date_mode": date_mode,
        "date_window": date_window,
        "reference_query": reference_query,
        "compare_spec": compare_spec,
    }
    if expected_chart_type:
        case["expected_chart_type"] = expected_chart_type
    return case


def _unsupported(
    *,
    case_id: str,
    question: str,
    view: str,
    difficulty: str,
    unsupported_category: str,
    allowed_error_codes: list[str] | None = None,
) -> Case:
    return {
        "id": case_id,
        "question": question,
        "expectation": "unsupported",
        "tags": {
            "view": view,
            "intent": "unsupported",
            "difficulty": difficulty,
        },
        "date_mode": "fixed_2024_11",
        "date_window": "month",
        "unsupported_category": unsupported_category,
        "allowed_error_codes": allowed_error_codes or ["UNSUPPORTED_METRIC"],
    }


def _sum_by_dimension(view: str, dimension: str, metric: str, *, where: list[str] | None = None) -> str:
    return _sql(
        view,
        [dimension, f"SUM({metric}) AS {metric}"],
        where=where,
        group_by_count=1,
        order_by=[f"{metric} DESC", "1 ASC"],
    )


def _avg_by_dimension(view: str, dimension: str, metric: str, *, where: list[str] | None = None) -> str:
    return _sql(
        view,
        [dimension, f"ROUND(AVG({metric}), 4) AS {metric}"],
        where=where,
        group_by_count=1,
        order_by=[f"{metric} DESC", "1 ASC"],
    )


def _sum_trend(view: str, metric: str, *, where: list[str] | None = None) -> str:
    return _sql(
        view,
        ["dt", f"SUM({metric}) AS {metric}"],
        where=where,
        group_by_count=1,
        order_by=["1 ASC"],
        limit=500,
    )


def _avg_trend(view: str, metric: str, *, where: list[str] | None = None) -> str:
    return _sql(
        view,
        ["dt", f"ROUND(AVG({metric}), 4) AS {metric}"],
        where=where,
        group_by_count=1,
        order_by=["1 ASC"],
        limit=500,
    )


def _pair_sum_by_dimension(
    view: str,
    dimension: str,
    metric_a: str,
    metric_b: str,
    *,
    where: list[str] | None = None,
) -> str:
    return _sql(
        view,
        [
            dimension,
            f"SUM({metric_a}) AS {metric_a}",
            f"SUM({metric_b}) AS {metric_b}",
        ],
        where=where,
        group_by_count=1,
        order_by=[f"{metric_a} DESC", f"{metric_b} DESC", "1 ASC"],
    )


def _pair_avg_by_dimension(
    view: str,
    dimension: str,
    metric_a: str,
    metric_b: str,
    *,
    where: list[str] | None = None,
) -> str:
    return _sql(
        view,
        [
            dimension,
            f"ROUND(AVG({metric_a}), 4) AS {metric_a}",
            f"ROUND(AVG({metric_b}), 4) AS {metric_b}",
        ],
        where=where,
        group_by_count=1,
        order_by=[f"{metric_a} DESC", "1 ASC"],
    )


def _single_day_sum(
    view: str,
    metric: str,
    *,
    where: list[str] | None = None,
) -> str:
    return _sql(
        view,
        ["dt", f"SUM({metric}) AS {metric}"],
        where=["dt = '{{end_date}}'", *(where or [])],
        group_by_count=1,
        order_by=["1 DESC"],
        limit=1,
    )


def _single_day_avg(
    view: str,
    metric: str,
    *,
    where: list[str] | None = None,
) -> str:
    return _sql(
        view,
        ["dt", f"ROUND(AVG({metric}), 4) AS {metric}"],
        where=["dt = '{{end_date}}'", *(where or [])],
        group_by_count=1,
        order_by=["1 DESC"],
        limit=1,
    )


def _retention_by_dimension(
    dimension: str,
    *,
    where: list[str] | None = None,
) -> str:
    return _sql(
        "v_latest_appsflyer_cohort_daily",
        [
            dimension,
            "ROUND(SUM(retained_users) * 1.0 / NULLIF(SUM(cohort_size), 0), 4) AS retention_rate",
        ],
        where=where,
        group_by_count=1,
        order_by=["retention_rate DESC", "1 ASC"],
    )


def _retention_trend(
    dimension: str,
    *,
    where: list[str] | None = None,
) -> str:
    return _sql(
        "v_latest_appsflyer_cohort_daily",
        [
            dimension,
            "ROUND(SUM(retained_users) * 1.0 / NULLIF(SUM(cohort_size), 0), 4) AS retention_rate",
        ],
        where=where,
        group_by_count=1,
        order_by=["1 ASC"],
        limit=500,
    )


def _installs_new_like_by_dimension(dimension: str) -> str:
    return _sql(
        "v_latest_appsflyer_installs_daily",
        [dimension, "SUM(installs) AS installs_new_like"],
        where=["store_reinstall != 'true'"],
        group_by_count=1,
        order_by=["installs_new_like DESC", "1 ASC"],
    )


GA4_ACQUISITION_CASES: list[Case] = [
    _supported(
        case_id="GA4A-01",
        question="2024년 11월 채널 그룹별 세션 수를 막대차트로 보여줘",
        view="v_latest_ga4_acquisition_daily",
        intent="ranking",
        difficulty="easy",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_sum_by_dimension("v_latest_ga4_acquisition_daily", "channel_group", "sessions"),
        compare_spec=_spec(["channel_group"], ["sessions"]),
        expected_chart_type="bar",
    ),
    _supported(
        case_id="GA4A-02",
        question="2024년 11월 채널 그룹별 세션 비중을 파이차트로 보여줘",
        view="v_latest_ga4_acquisition_daily",
        intent="share_composition",
        difficulty="easy",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_sum_by_dimension("v_latest_ga4_acquisition_daily", "channel_group", "sessions"),
        compare_spec=_spec(["channel_group"], ["sessions"]),
        expected_chart_type="pie",
    ),
    _supported(
        case_id="GA4A-03",
        question="최근 4주간 전체 세션 추이를 보여줘",
        view="v_latest_ga4_acquisition_daily",
        intent="time_series",
        difficulty="easy",
        date_mode="latest_available",
        date_window="last_28_days",
        reference_query=_sum_trend("v_latest_ga4_acquisition_daily", "sessions"),
        compare_spec=_spec(["dt"], ["sessions"]),
        expected_chart_type="line",
    ),
    _supported(
        case_id="GA4A-04",
        question="2024년 11월 소스별 총매출을 표로 보여줘",
        view="v_latest_ga4_acquisition_daily",
        intent="ranking",
        difficulty="medium",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_sum_by_dimension("v_latest_ga4_acquisition_daily", "source", "total_revenue"),
        compare_spec=_spec(["source"], ["total_revenue"]),
        expected_chart_type="table",
    ),
    _supported(
        case_id="GA4A-05",
        question="2024년 11월 매체별 세션 수와 총 사용자 수 구성을 보여줘",
        view="v_latest_ga4_acquisition_daily",
        intent="comparison",
        difficulty="medium",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_pair_sum_by_dimension(
            "v_latest_ga4_acquisition_daily",
            "medium",
            "sessions",
            "total_users",
        ),
        compare_spec=_spec(["medium"], ["sessions", "total_users"]),
        expected_chart_type="stackedBar",
    ),
    _supported(
        case_id="GA4A-06",
        question="2024년 11월 30일 전체 세션 수를 보여줘",
        view="v_latest_ga4_acquisition_daily",
        intent="single_kpi",
        difficulty="easy",
        date_mode="fixed_2024_11",
        date_window="single_day",
        reference_query=_single_day_sum("v_latest_ga4_acquisition_daily", "sessions"),
        compare_spec=_spec(["dt"], ["sessions"]),
    ),
    _supported(
        case_id="GA4A-07",
        question="최근 7일 소스별 전환 수를 비교해줘",
        view="v_latest_ga4_acquisition_daily",
        intent="comparison",
        difficulty="medium",
        date_mode="latest_available",
        date_window="last_7_days",
        reference_query=_sum_by_dimension("v_latest_ga4_acquisition_daily", "source", "conversions"),
        compare_spec=_spec(["source"], ["conversions"]),
    ),
    _supported(
        case_id="GA4A-08",
        question="최근 7일 매체별 총매출 비중을 보여줘",
        view="v_latest_ga4_acquisition_daily",
        intent="share_composition",
        difficulty="medium",
        date_mode="latest_available",
        date_window="last_7_days",
        reference_query=_sum_by_dimension("v_latest_ga4_acquisition_daily", "medium", "total_revenue"),
        compare_spec=_spec(["medium"], ["total_revenue"]),
        expected_chart_type="pie",
    ),
    _supported(
        case_id="GA4A-09",
        question="2024년 11월 채널 그룹별 전환 수를 보여줘",
        view="v_latest_ga4_acquisition_daily",
        intent="ranking",
        difficulty="easy",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_sum_by_dimension("v_latest_ga4_acquisition_daily", "channel_group", "conversions"),
        compare_spec=_spec(["channel_group"], ["conversions"]),
    ),
    _supported(
        case_id="GA4A-10",
        question="지난주 소스별 세션 비중을 파이차트로 보여줘",
        view="v_latest_ga4_acquisition_daily",
        intent="share_composition",
        difficulty="medium",
        date_mode="latest_available",
        date_window="last_7_days",
        reference_query=_sum_by_dimension("v_latest_ga4_acquisition_daily", "source", "sessions"),
        compare_spec=_spec(["source"], ["sessions"]),
        expected_chart_type="pie",
    ),
    _supported(
        case_id="GA4A-11",
        question="지난주 소스별 세션 구성을 보여줘",
        view="v_latest_ga4_acquisition_daily",
        intent="composition",
        difficulty="medium",
        date_mode="latest_available",
        date_window="last_7_days",
        reference_query=_sum_by_dimension(
            "v_latest_ga4_acquisition_daily",
            "source",
            "sessions",
        ),
        compare_spec=_spec(["source"], ["sessions"]),
        expected_chart_type="bar",
    ),
    _supported(
        case_id="GA4A-12",
        question="2024년 11월 소스별 총 사용자 수를 보여줘",
        view="v_latest_ga4_acquisition_daily",
        intent="ranking",
        difficulty="easy",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_sum_by_dimension("v_latest_ga4_acquisition_daily", "source", "total_users"),
        compare_spec=_spec(["source"], ["total_users"]),
    ),
]

GA4_ENGAGEMENT_CASES: list[Case] = [
    _supported(
        case_id="GA4E-01",
        question="2024년 11월 채널 그룹별 평균 참여율을 막대차트로 보여줘",
        view="v_latest_ga4_engagement_daily",
        intent="ranking",
        difficulty="easy",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_avg_by_dimension("v_latest_ga4_engagement_daily", "channel_group", "engagement_rate"),
        compare_spec=_spec(["channel_group"], ["engagement_rate"]),
        expected_chart_type="bar",
    ),
    _supported(
        case_id="GA4E-02",
        question="2024년 11월 채널 그룹별 평균 이탈률을 막대차트로 보여줘",
        view="v_latest_ga4_engagement_daily",
        intent="ranking",
        difficulty="easy",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_avg_by_dimension("v_latest_ga4_engagement_daily", "channel_group", "bounce_rate"),
        compare_spec=_spec(["channel_group"], ["bounce_rate"]),
        expected_chart_type="bar",
    ),
    _supported(
        case_id="GA4E-03",
        question="2024년 11월 일자별 평균 참여율 추이를 라인차트로 보여줘",
        view="v_latest_ga4_engagement_daily",
        intent="time_series",
        difficulty="easy",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_avg_trend("v_latest_ga4_engagement_daily", "engagement_rate"),
        compare_spec=_spec(["dt"], ["engagement_rate"]),
        expected_chart_type="line",
    ),
    _supported(
        case_id="GA4E-04",
        question="2024년 11월 일자별 평균 이탈률 추이를 라인차트로 보여줘",
        view="v_latest_ga4_engagement_daily",
        intent="time_series",
        difficulty="easy",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_avg_trend("v_latest_ga4_engagement_daily", "bounce_rate"),
        compare_spec=_spec(["dt"], ["bounce_rate"]),
        expected_chart_type="line",
    ),
    _supported(
        case_id="GA4E-05",
        question="2024년 11월 소스별 평균 참여율을 표로 보여줘",
        view="v_latest_ga4_engagement_daily",
        intent="ranking",
        difficulty="medium",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_avg_by_dimension("v_latest_ga4_engagement_daily", "source", "engagement_rate"),
        compare_spec=_spec(["source"], ["engagement_rate"]),
        expected_chart_type="table",
    ),
    _supported(
        case_id="GA4E-06",
        question="2024년 11월 매체별 평균 이탈률을 표로 보여줘",
        view="v_latest_ga4_engagement_daily",
        intent="ranking",
        difficulty="medium",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_avg_by_dimension("v_latest_ga4_engagement_daily", "medium", "bounce_rate"),
        compare_spec=_spec(["medium"], ["bounce_rate"]),
        expected_chart_type="table",
    ),
    _supported(
        case_id="GA4E-07",
        question="2024년 11월 채널 그룹별 평균 참여율과 평균 이탈률을 비교해줘",
        view="v_latest_ga4_engagement_daily",
        intent="comparison",
        difficulty="medium",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_pair_avg_by_dimension(
            "v_latest_ga4_engagement_daily",
            "channel_group",
            "engagement_rate",
            "bounce_rate",
        ),
        compare_spec=_spec(["channel_group"], ["engagement_rate", "bounce_rate"]),
    ),
    _supported(
        case_id="GA4E-08",
        question="최근 집계일 평균 참여율을 보여줘",
        view="v_latest_ga4_engagement_daily",
        intent="single_kpi",
        difficulty="easy",
        date_mode="latest_available",
        date_window="single_day",
        reference_query=_single_day_avg("v_latest_ga4_engagement_daily", "engagement_rate"),
        compare_spec=_spec(["dt"], ["engagement_rate"]),
    ),
    _supported(
        case_id="GA4E-09",
        question="최근 7일 소스별 평균 참여율을 비교해줘",
        view="v_latest_ga4_engagement_daily",
        intent="comparison",
        difficulty="medium",
        date_mode="latest_available",
        date_window="last_7_days",
        reference_query=_avg_by_dimension("v_latest_ga4_engagement_daily", "source", "engagement_rate"),
        compare_spec=_spec(["source"], ["engagement_rate"]),
    ),
    _supported(
        case_id="GA4E-10",
        question="최근 7일 매체별 평균 이탈률을 비교해줘",
        view="v_latest_ga4_engagement_daily",
        intent="comparison",
        difficulty="medium",
        date_mode="latest_available",
        date_window="last_7_days",
        reference_query=_avg_by_dimension("v_latest_ga4_engagement_daily", "medium", "bounce_rate"),
        compare_spec=_spec(["medium"], ["bounce_rate"]),
    ),
    _supported(
        case_id="GA4E-11",
        question="2024년 11월 소스별 평균 참여율과 평균 이탈률을 표로 보여줘",
        view="v_latest_ga4_engagement_daily",
        intent="comparison",
        difficulty="medium",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_pair_avg_by_dimension(
            "v_latest_ga4_engagement_daily",
            "source",
            "engagement_rate",
            "bounce_rate",
        ),
        compare_spec=_spec(["source"], ["engagement_rate", "bounce_rate"]),
        expected_chart_type="table",
    ),
    _supported(
        case_id="GA4E-12",
        question="최근 4주 채널 그룹별 평균 참여율 순위를 보여줘",
        view="v_latest_ga4_engagement_daily",
        intent="ranking",
        difficulty="medium",
        date_mode="latest_available",
        date_window="last_28_days",
        reference_query=_avg_by_dimension("v_latest_ga4_engagement_daily", "channel_group", "engagement_rate"),
        compare_spec=_spec(["channel_group"], ["engagement_rate"]),
    ),
]
APPSFLYER_INSTALL_CASES: list[Case] = [
    _supported(
        case_id="AFI-01",
        question="2024년 11월 매체 소스별 설치 수를 막대차트로 보여줘",
        view="v_latest_appsflyer_installs_daily",
        intent="ranking",
        difficulty="easy",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_sum_by_dimension("v_latest_appsflyer_installs_daily", "media_source", "installs"),
        compare_spec=_spec(["media_source"], ["installs"]),
        expected_chart_type="bar",
    ),
    _supported(
        case_id="AFI-02",
        question="2024년 11월 매체 소스별 설치 비중을 파이차트로 보여줘",
        view="v_latest_appsflyer_installs_daily",
        intent="share_composition",
        difficulty="easy",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_sum_by_dimension("v_latest_appsflyer_installs_daily", "media_source", "installs"),
        compare_spec=_spec(["media_source"], ["installs"]),
        expected_chart_type="pie",
    ),
    _supported(
        case_id="AFI-03",
        question="2024년 11월 일자별 전체 설치 추이를 라인차트로 보여줘",
        view="v_latest_appsflyer_installs_daily",
        intent="time_series",
        difficulty="easy",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_sum_trend("v_latest_appsflyer_installs_daily", "installs"),
        compare_spec=_spec(["dt"], ["installs"]),
        expected_chart_type="line",
    ),
    _supported(
        case_id="AFI-04",
        question="2024년 11월 캠페인별 설치 수를 표로 보여줘",
        view="v_latest_appsflyer_installs_daily",
        intent="ranking",
        difficulty="medium",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_sum_by_dimension("v_latest_appsflyer_installs_daily", "campaign", "installs"),
        compare_spec=_spec(["campaign"], ["installs"]),
        expected_chart_type="table",
    ),
    _supported(
        case_id="AFI-05",
        question="2024년 11월 재설치 여부별 설치 수를 보여줘",
        view="v_latest_appsflyer_installs_daily",
        intent="comparison",
        difficulty="easy",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_sum_by_dimension("v_latest_appsflyer_installs_daily", "store_reinstall", "installs"),
        compare_spec=_spec(["store_reinstall"], ["installs"]),
    ),
    _supported(
        case_id="AFI-06",
        question="2024년 11월 30일 전체 설치 수를 보여줘",
        view="v_latest_appsflyer_installs_daily",
        intent="single_kpi",
        difficulty="easy",
        date_mode="fixed_2024_11",
        date_window="single_day",
        reference_query=_single_day_sum("v_latest_appsflyer_installs_daily", "installs"),
        compare_spec=_spec(["dt"], ["installs"]),
    ),
    _supported(
        case_id="AFI-07",
        question="최근 7일 매체 소스별 설치 수를 비교해줘",
        view="v_latest_appsflyer_installs_daily",
        intent="comparison",
        difficulty="medium",
        date_mode="latest_available",
        date_window="last_7_days",
        reference_query=_sum_by_dimension("v_latest_appsflyer_installs_daily", "media_source", "installs"),
        compare_spec=_spec(["media_source"], ["installs"]),
    ),
    _supported(
        case_id="AFI-08",
        question="최근 7일 매체 소스별 설치 비중을 보여줘",
        view="v_latest_appsflyer_installs_daily",
        intent="share_composition",
        difficulty="medium",
        date_mode="latest_available",
        date_window="last_7_days",
        reference_query=_sum_by_dimension("v_latest_appsflyer_installs_daily", "media_source", "installs"),
        compare_spec=_spec(["media_source"], ["installs"]),
        expected_chart_type="pie",
    ),
    _supported(
        case_id="AFI-09",
        question="최근 7일 캠페인별 설치 수를 보여줘",
        view="v_latest_appsflyer_installs_daily",
        intent="ranking",
        difficulty="medium",
        date_mode="latest_available",
        date_window="last_7_days",
        reference_query=_sum_by_dimension("v_latest_appsflyer_installs_daily", "campaign", "installs"),
        compare_spec=_spec(["campaign"], ["installs"]),
    ),
    _supported(
        case_id="AFI-10",
        question="2024년 11월 재설치 여부별 설치 비중을 파이차트로 보여줘",
        view="v_latest_appsflyer_installs_daily",
        intent="share_composition",
        difficulty="easy",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_sum_by_dimension("v_latest_appsflyer_installs_daily", "store_reinstall", "installs"),
        compare_spec=_spec(["store_reinstall"], ["installs"]),
        expected_chart_type="pie",
    ),
    _supported(
        case_id="AFI-11",
        question="2024년 11월 매체 소스별 신규 유사 설치 수를 보여줘",
        view="v_latest_appsflyer_installs_daily",
        intent="ranking",
        difficulty="hard",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_installs_new_like_by_dimension("media_source"),
        compare_spec=_spec(["media_source"], ["installs_new_like"]),
    ),
    _supported(
        case_id="AFI-12",
        question="최근 집계일 Google Ads 설치 수를 보여줘",
        view="v_latest_appsflyer_installs_daily",
        intent="single_kpi",
        difficulty="medium",
        date_mode="latest_available",
        date_window="single_day",
        reference_query=_single_day_sum(
            "v_latest_appsflyer_installs_daily",
            "installs",
            where=["media_source = 'Google Ads'"],
        ),
        compare_spec=_spec(["dt"], ["installs"]),
    ),
]

APPSFLYER_EVENT_CASES: list[Case] = [
    _supported(
        case_id="AFE-01",
        question="2024년 11월 매체 소스별 구매 이벤트 수를 막대차트로 보여줘",
        view="v_latest_appsflyer_events_daily",
        intent="ranking",
        difficulty="medium",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_sum_by_dimension(
            "v_latest_appsflyer_events_daily",
            "media_source",
            "event_count",
            where=["event_name = 'purchase'"],
        ),
        compare_spec=_spec(["media_source"], ["event_count"]),
        expected_chart_type="bar",
    ),
    _supported(
        case_id="AFE-02",
        question="2024년 11월 매체 소스별 구매 매출을 막대차트로 보여줘",
        view="v_latest_appsflyer_events_daily",
        intent="ranking",
        difficulty="medium",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_sum_by_dimension(
            "v_latest_appsflyer_events_daily",
            "media_source",
            "event_revenue",
            where=["event_name = 'purchase'"],
        ),
        compare_spec=_spec(["media_source"], ["event_revenue"]),
        expected_chart_type="bar",
    ),
    _supported(
        case_id="AFE-03",
        question="2024년 11월 이벤트명별 이벤트 수를 보여줘",
        view="v_latest_appsflyer_events_daily",
        intent="ranking",
        difficulty="easy",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_sum_by_dimension("v_latest_appsflyer_events_daily", "event_name", "event_count"),
        compare_spec=_spec(["event_name"], ["event_count"]),
    ),
    _supported(
        case_id="AFE-04",
        question="2024년 11월 일자별 구매 이벤트 수 추이를 라인차트로 보여줘",
        view="v_latest_appsflyer_events_daily",
        intent="time_series",
        difficulty="medium",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_sum_trend(
            "v_latest_appsflyer_events_daily",
            "event_count",
            where=["event_name = 'purchase'"],
        ),
        compare_spec=_spec(["dt"], ["event_count"]),
        expected_chart_type="line",
    ),
    _supported(
        case_id="AFE-05",
        question="2024년 11월 일자별 구매 매출 추이를 라인차트로 보여줘",
        view="v_latest_appsflyer_events_daily",
        intent="time_series",
        difficulty="medium",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_sum_trend(
            "v_latest_appsflyer_events_daily",
            "event_revenue",
            where=["event_name = 'purchase'"],
        ),
        compare_spec=_spec(["dt"], ["event_revenue"]),
        expected_chart_type="line",
    ),
    _supported(
        case_id="AFE-06",
        question="2024년 11월 캠페인별 구매 매출을 표로 보여줘",
        view="v_latest_appsflyer_events_daily",
        intent="ranking",
        difficulty="medium",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_sum_by_dimension(
            "v_latest_appsflyer_events_daily",
            "campaign",
            "event_revenue",
            where=["event_name = 'purchase'"],
        ),
        compare_spec=_spec(["campaign"], ["event_revenue"]),
        expected_chart_type="table",
    ),
    _supported(
        case_id="AFE-07",
        question="2024년 11월 매체 소스별 구매 이벤트 비중을 파이차트로 보여줘",
        view="v_latest_appsflyer_events_daily",
        intent="share_composition",
        difficulty="medium",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_sum_by_dimension(
            "v_latest_appsflyer_events_daily",
            "media_source",
            "event_count",
            where=["event_name = 'purchase'"],
        ),
        compare_spec=_spec(["media_source"], ["event_count"]),
        expected_chart_type="pie",
    ),
    _supported(
        case_id="AFE-08",
        question="2024년 11월 매체 소스별 구매 이벤트 수와 구매 매출 구성을 보여줘",
        view="v_latest_appsflyer_events_daily",
        intent="comparison",
        difficulty="hard",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_pair_sum_by_dimension(
            "v_latest_appsflyer_events_daily",
            "media_source",
            "event_count",
            "event_revenue",
            where=["event_name = 'purchase'"],
        ),
        compare_spec=_spec(["media_source"], ["event_count", "event_revenue"]),
        expected_chart_type="stackedBar",
    ),
    _supported(
        case_id="AFE-09",
        question="2024년 11월 재설치 여부별 구매 이벤트 수를 표로 보여줘",
        view="v_latest_appsflyer_events_daily",
        intent="comparison",
        difficulty="medium",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_sum_by_dimension(
            "v_latest_appsflyer_events_daily",
            "store_reinstall",
            "event_count",
            where=["event_name = 'purchase'"],
        ),
        compare_spec=_spec(["store_reinstall"], ["event_count"]),
        expected_chart_type="table",
    ),
    _supported(
        case_id="AFE-10",
        question="최근 집계일 구매 이벤트 수를 보여줘",
        view="v_latest_appsflyer_events_daily",
        intent="single_kpi",
        difficulty="easy",
        date_mode="latest_available",
        date_window="single_day",
        reference_query=_single_day_sum(
            "v_latest_appsflyer_events_daily",
            "event_count",
            where=["event_name = 'purchase'"],
        ),
        compare_spec=_spec(["dt"], ["event_count"]),
    ),
    _supported(
        case_id="AFE-11",
        question="2024년 11월 이벤트명별 이벤트 매출을 표로 보여줘",
        view="v_latest_appsflyer_events_daily",
        intent="ranking",
        difficulty="medium",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_sum_by_dimension("v_latest_appsflyer_events_daily", "event_name", "event_revenue"),
        compare_spec=_spec(["event_name"], ["event_revenue"]),
        expected_chart_type="table",
    ),
    _supported(
        case_id="AFE-12",
        question="2024년 11월 매체 소스별 회원가입 이벤트 수를 보여줘",
        view="v_latest_appsflyer_events_daily",
        intent="ranking",
        difficulty="medium",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_sum_by_dimension(
            "v_latest_appsflyer_events_daily",
            "media_source",
            "event_count",
            where=["event_name = 'sign_up'"],
        ),
        compare_spec=_spec(["media_source"], ["event_count"]),
    ),
]
APPSFLYER_COHORT_CASES: list[Case] = [
    _supported(
        case_id="AFC-01",
        question="2024년 11월 매체 소스별 Day 7 리텐션율을 막대차트로 보여줘",
        view="v_latest_appsflyer_cohort_daily",
        intent="retention_cohort",
        difficulty="hard",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_retention_by_dimension("media_source", where=["cohort_day = 7"]),
        compare_spec=_spec(["media_source"], ["retention_rate"]),
        expected_chart_type="bar",
    ),
    _supported(
        case_id="AFC-02",
        question="2024년 11월 캠페인별 Day 7 리텐션율을 표로 보여줘",
        view="v_latest_appsflyer_cohort_daily",
        intent="retention_cohort",
        difficulty="hard",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_retention_by_dimension("campaign", where=["cohort_day = 7"]),
        compare_spec=_spec(["campaign"], ["retention_rate"]),
        expected_chart_type="table",
    ),
    _supported(
        case_id="AFC-03",
        question="2024년 11월 cohort_date별 retained users 추이를 보여줘",
        view="v_latest_appsflyer_cohort_daily",
        intent="time_series",
        difficulty="hard",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_sum_by_dimension("v_latest_appsflyer_cohort_daily", "cohort_date", "retained_users"),
        compare_spec=_spec(["cohort_date"], ["retained_users"]),
        expected_chart_type="line",
    ),
    _supported(
        case_id="AFC-04",
        question="2024년 11월 cohort_date별 cohort size 추이를 보여줘",
        view="v_latest_appsflyer_cohort_daily",
        intent="time_series",
        difficulty="hard",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_sum_by_dimension("v_latest_appsflyer_cohort_daily", "cohort_date", "cohort_size"),
        compare_spec=_spec(["cohort_date"], ["cohort_size"]),
        expected_chart_type="line",
    ),
    _supported(
        case_id="AFC-05",
        question="2024년 11월 매체 소스별 cohort size를 보여줘",
        view="v_latest_appsflyer_cohort_daily",
        intent="ranking",
        difficulty="medium",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_sum_by_dimension("v_latest_appsflyer_cohort_daily", "media_source", "cohort_size"),
        compare_spec=_spec(["media_source"], ["cohort_size"]),
    ),
    _supported(
        case_id="AFC-06",
        question="2024년 11월 매체 소스별 retained users를 보여줘",
        view="v_latest_appsflyer_cohort_daily",
        intent="ranking",
        difficulty="medium",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_sum_by_dimension("v_latest_appsflyer_cohort_daily", "media_source", "retained_users"),
        compare_spec=_spec(["media_source"], ["retained_users"]),
    ),
    _supported(
        case_id="AFC-07",
        question="2024년 11월 매체 소스별 Day 1 리텐션율을 보여줘",
        view="v_latest_appsflyer_cohort_daily",
        intent="retention_cohort",
        difficulty="hard",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_retention_by_dimension("media_source", where=["cohort_day = 1"]),
        compare_spec=_spec(["media_source"], ["retention_rate"]),
    ),
    _supported(
        case_id="AFC-08",
        question="2024년 11월 캠페인별 Day 30 리텐션율을 표로 보여줘",
        view="v_latest_appsflyer_cohort_daily",
        intent="retention_cohort",
        difficulty="hard",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_retention_by_dimension("campaign", where=["cohort_day = 30"]),
        compare_spec=_spec(["campaign"], ["retention_rate"]),
        expected_chart_type="table",
    ),
    _supported(
        case_id="AFC-09",
        question="2024년 11월 cohort day별 retained users 추이를 보여줘",
        view="v_latest_appsflyer_cohort_daily",
        intent="time_series",
        difficulty="hard",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_sum_by_dimension("v_latest_appsflyer_cohort_daily", "cohort_day", "retained_users"),
        compare_spec=_spec(["cohort_day"], ["retained_users"]),
        expected_chart_type="line",
    ),
    _supported(
        case_id="AFC-10",
        question="2024년 11월 cohort day별 리텐션율 추이를 보여줘",
        view="v_latest_appsflyer_cohort_daily",
        intent="retention_cohort",
        difficulty="hard",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_retention_trend("cohort_day"),
        compare_spec=_spec(["cohort_day"], ["retention_rate"]),
        expected_chart_type="line",
    ),
    _supported(
        case_id="AFC-11",
        question="2024년 11월 매체 소스별 retained users와 cohort size 구성을 보여줘",
        view="v_latest_appsflyer_cohort_daily",
        intent="comparison",
        difficulty="hard",
        date_mode="fixed_2024_11",
        date_window="month",
        reference_query=_pair_sum_by_dimension(
            "v_latest_appsflyer_cohort_daily",
            "media_source",
            "retained_users",
            "cohort_size",
        ),
        compare_spec=_spec(["media_source"], ["retained_users", "cohort_size"]),
        expected_chart_type="stackedBar",
    ),
    _supported(
        case_id="AFC-12",
        question="최근 집계일 Google Ads Day 7 리텐션율을 보여줘",
        view="v_latest_appsflyer_cohort_daily",
        intent="single_kpi",
        difficulty="hard",
        date_mode="latest_available",
        date_window="single_day",
        reference_query=_sql(
            "v_latest_appsflyer_cohort_daily",
            [
                "dt",
                "ROUND(SUM(retained_users) * 1.0 / NULLIF(SUM(cohort_size), 0), 4) AS retention_rate",
            ],
            where=[
                "dt = '{{end_date}}'",
                "media_source = 'Google Ads'",
                "cohort_day = 7",
            ],
            group_by_count=1,
            order_by=["1 DESC"],
            limit=1,
        ),
        compare_spec=_spec(["dt"], ["retention_rate"]),
    ),
]

UNSUPPORTED_CASES: list[Case] = [
    _unsupported(
        case_id="UNS-01",
        question="2024년 11월 Airbridge 소스별 설치 수를 보여줘",
        view="outside_scope",
        difficulty="easy",
        unsupported_category="airbridge",
    ),
    _unsupported(
        case_id="UNS-02",
        question="2024년 11월 Airbridge 채널별 세션 비중을 보여줘",
        view="outside_scope",
        difficulty="easy",
        unsupported_category="airbridge",
    ),
    _unsupported(
        case_id="UNS-03",
        question="지난주 OS별 설치 비중을 보여줘",
        view="v_latest_appsflyer_installs_daily",
        difficulty="easy",
        unsupported_category="os_platform",
    ),
    _unsupported(
        case_id="UNS-04",
        question="2024년 11월 platform별 구매 매출을 보여줘",
        view="v_latest_appsflyer_events_daily",
        difficulty="easy",
        unsupported_category="os_platform",
    ),
    _unsupported(
        case_id="UNS-05",
        question="2024년 11월 adset별 설치 수를 보여줘",
        view="v_latest_appsflyer_installs_daily",
        difficulty="medium",
        unsupported_category="phase_deferred_dimension",
    ),
    _unsupported(
        case_id="UNS-06",
        question="2024년 11월 keyword별 구매 매출을 보여줘",
        view="v_latest_appsflyer_events_daily",
        difficulty="medium",
        unsupported_category="phase_deferred_dimension",
    ),
    _unsupported(
        case_id="UNS-07",
        question="2024년 11월 app version별 설치 수를 보여줘",
        view="v_latest_appsflyer_installs_daily",
        difficulty="medium",
        unsupported_category="phase_deferred_dimension",
    ),
    _unsupported(
        case_id="UNS-08",
        question="2024년 11월 campaign type별 설치 수를 보여줘",
        view="v_latest_appsflyer_installs_daily",
        difficulty="medium",
        unsupported_category="phase_deferred_dimension",
    ),
    _unsupported(
        case_id="UNS-09",
        question="2024년 11월 match type별 구매 이벤트 수를 보여줘",
        view="v_latest_appsflyer_events_daily",
        difficulty="medium",
        unsupported_category="phase_deferred_dimension",
    ),
    _unsupported(
        case_id="UNS-10",
        question="2024년 11월 광고별 설치 수를 보여줘",
        view="v_latest_appsflyer_installs_daily",
        difficulty="medium",
        unsupported_category="phase_deferred_dimension",
    ),
    _unsupported(
        case_id="UNS-11",
        question="2024년 11월 channel별 구매 매출을 보여줘",
        view="v_latest_appsflyer_events_daily",
        difficulty="medium",
        unsupported_category="phase_deferred_dimension",
    ),
    _unsupported(
        case_id="UNS-12",
        question="2024년 11월 캠페인별 세션 수를 보여줘",
        view="v_latest_ga4_acquisition_daily",
        difficulty="medium",
        unsupported_category="missing_dimension",
    ),
    _unsupported(
        case_id="UNS-13",
        question="최근 180일 전체 세션 추이를 보여줘",
        view="v_latest_ga4_acquisition_daily",
        difficulty="easy",
        unsupported_category="lookback_over_90_days",
    ),
    _unsupported(
        case_id="UNS-14",
        question="최근 6개월 전체 설치 추이를 보여줘",
        view="v_latest_appsflyer_installs_daily",
        difficulty="easy",
        unsupported_category="lookback_over_90_days",
    ),
    _unsupported(
        case_id="UNS-15",
        question="최근 120일 Day 7 리텐션 추이를 보여줘",
        view="v_latest_appsflyer_cohort_daily",
        difficulty="medium",
        unsupported_category="lookback_over_90_days",
    ),
    _unsupported(
        case_id="UNS-16",
        question="2024년 11월 설치 원본 데이터를 100건 보여줘",
        view="v_latest_appsflyer_installs_daily",
        difficulty="easy",
        unsupported_category="raw_row_level",
    ),
    _unsupported(
        case_id="UNS-17",
        question="2024년 11월 사용자별 세션 목록을 보여줘",
        view="v_latest_ga4_acquisition_daily",
        difficulty="easy",
        unsupported_category="raw_row_level",
    ),
    _unsupported(
        case_id="UNS-18",
        question="2024년 11월 소스별 세션 대비 설치 전환율을 보여줘",
        view="cross_view",
        difficulty="hard",
        unsupported_category="cross_view_join",
    ),
    _unsupported(
        case_id="UNS-19",
        question="2024년 11월 소스별 GA4 세션 수와 AppsFlyer 설치 수를 한 표로 합쳐줘",
        view="cross_view",
        difficulty="hard",
        unsupported_category="cross_view_join",
    ),
    _unsupported(
        case_id="UNS-20",
        question="2024년 11월 매체 소스별 설치당 구매 매출을 보여줘",
        view="cross_view",
        difficulty="hard",
        unsupported_category="cross_view_join",
    ),
]

SUPPORTED_CASES: list[Case] = (
    GA4_ACQUISITION_CASES
    + GA4_ENGAGEMENT_CASES
    + APPSFLYER_INSTALL_CASES
    + APPSFLYER_EVENT_CASES
    + APPSFLYER_COHORT_CASES
)
ALL_CASES: list[Case] = SUPPORTED_CASES + UNSUPPORTED_CASES

assert len(GA4_ACQUISITION_CASES) == 12
assert len(GA4_ENGAGEMENT_CASES) == 12
assert len(APPSFLYER_INSTALL_CASES) == 12
assert len(APPSFLYER_EVENT_CASES) == 12
assert len(APPSFLYER_COHORT_CASES) == 12
assert len(SUPPORTED_CASES) == 60
assert len(UNSUPPORTED_CASES) == 20
assert len(ALL_CASES) == 80
