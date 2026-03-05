from __future__ import annotations

import hashlib
import random


CHANNELS: tuple[tuple[str, str, str], ...] = (
    ("Organic Search", "google", "organic"),
    ("Paid Search", "google", "cpc"),
    ("Paid Social", "facebook", "cpc"),
    ("Direct", "(direct)", "(none)"),
    ("Referral", "blog.hyperrookies.com", "referral"),
    ("Email", "newsletter", "email"),
)


def _seed_for(target_date: str, channel_group: str, suffix: str) -> int:
    key = f"{target_date}:{channel_group}:{suffix}"
    return int(hashlib.sha256(key.encode("utf-8")).hexdigest()[:16], 16)


def generate_ga4_acquisition(target_date: str) -> list[dict]:
    """
    반환 컬럼: channel_group, source, medium, sessions, total_users,
               conversions, total_revenue, dt
    """
    rows: list[dict] = []
    for channel_group, source, medium in CHANNELS:
        rng = random.Random(_seed_for(target_date, channel_group, "acquisition"))
        sessions = rng.randint(100, 5000)
        total_users = int(round(sessions * 0.85))
        conversions = int(round(sessions * 0.03))
        unit_revenue = float(rng.randint(10_000, 50_000))
        total_revenue = float(conversions * unit_revenue)
        rows.append(
            {
                "channel_group": channel_group,
                "source": source,
                "medium": medium,
                "sessions": sessions,
                "total_users": total_users,
                "conversions": conversions,
                "total_revenue": total_revenue,
                "dt": target_date,
            }
        )
    return rows


def generate_ga4_engagement(target_date: str) -> list[dict]:
    """
    반환 컬럼: channel_group, source, medium, engagement_rate,
               bounce_rate, dt
    """
    rows: list[dict] = []
    for channel_group, source, medium in CHANNELS:
        rng = random.Random(_seed_for(target_date, channel_group, "engagement"))
        engagement_rate = round(rng.uniform(0.40, 0.85), 4)
        bounce_rate = round(1 - engagement_rate, 4)
        rows.append(
            {
                "channel_group": channel_group,
                "source": source,
                "medium": medium,
                "engagement_rate": engagement_rate,
                "bounce_rate": bounce_rate,
                "dt": target_date,
            }
        )
    return rows

