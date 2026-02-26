from __future__ import annotations

# ---------------------------------------------------------------------------
# GA4 mapping  (dimensions-set, metrics-set) -> dataset_id
# ---------------------------------------------------------------------------

_GA4_MAP: list[tuple[frozenset[str], frozenset[str], str]] = [
    (
        frozenset(["sessionDefaultChannelGroup", "sessionSource", "sessionMedium"]),
        frozenset(["sessions", "totalUsers", "conversions", "totalRevenue"]),
        "ga4_acquisition_daily",
    ),
    (
        frozenset(["sessionDefaultChannelGroup", "sessionSource", "sessionMedium"]),
        frozenset(["engagementRate", "bounceRate"]),
        "ga4_engagement_daily",
    ),
]

# ---------------------------------------------------------------------------
# AppsFlyer mapping  endpoint -> dataset_id
# ---------------------------------------------------------------------------

_APPSFLYER_MAP: dict[str, str] = {
    "installs": "appsflyer_installs_daily",
    "events": "appsflyer_events_daily",
}


# ---------------------------------------------------------------------------
# Public resolvers
# ---------------------------------------------------------------------------


def resolve_ga4_dataset_id(
    dimensions: list[str],
    metrics: list[str],
    *,
    strict: bool = False,
) -> str:
    """Return the logical dataset_id for a GA4 (dimensions, metrics) combination.

    Args:
        dimensions: GA4 dimension names.
        metrics: GA4 metric names.
        strict: If True, raise ValueError for unknown combinations instead of
                returning ``"ga4_custom"``.
    """
    dims_fs = frozenset(dimensions)
    mets_fs = frozenset(metrics)

    for d, m, dataset_id in _GA4_MAP:
        if dims_fs == d and mets_fs == m:
            return dataset_id

    if strict:
        raise ValueError(
            f"Unknown GA4 dataset combination: "
            f"dims={sorted(dimensions)}, metrics={sorted(metrics)}"
        )
    return "ga4_custom"


def resolve_appsflyer_dataset_id(endpoint: str, *, strict: bool = False) -> str:
    """Return the logical dataset_id for an AppsFlyer endpoint key.

    Args:
        endpoint: Short endpoint key (e.g. ``"installs"``) or full URL.
        strict: If True, raise ValueError for unknown keys.
    """
    if endpoint in _APPSFLYER_MAP:
        return _APPSFLYER_MAP[endpoint]

    if strict:
        raise ValueError(
            f"Unknown AppsFlyer endpoint: '{endpoint}'. "
            f"Known keys: {sorted(_APPSFLYER_MAP)}"
        )
    return f"appsflyer_custom_{endpoint}"
