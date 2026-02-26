"""Dataset-specific raw → curated transform functions.

Each function accepts a list of parsed JSON records (one dict per raw row)
plus the partition date string, and returns a pyarrow Table ready for
Parquet serialisation.

Raw rows always follow the serialiser layout::

    {"dimensions": {"fieldA": "val", ...}, "metrics": {"metricA": 123, ...}}

The REGISTRY maps every dataset_id to its source tag and transform callable
so callers can iterate without switch/case logic.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

import pyarrow as pa


# ---------------------------------------------------------------------------
# Type helpers
# ---------------------------------------------------------------------------


def _maybe_float(v: Any) -> float | None:
    return None if v is None else float(v)


def _maybe_int(v: Any) -> int | None:
    return None if v is None else int(v)


def _maybe_bool(v: Any) -> bool | None:
    """Convert str 'true'/'false', int 0/1, or None to bool | None."""
    if v is None:
        return None
    if isinstance(v, bool):
        return v
    return str(v).lower() == "true"


def _maybe_str(v: Any) -> str | None:
    """Return None for empty string or None, otherwise str(v)."""
    if v is None or v == "":
        return None
    return str(v)


# ---------------------------------------------------------------------------
# GA4
# ---------------------------------------------------------------------------


def transform_ga4_acquisition(records: list[dict[str, Any]], dt: str) -> pa.Table:
    rows = []
    for r in records:
        d = r.get("dimensions", {})
        m = r.get("metrics", {})
        rows.append(
            {
                "channel_group": d.get("sessionDefaultChannelGroup"),
                "source": d.get("sessionSource"),
                "medium": d.get("sessionMedium"),
                "sessions": _maybe_int(m.get("sessions")),
                "total_users": _maybe_int(m.get("totalUsers")),
                "conversions": _maybe_int(m.get("conversions")),
                "total_revenue": _maybe_float(m.get("totalRevenue")),
            }
        )
    schema = pa.schema(
        [
            pa.field("channel_group", pa.string()),
            pa.field("source", pa.string()),
            pa.field("medium", pa.string()),
            pa.field("sessions", pa.int64()),
            pa.field("total_users", pa.int64()),
            pa.field("conversions", pa.int64()),
            pa.field("total_revenue", pa.float64()),
        ]
    )
    return pa.Table.from_pylist(rows, schema=schema)


def transform_ga4_engagement(records: list[dict[str, Any]], dt: str) -> pa.Table:
    rows = []
    for r in records:
        d = r.get("dimensions", {})
        m = r.get("metrics", {})
        rows.append(
            {
                "channel_group": d.get("sessionDefaultChannelGroup"),
                "source": d.get("sessionSource"),
                "medium": d.get("sessionMedium"),
                "engagement_rate": _maybe_float(m.get("engagementRate")),
                "bounce_rate": _maybe_float(m.get("bounceRate")),
            }
        )
    schema = pa.schema(
        [
            pa.field("channel_group", pa.string()),
            pa.field("source", pa.string()),
            pa.field("medium", pa.string()),
            pa.field("engagement_rate", pa.float64()),
            pa.field("bounce_rate", pa.float64()),
        ]
    )
    return pa.Table.from_pylist(rows, schema=schema)


# ---------------------------------------------------------------------------
# AppsFlyer
# ---------------------------------------------------------------------------


def transform_appsflyer_installs(records: list[dict[str, Any]], dt: str) -> pa.Table:
    rows = []
    for r in records:
        d = r.get("dimensions", {})
        m = r.get("metrics", {})
        rows.append(
            {
                "media_source": d.get("media_source"),
                "campaign": _maybe_str(d.get("campaign")),
                "installs": _maybe_int(m.get("installs")),
                "is_organic": _maybe_bool(d.get("is_organic")),
            }
        )
    schema = pa.schema(
        [
            pa.field("media_source", pa.string()),
            pa.field("campaign", pa.string()),
            pa.field("installs", pa.int64()),
            pa.field("is_organic", pa.bool_()),
        ]
    )
    return pa.Table.from_pylist(rows, schema=schema)


def transform_appsflyer_events(records: list[dict[str, Any]], dt: str) -> pa.Table:
    rows = []
    for r in records:
        d = r.get("dimensions", {})
        m = r.get("metrics", {})
        rows.append(
            {
                "media_source": d.get("media_source"),
                "campaign": _maybe_str(d.get("campaign")),
                "event_name": d.get("event_name"),
                "event_count": _maybe_int(m.get("event_count")),
                "event_revenue": _maybe_float(m.get("event_revenue")),
                "is_organic": _maybe_bool(d.get("is_organic")),
            }
        )
    schema = pa.schema(
        [
            pa.field("media_source", pa.string()),
            pa.field("campaign", pa.string()),
            pa.field("event_name", pa.string()),
            pa.field("event_count", pa.int64()),
            pa.field("event_revenue", pa.float64()),
            pa.field("is_organic", pa.bool_()),
        ]
    )
    return pa.Table.from_pylist(rows, schema=schema)


def transform_appsflyer_retention(records: list[dict[str, Any]], dt: str) -> pa.Table:
    rows = []
    for r in records:
        d = r.get("dimensions", {})
        m = r.get("metrics", {})
        rows.append(
            {
                "media_source": d.get("media_source"),
                "campaign": _maybe_str(d.get("campaign")),
                "retention_d1": _maybe_float(m.get("retention_d1")),
                "retention_d7": _maybe_float(m.get("retention_d7")),
                "retention_d30": _maybe_float(m.get("retention_d30")),
                "is_organic": _maybe_bool(d.get("is_organic")),
            }
        )
    schema = pa.schema(
        [
            pa.field("media_source", pa.string()),
            pa.field("campaign", pa.string()),
            pa.field("retention_d1", pa.float64()),
            pa.field("retention_d7", pa.float64()),
            pa.field("retention_d30", pa.float64()),
            pa.field("is_organic", pa.bool_()),
        ]
    )
    return pa.Table.from_pylist(rows, schema=schema)


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class DatasetSpec:
    """Associates a raw source tag with its curated transform callable."""

    source: str
    transform: Callable[[list[dict[str, Any]], str], pa.Table]


REGISTRY: dict[str, DatasetSpec] = {
    "ga4_acquisition_daily": DatasetSpec("ga4", transform_ga4_acquisition),
    "ga4_engagement_daily": DatasetSpec("ga4", transform_ga4_engagement),
    "appsflyer_installs_daily": DatasetSpec("appsflyer", transform_appsflyer_installs),
    "appsflyer_events_daily": DatasetSpec("appsflyer", transform_appsflyer_events),
    "appsflyer_retention_daily": DatasetSpec("appsflyer", transform_appsflyer_retention),
}
