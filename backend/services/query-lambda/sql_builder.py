from __future__ import annotations

from typing import Any


def build_sql(validated_payload: dict[str, Any]) -> str:
    dimensions = validated_payload["dimensions"]
    metrics = validated_payload["metrics"]

    select_columns = list(dimensions) + [_aggregate_metric(metric) for metric in metrics]
    select_clause = ", ".join(select_columns)
    where_clauses = [
        (
            f"dt BETWEEN '{validated_payload['dateRange']['start']}' "
            f"AND '{validated_payload['dateRange']['end']}'"
        )
    ]

    for filter_item in validated_payload["filters"]:
        where_clauses.append(_build_filter_clause(filter_item))

    where_sql = " AND ".join(where_clauses)
    group_by_sql = f" GROUP BY {', '.join(str(idx + 1) for idx in range(len(dimensions)))}"
    order_by_sql = f" ORDER BY {metrics[0]} DESC"

    return (
        f"SELECT {select_clause} "
        f"FROM {validated_payload['database']}.{validated_payload['view']} "
        f"WHERE {where_sql}"
        f"{group_by_sql}"
        f"{order_by_sql} "
        f"LIMIT {validated_payload['limit']}"
    )


def _build_filter_clause(filter_item: dict[str, Any]) -> str:
    column = filter_item["column"]
    op = filter_item["op"]
    value = filter_item["value"]

    if op == "IN":
        values = ", ".join(_format_literal(item) for item in value)
        return f"{column} IN ({values})"
    return f"{column} {op} {_format_literal(value)}"


def _format_literal(value: Any) -> str:
    if isinstance(value, str):
        escaped = value.replace("'", "''")
        return f"'{escaped}'"
    return str(value)


def _aggregate_metric(metric: str) -> str:
    if metric.endswith("_rate"):
        return f"AVG({metric}) AS {metric}"
    return f"SUM({metric}) AS {metric}"
