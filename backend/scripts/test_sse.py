"""SSE stream test for orchestrator Lambda Function URL.

Usage:
    python backend/scripts/test_sse.py
    python backend/scripts/test_sse.py "24년 11월 미디어 소스별 총 설치 건수를 보여줘"
    python backend/scripts/test_sse.py --require-approval "24년 11월 미디어 소스별 총 설치 건수를 보여줘"
"""
from __future__ import annotations

import argparse
import json
import urllib.request

URL = "https://p2ci72n4le6v2ge3ni4ehwp7ce0eztwy.lambda-url.ap-northeast-2.on.aws/"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="SSE stream test for orchestrator Lambda Function URL."
    )
    parser.add_argument(
        "question",
        nargs="?",
        default="24년 11월 미디어 소스별 총 설치 건수를 보여줘",
    )
    parser.add_argument(
        "--require-approval",
        action="store_true",
        help="Disable auto-approval and surface approval-required responses.",
    )
    args = parser.parse_args()

    print(f"Question: {args.question}")
    print(f"URL: {URL}")
    auto_approve = not args.require_approval

    print(f"Auto-approve: {auto_approve}")
    print("-" * 60)

    data = json.dumps(
        {
            "question": args.question,
            "autoApproveActions": auto_approve,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        URL,
        data=data,
        headers={"Content-Type": "application/json"},
    )

    with urllib.request.urlopen(req, timeout=120) as resp:
        print(f"HTTP {resp.status}  Content-Type: {resp.headers.get('Content-Type')}")
        print("-" * 60)
        for raw_line in resp:
            line = raw_line.decode("utf-8").rstrip("\n")
            if line:
                print(line, flush=True)


if __name__ == "__main__":
    main()
