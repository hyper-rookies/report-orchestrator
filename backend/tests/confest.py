import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]          # .../backend
QUERY_DIR = BACKEND_DIR / "services" / "query-lambda"      # 하이픈 폴더 그대로
if str(QUERY_DIR) not in sys.path:
    sys.path.insert(0, str(QUERY_DIR))