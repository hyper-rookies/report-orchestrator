import sys

from report_system.config.settings import get_settings


def main() -> None:
    try:
        settings = get_settings()
    except FileNotFoundError as exc:
        print(f"[config error] {exc}", file=sys.stderr)
        sys.exit(1)
    except ValueError as exc:
        print(f"[config error] {exc}", file=sys.stderr)
        sys.exit(1)

    print("Settings loaded:")
    for key, value in settings.masked_display().items():
        print(f"  {key}={value}")


if __name__ == "__main__":
    main()
