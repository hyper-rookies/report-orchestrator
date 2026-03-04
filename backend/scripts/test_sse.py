"""SSE stream test for orchestrator Lambda Function URL.

Usage:
    python scripts/test_sse.py
    python scripts/test_sse.py "11월 미디어 소스별 총 설치 건수를 보여줘"
"""
from __future__ import annotations

import sys
import json
import urllib.request

URL = "https://p2ci72n4le6v2ge3ni4ehwp7ce0eztwy.lambda-url.ap-northeast-2.on.aws/"

question = sys.argv[1] if len(sys.argv) > 1 else "11월 미디어 소스별 총 설치 건수를 보여줘"

print(f"Question: {question}")
print(f"URL: {URL}")
print("-" * 60)

data = json.dumps({"question": question}).encode("utf-8")
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
