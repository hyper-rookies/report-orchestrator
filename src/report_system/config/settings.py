from __future__ import annotations

import os
import sys
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel

_ENV_FILE = Path(".env.local")

# Fields that contain sensitive credentials and should be masked in output.
_MASKED_FIELDS = {"GA4_PROPERTY_ID", "APPSFLYER_API_TOKEN", "APPSFLYER_APP_ID"}


def _mask(value: str) -> str:
    """Return first 4 characters followed by *** to hide sensitive values."""
    return value[:4] + "***" if len(value) > 4 else "***"


class Settings(BaseModel):
    # --- Required credentials ---
    GA4_PROPERTY_ID: str
    GOOGLE_APPLICATION_CREDENTIALS: str
    APPSFLYER_API_TOKEN: str
    APPSFLYER_APP_ID: str

    # --- Optional operational settings with sensible defaults ---
    GA4_BACKFILL_DAYS: int = 7
    MMP_BACKFILL_DAYS: int = 7
    JOB_TIMEZONE: str = "Asia/Seoul"

    # --- Athena (optional; used when registering curated partitions) ---
    ATHENA_DATABASE: str = "hyper_intern_m1c"
    ATHENA_WORKGROUP: str = "hyper-intern-m1c-wg"

    def masked_display(self) -> dict[str, str]:
        """Return a dict with sensitive fields partially masked."""
        result: dict[str, str] = {}
        for field in self.model_fields:
            value = str(getattr(self, field))
            result[field] = _mask(value) if field in _MASKED_FIELDS else value
        return result


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Load and return Settings, raising on any configuration problem."""
    if not _ENV_FILE.exists():
        raise FileNotFoundError(
            f"'{_ENV_FILE}' not found.\n"
            "Copy .env.example to .env.local and fill in the required values."
        )

    load_dotenv(_ENV_FILE, override=False)

    # Only fields without defaults are truly required.
    required_keys = [
        name
        for name, finfo in Settings.model_fields.items()
        if finfo.is_required()
    ]
    missing = [key for key in required_keys if not os.getenv(key)]
    if missing:
        raise ValueError(
            "Missing required environment variables:\n"
            + "\n".join(f"  - {key}" for key in missing)
        )

    # Pass every env var that is present; pydantic applies defaults for the rest.
    kwargs = {
        key: os.environ[key]
        for key in Settings.model_fields
        if os.getenv(key) is not None
    }
    return Settings(**kwargs)
