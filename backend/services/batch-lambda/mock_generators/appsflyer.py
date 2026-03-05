from __future__ import annotations

import hashlib
import random


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

EVENT_NAMES: tuple[str, ...] = ("install", "sign_up", "purchase", "add_to_cart")


def _seed_for(*parts: str) -> int:
    key = ":".join(parts)
    return int(hashlib.sha256(key.encode("utf-8")).hexdigest()[:16], 16)


def _campaign_value(campaign: str | None) -> str:
    return campaign or ""


def generate_appsflyer_installs(target_date: str) -> list[dict]:
    """
    반환 컬럼: media_source, campaign, store_reinstall, installs, dt
    """
    rows: list[dict] = []
    for media_source, media_key in MEDIA_SOURCES:
        for campaign in CAMPAIGNS[media_key]:
            campaign_value = _campaign_value(campaign)
            for store_reinstall in ("false", "true"):
                rng = random.Random(
                    _seed_for(
                        target_date,
                        media_source,
                        campaign_value,
                        store_reinstall,
                    )
                )
                installs = rng.randint(10, 500)
                rows.append(
                    {
                        "media_source": media_source,
                        "campaign": campaign_value,
                        "store_reinstall": store_reinstall,
                        "installs": installs,
                        "dt": target_date,
                    }
                )
    return rows


def generate_appsflyer_events(target_date: str) -> list[dict]:
    """
    반환 컬럼: media_source, campaign, event_name, store_reinstall,
               event_count, event_revenue, dt
    """
    rows: list[dict] = []
    for media_source, media_key in MEDIA_SOURCES:
        for campaign in CAMPAIGNS[media_key]:
            campaign_value = _campaign_value(campaign)
            for event_name in EVENT_NAMES:
                rng = random.Random(
                    _seed_for(
                        target_date,
                        media_source,
                        campaign_value,
                        event_name,
                    )
                )
                event_count = rng.randint(5, 300)
                reinstall_rng = random.Random(
                    _seed_for(
                        target_date,
                        media_source,
                        campaign_value,
                        event_name,
                        "reinstall",
                    )
                )
                store_reinstall = "true" if reinstall_rng.random() < 0.3 else "false"
                if event_name == "purchase":
                    event_revenue = float(event_count * rng.randint(5000, 30000))
                else:
                    event_revenue = 0.0
                rows.append(
                    {
                        "media_source": media_source,
                        "campaign": campaign_value,
                        "event_name": event_name,
                        "store_reinstall": store_reinstall,
                        "event_count": event_count,
                        "event_revenue": event_revenue,
                        "dt": target_date,
                    }
                )
    return rows

