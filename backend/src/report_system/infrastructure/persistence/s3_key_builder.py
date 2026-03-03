from __future__ import annotations

# All functions are pure string transformations — no I/O, no external deps.


def build_raw_prefix(source: str, dataset_id: str, dt: str) -> str:
    """Return the S3 prefix for a raw partition.

    Example:
        >>> build_raw_prefix("ga4", "ga4_acquisition_daily", "2024-01-01")
        'raw/source=ga4/report=ga4_acquisition_daily/dt=2024-01-01/'
    """
    return f"raw/source={source}/report={dataset_id}/dt={dt}/"


def build_raw_key(source: str, dataset_id: str, dt: str, filename: str) -> str:
    """Return the full S3 object key for a raw file.

    Example:
        >>> build_raw_key("ga4", "ga4_acquisition_daily", "2024-01-01", "data.jsonl.gz")
        'raw/source=ga4/report=ga4_acquisition_daily/dt=2024-01-01/data.jsonl.gz'
    """
    return build_raw_prefix(source, dataset_id, dt) + filename


def build_curated_prefix(table_name: str, dt: str) -> str:
    """Return the S3 prefix for a curated partition.

    Example:
        >>> build_curated_prefix("ga4_acquisition_daily", "2024-01-01")
        'curated/ga4_acquisition_daily/dt=2024-01-01/'
    """
    return f"curated/{table_name}/dt={dt}/"
