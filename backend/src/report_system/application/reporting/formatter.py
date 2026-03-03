from __future__ import annotations

from report_system.domain.ingestion.models import ReportDataset


def format_dataset_summary(ds: ReportDataset, max_rows: int = 3) -> str:
    lines: list[str] = [
        f"source      : {ds.source}",
        f"generated_at: {ds.generated_at.isoformat()}",
        f"row_count   : {len(ds.rows)}",
    ]

    if not ds.rows:
        lines.append("  (no rows)")
        return "\n".join(lines)

    for i, row in enumerate(ds.rows[:max_rows]):
        dims = "  ".join(f"{d.name}={d.value}" for d in row.dimensions)
        mets = "  ".join(f"{m.name}={m.value}" for m in row.metrics)
        parts = [p for p in (dims, mets) if p]
        lines.append(f"  row[{i}]: {' | '.join(parts)}")

    if len(ds.rows) > max_rows:
        lines.append(f"  ... ({len(ds.rows) - max_rows} more rows)")

    return "\n".join(lines)


def format_batch_summary(datasets: list[ReportDataset]) -> str:
    if not datasets:
        return "batch: 0 datasets"

    # Group by source while preserving encounter order.
    groups: dict[str, list[ReportDataset]] = {}
    for ds in datasets:
        groups.setdefault(ds.source, []).append(ds)

    lines: list[str] = [f"batch: {len(datasets)} dataset(s) across {len(groups)} source(s)"]

    for source, items in groups.items():
        lines.append(f"\n[{source}]  {len(items)} dataset(s)")
        for ds in items:
            lines.append(
                f"  {ds.generated_at.isoformat()}  rows={len(ds.rows)}"
            )

    return "\n".join(lines)
