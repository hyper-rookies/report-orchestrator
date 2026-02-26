from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass(frozen=True)
class MetricValue:
    name: str
    value: int | float | str


@dataclass(frozen=True)
class DimensionValue:
    name: str
    value: str


@dataclass(frozen=True)
class ReportRow:
    dimensions: list[DimensionValue] = field(default_factory=list)
    metrics: list[MetricValue] = field(default_factory=list)


@dataclass(frozen=True)
class ReportDataset:
    source: str
    rows: list[ReportRow] = field(default_factory=list)
    generated_at: datetime = field(
        default_factory=lambda: datetime.now(tz=timezone.utc)
    )
