from __future__ import annotations

from typing import Any


def build_sql(validated_payload: dict[str, Any]) -> str:
    select_columns = validated_payload["dimensions"] + validated_payload["metrics"]
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
    return (
        f"SELECT {select_clause} "
        f"FROM {validated_payload['database']}.{validated_payload['view']} "
        f"WHERE {where_sql} "
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
