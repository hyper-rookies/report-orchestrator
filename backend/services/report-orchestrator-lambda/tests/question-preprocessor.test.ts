import {
  normalizeNoTableCompletion,
  preprocessQuestion,
} from "../src/question-preprocessor";

test("preprocessQuestion short-circuits unsupported OS questions", () => {
  const result = preprocessQuestion("지난주 OS별 설치 비중을 보여줘");

  expect(result.unsupported).toMatchObject({
    category: "os_platform",
    code: "UNSUPPORTED_METRIC",
  });
  expect(result.unsupported?.message).toContain("OS / platform");
});

test("preprocessQuestion detects cross-view requests", () => {
  const result = preprocessQuestion("지난주 세션 수와 설치 수 구성을 보여줘");

  expect(result.unsupported).toMatchObject({
    category: "cross_view_join",
    code: "UNSUPPORTED_METRIC",
  });
});

test("preprocessQuestion keeps channel_group requests supported", () => {
  const result = preprocessQuestion("11월 channel group별 세션 수 보여줘");

  expect(result.unsupported).toBeUndefined();
  expect(result.likelyView).toBe("v_latest_ga4_acquisition_daily");
  expect(result.agentInputText).toContain("dimensions=channel_group");
});

test("preprocessQuestion augments supported session trend questions with schema guidance", () => {
  const question = "최근 4주간 전체 세션 추이를 보여줘";
  const result = preprocessQuestion(question);

  expect(result.unsupported).toBeUndefined();
  expect(result.likelyView).toBe("v_latest_ga4_acquisition_daily");
  expect(result.agentInputText).toContain("Best-fit view: v_latest_ga4_acquisition_daily");
  expect(result.agentInputText).toContain("The internal date column is always 'dt'");
  expect(result.agentInputText).toContain("anchor the date range to the latest available dt");
  expect(result.agentInputText).toContain("retry once with the latest available completed period");
  expect(result.agentInputText).toContain("Resolved request contract:");
  expect(result.agentInputText).toContain(`User question: ${question}`);
});

test("preprocessQuestion injects single KPI and media source filter hints", () => {
  const result = preprocessQuestion("최신 날짜 Google Ads 설치 수 알려줘");

  expect(result.unsupported).toBeUndefined();
  expect(result.likelyView).toBe("v_latest_appsflyer_installs_daily");
  expect(result.agentInputText).toContain("single KPI request");
  expect(result.agentInputText).toContain("media_source='Google Ads'");
  expect(result.agentInputText).toContain("single_kpi=true");
});

test("preprocessQuestion maps source-like requests to source instead of channel_group", () => {
  const result = preprocessQuestion("2024년 11월 유입원별 사용자 수 순위 정리해줘");

  expect(result.unsupported).toBeUndefined();
  expect(result.likelyView).toBe("v_latest_ga4_acquisition_daily");
  expect(result.agentInputText).toContain("dimensions=source");
  expect(result.agentInputText).not.toContain("dimensions=channel_group");
});

test("preprocessQuestion keeps medium requests on medium when channel_group is not explicit", () => {
  const result = preprocessQuestion("지난주 매체별 매출 구성비를 한눈에 보고 싶어");

  expect(result.unsupported).toBeUndefined();
  expect(result.likelyView).toBe("v_latest_ga4_acquisition_daily");
  expect(result.agentInputText).toContain("dimensions=medium");
  expect(result.agentInputText).not.toContain("dimensions=channel_group");
});

test("preprocessQuestion normalizes cohort day retention requests", () => {
  const result = preprocessQuestion("11월 media source별 7일차 retention 보여줘");

  expect(result.unsupported).toBeUndefined();
  expect(result.likelyView).toBe("v_latest_appsflyer_cohort_daily");
  expect(result.agentInputText).toContain("cohort_day=7");
  expect(result.agentInputText).toContain("retention_rate");
});

test("preprocessQuestion prefers AppsFlyer events for purchase revenue questions", () => {
  const result = preprocessQuestion("지난달 매체별 구매 매출을 보여줘");

  expect(result.unsupported).toBeUndefined();
  expect(result.likelyView).toBe("v_latest_appsflyer_events_daily");
});

test("normalizeNoTableCompletion rewrites schema ask-back into dt guidance", () => {
  const normalized = normalizeNoTableCompletion(
    "최근 4주간 전체 세션 추이를 보여줘",
    "죄송합니다. 날짜 관련 컬럼 이름을 정확히 찾지 못했습니다. 정확한 컬럼명을 알려주세요."
  );

  expect(normalized?.code).toBe("UNSUPPORTED_METRIC");
  expect(normalized?.message).toContain("dt");
  expect(normalized?.message).toContain("컬럼");
});
