# Codex 작업 워크플로우

## 각 태스크 수행 방법

1. `docs/tasks/DA-0X/PROMPT.md` 읽기
2. 코드 구현
3. `cd frontend && npx tsc --noEmit` 실행
4. `docs/tasks/DA-0X/REPORT.md` 채우기
5. `docs/tasks/status.json`에서 해당 태스크 status를 `"done"` (또는 `"blocked"`)로 변경
6. git commit

## 리뷰어에게

리뷰어(Claude)는:
1. `status.json` 확인 → 완료된 태스크 식별
2. 해당 `REPORT.md` 읽기 → 수락 기준 체크, 이탈 사항 확인
3. 문제 없으면 다음 태스크 승인
4. 문제 있으면 REPORT.md의 Questions 섹션에 피드백 작성

## 태스크 의존성

- DA-01, DA-02, DA-03 → 병렬 작업 가능 (독립)
- DA-04 → DA-01, DA-02, DA-03 완료 후
- DA-05 → DA-04 완료 후
