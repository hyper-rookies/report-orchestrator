"""Unit tests for write_jsonl_gz_stream and build_stream_manifest."""
from __future__ import annotations

import gzip
import json
import os
import tempfile

from report_system.domain.ingestion.models import DimensionValue, MetricValue, ReportRow
from report_system.infrastructure.persistence.serializer import (
    build_stream_manifest,
    write_jsonl_gz_stream,
)


def _make_rows(n: int) -> list[ReportRow]:
    return [
        ReportRow(
            dimensions=[DimensionValue(name="media_source", value=f"src_{i}")],
            metrics=[MetricValue(name="event_revenue", value=str(i * 1.5))],
        )
        for i in range(n)
    ]


def test_write_jsonl_gz_stream_row_count():
    rows = _make_rows(5)
    with tempfile.NamedTemporaryFile(suffix=".jsonl.gz", delete=False) as f:
        tmp = f.name
    try:
        count = write_jsonl_gz_stream(iter(rows), tmp)
        assert count == 5
    finally:
        os.unlink(tmp)


def test_write_jsonl_gz_stream_content():
    rows = _make_rows(3)
    with tempfile.NamedTemporaryFile(suffix=".jsonl.gz", delete=False) as f:
        tmp = f.name
    try:
        write_jsonl_gz_stream(iter(rows), tmp)
        with gzip.open(tmp, "rt", encoding="utf-8") as gz:
            lines = [json.loads(line) for line in gz if line.strip()]
        assert len(lines) == 3
        assert lines[0]["dimensions"]["media_source"] == "src_0"
        assert lines[2]["dimensions"]["media_source"] == "src_2"
        assert "event_revenue" in lines[0]["metrics"]
    finally:
        os.unlink(tmp)


def test_write_jsonl_gz_stream_empty():
    with tempfile.NamedTemporaryFile(suffix=".jsonl.gz", delete=False) as f:
        tmp = f.name
    try:
        count = write_jsonl_gz_stream(iter([]), tmp)
        assert count == 0
        with gzip.open(tmp, "rt") as gz:
            content = gz.read()
        assert content == ""
    finally:
        os.unlink(tmp)


def test_build_stream_manifest_success():
    m = build_stream_manifest(
        source="appsflyer",
        dataset_id="appsflyer_events_daily",
        dt="2024-01-01",
        start_date="2024-01-01",
        end_date="2024-01-01",
        row_count=42,
        generated_at_iso="2024-01-01T00:00:00+00:00",
    )
    assert m["status"] == "SUCCESS"
    assert m["row_count"] == 42
    assert m["writer"] == "s3_stream"


def test_build_stream_manifest_zero_rows():
    m = build_stream_manifest(
        source="appsflyer",
        dataset_id="appsflyer_events_daily",
        dt="2024-01-01",
        start_date="2024-01-01",
        end_date="2024-01-01",
        row_count=0,
        generated_at_iso="2024-01-01T00:00:00+00:00",
    )
    assert m["status"] == "WARN_ZERO_ROWS"
