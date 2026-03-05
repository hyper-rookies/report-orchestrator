from __future__ import annotations

import hashlib
import random
from datetime import datetime, timedelta


COHORT_DAYS: list[int] = [0, 1, 7, 14, 30]

RETENTION_RATES: dict[int, tuple[float, float]] = {
    0: (0.95, 1.0),
    1: (0.40, 0.60),
    7: (0.20, 0.40),
    14: (0.12, 0.28),
    30: (0.05, 0.18),
}

MEDIA_SOURCES: tuple[tuple[str, str], ...] = (
    ("Facebook Ads", "facebook_ads"),
    ("Google Ads", "google_ads"),
    ("organic", "organic"),
    ("Apple Search Ads", "Apple Search Ads"),
    ("TikTok Ads", "tiktok_ads"),
)

CAMPAIGNS: dict[str, list[str | None]] = {
    "facebook_ads": ["fb_retargeting_nov", "fb_prospecting_nov"],
    "google_ads": ["gads_brand_nov", "gads_performance_nov"],
    "organic": [None, None],
    "Apple Search Ads": [None, None],
    "tiktok_ads": [None, None],
}


def _seed_for(*parts: str) -> int:
    key = ":".join(parts)
    return int(hashlib.sha256(key.encode("utf-8")).hexdigest()[:16], 16)


def _campaign_value(campaign: str | None) -> str:
    return campaign or ""


def generate_appsflyer_cohort(target_date: str) -> list[dict]:
    """
    반환 컬럼: media_source, campaign, cohort_date, cohort_day,
               retained_users, cohort_size, dt
    """
    target = datetime.fromisoformat(target_date).date()
    rows: list[dict] = []
    for media_source, media_key in MEDIA_SOURCES:
        for campaign in CAMPAIGNS[media_key]:
            campaign_value = _campaign_value(campaign)
            size_rng = random.Random(
                _seed_for(target_date, media_source, campaign_value)
            )
            cohort_size = size_rng.randint(100, 500)
            for cohort_day in COHORT_DAYS:
                min_rate, max_rate = RETENTION_RATES[cohort_day]
                rate_rng = random.Random(
                    _seed_for(target_date, media_source, campaign_value, str(cohort_day))
                )
                retention_rate = rate_rng.uniform(min_rate, max_rate)
                retained_users = int(round(cohort_size * retention_rate))
                cohort_date = (target - timedelta(days=cohort_day)).isoformat()
                rows.append(
                    {
                        "media_source": media_source,
                        "campaign": campaign_value,
                        "cohort_date": cohort_date,
                        "cohort_day": cohort_day,
                        "retained_users": retained_users,
                        "cohort_size": cohort_size,
                        "dt": target_date,
                    }
                )
    return rows

