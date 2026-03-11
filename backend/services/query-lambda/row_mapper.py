from __future__ import annotations

from itertools import zip_longest
from typing import Any

_INT_TYPES = frozenset({"bigint", "int", "integer", "smallint", "tinyint"})
_FLOAT_TYPES = frozenset({"double", "float", "decimal"})
_DENIED_COLUMNS = frozenset({"_run_rank", "run_id"})


def map_result_set(
    result_set: dict[str, Any],
    max_rows: int,
) -> tuple[list[dict[str, int | float | str | None]], bool]:
    """
    Maps a merged ResultSet dict (header already stripped) to typed rows.

    Rules (CONTRACTS.md §6):
    - First max_rows rows only.
    - BIGINT/INT/INTEGER/SMALLINT/TINYINT → int
    - DOUBLE/FLOAT/DECIMAL → float
    - Everything else (VARCHAR, CHAR, STRING, DATE, unknown) → str
    - _run_rank and run_id columns are stripped unconditionally.
    - store_reinstall stays str (it has type VARCHAR in Athena).
    - truncated = True iff len(rows) == max_rows (contract rule).
    """
    column_info = result_set["ResultSetMetadata"]["ColumnInfo"]
    columns: list[tuple[str, str]] = [
        (ci["Name"], ci["Type"].lower()) for ci in column_info
    ]
    raw_rows: list[dict] = result_set["Rows"][:max_rows]

    rows: list[dict[str, int | float | str | None]] = []
    for raw_row in raw_rows:
        record: dict[str, int | float | str | None] = {}
        for column, cell in zip_longest(columns, raw_row.get("Data", []), fillvalue=None):
            if column is None:
                break
            name, col_type = column
            if name in _DENIED_COLUMNS:
                continue
            raw_value = cell.get("VarCharValue") if isinstance(cell, dict) else None
            record[name] = _coerce(raw_value, col_type)
        rows.append(record)

    truncated: bool = len(rows) == max_rows
    return rows, truncated


def _coerce(value: str | None, col_type: str) -> int | float | str | None:
    if value is None:
        return None
    if col_type in _INT_TYPES:
        return int(value)
    if col_type in _FLOAT_TYPES:
        return float(value)
    return value
