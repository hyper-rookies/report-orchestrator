# SC-03: 스크립트 실행 → JSON + manifest 생성

**전제 조건:** SC-02가 `"done"` 상태여야 한다. AWS 자격증명이 설정되어 있어야 한다.

## 작업 개요

`precompute_dashboard.py`를 실행해 `frontend/public/dashboard-cache/`에 JSON 파일 5개와 `manifest.json` 1개를 생성한다. **코드는 수정하지 않는다.**

---

## Step 1: AWS 자격증명 확인

```bash
aws sts get-caller-identity
```

Expected: JSON with Account, UserId, Arn 출력. 오류 시 BLOCKED 처리.

## Step 2: 스크립트 실행

```bash
cd backend
python scripts/precompute_dashboard.py
```

(환경 변수가 이미 .env에 있거나 시스템에 설정된 경우 위 명령으로 충분. 아니면 아래):

```bash
ATHENA_DATABASE=hyper_intern_m1c \
ATHENA_WORKGROUP=hyper-intern-m1c-wg \
ATHENA_OUTPUT_S3=s3://hyper-intern-m1c-athena-results-bucket/athena-results/precompute/ \
AWS_REGION=ap-northeast-2 \
python scripts/precompute_dashboard.py
```

## Step 3: 생성 파일 확인

```bash
ls frontend/public/dashboard-cache/
```

Expected 파일 목록:
```
manifest.json
week=2024-11-01_2024-11-07.json
week=2024-11-08_2024-11-14.json
week=2024-11-15_2024-11-21.json
week=2024-11-22_2024-11-28.json
week=2024-11-29_2024-11-30.json
```

## 수락 기준

- [ ] `frontend/public/dashboard-cache/manifest.json` 존재
- [ ] `frontend/public/dashboard-cache/week=2024-11-22_2024-11-28.json` 존재
- [ ] manifest.json이 유효한 JSON 배열 (`python -m json.tool manifest.json` 오류 없음)
- [ ] 각 week JSON에 9개 쿼리 키 (`sessions`, `installs`, `engagement`, ...) 존재

## 완료 후 할 일

1. `docs/tasks/SC-03/REPORT.md` 채우기
2. `docs/tasks/status.json`에서 SC-03 status → `"done"` 또는 `"blocked"`
3. `git add frontend/public/dashboard-cache/ docs/tasks/SC-03/REPORT.md docs/tasks/status.json`
4. `git commit -m "feat(data): add precomputed dashboard cache JSON (SC-03)"`
```
