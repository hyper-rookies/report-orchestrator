import sys
from pathlib import Path

# report-lambda/ 를 sys.path에 추가해 `from handler import ...` 가 동작하도록 함
sys.path.insert(0, str(Path(__file__).parent))
