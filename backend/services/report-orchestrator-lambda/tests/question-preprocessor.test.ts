import {
  normalizeNoTableCompletion,
  preprocessQuestion,
} from "../src/question-preprocessor";

test("preprocessQuestion short-circuits unsupported OS questions", () => {
  const result = preprocessQuestion("\uC9C0\uB09C\uC8FC OS\uBCC4 \uC124\uCE58 \uBE44\uC911\uC744 \uBCF4\uC5EC\uC918");

  expect(result.unsupported).toMatchObject({
    category: "os_platform",
    code: "UNSUPPORTED_METRIC",
  });
  expect(result.unsupported?.message).toContain("OS / platform");
});

test("preprocessQuestion detects cross-view requests", () => {
  const result = preprocessQuestion("\uC9C0\uB09C\uC8FC \uC138\uC158 \uC218\uC640 \uC124\uCE58 \uC218 \uAD6C\uC131\uC744 \uBCF4\uC5EC\uC918");

  expect(result.unsupported).toMatchObject({
    category: "cross_view_join",
    code: "UNSUPPORTED_METRIC",
  });
});

test("preprocessQuestion keeps channel_group requests supported", () => {
  const result = preprocessQuestion("11\uC6D4 channel group\uBCC4 \uC138\uC158 \uC218 \uBCF4\uC5EC\uC918");

  expect(result.unsupported).toBeUndefined();
  expect(result.likelyView).toBe("v_latest_ga4_acquisition_daily");
  expect(result.agentInputText).toContain("dimensions=channel_group");
});

test("preprocessQuestion augments supported session trend questions with schema guidance", () => {
  const question = "\uCD5C\uADFC 4\uC8FC\uAC04 \uC804\uCCB4 \uC138\uC158 \uCD94\uC774\uB97C \uBCF4\uC5EC\uC918";
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
  const result = preprocessQuestion("\uCD5C\uC2E0 \uB0A0\uC9DC Google Ads \uC124\uCE58 \uC218 \uC54C\uB824\uC918");

  expect(result.unsupported).toBeUndefined();
  expect(result.likelyView).toBe("v_latest_appsflyer_installs_daily");
  expect(result.agentInputText).toContain("single KPI request");
  expect(result.agentInputText).toContain("media_source='Google Ads'");
  expect(result.agentInputText).toContain("single_kpi=true");
});

test("preprocessQuestion keeps purchase as an event_name filter", () => {
  const result = preprocessQuestion("11\uC6D4 media source\uBCC4 purchase \uC774\uBCA4\uD2B8 \uC218 \uBCF4\uC5EC\uC918");

  expect(result.unsupported).toBeUndefined();
  expect(result.likelyView).toBe("v_latest_appsflyer_events_daily");
  expect(result.agentInputText).toContain("event_name='purchase'");
  expect(result.agentInputText).toContain("keep event_name in WHERE");
});

test("preprocessQuestion normalizes cohort day retention requests", () => {
  const result = preprocessQuestion("11\uC6D4 media source\uBCC4 7\uC77C\uCC28 retention \uBCF4\uC5EC\uC918");

  expect(result.unsupported).toBeUndefined();
  expect(result.likelyView).toBe("v_latest_appsflyer_cohort_daily");
  expect(result.agentInputText).toContain("cohort_day='7'");
  expect(result.agentInputText).toContain("retention_rate");
});

test("preprocessQuestion prefers AppsFlyer events for purchase revenue questions", () => {
  const result = preprocessQuestion("\uC9C0\uB09C\uB2EC \uB9E4\uCCB4\uBCC4 \uAD6C\uB9E4 \uB9E4\uCD9C\uC744 \uBCF4\uC5EC\uC918");

  expect(result.unsupported).toBeUndefined();
  expect(result.likelyView).toBe("v_latest_appsflyer_events_daily");
});

test("normalizeNoTableCompletion rewrites schema ask-back into dt guidance", () => {
  const normalized = normalizeNoTableCompletion(
    "\uCD5C\uADFC 4\uC8FC\uAC04 \uC804\uCCB4 \uC138\uC158 \uCD94\uC774\uB97C \uBCF4\uC5EC\uC918",
    "\uC8C4\uC1A1\uD569\uB2C8\uB2E4. \uB0A0\uC9DC \uAD00\uB828 \uCEEC\uB7FC \uC774\uB984\uC744 \uC815\uD655\uD788 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC815\uD655\uD55C \uCEEC\uB7FC\uBA85\uC744 \uC54C\uB824\uC8FC\uC138\uC694."
  );

  expect(normalized?.code).toBe("UNSUPPORTED_METRIC");
  expect(normalized?.message).toContain("dt");
  expect(normalized?.message).toContain("\uCEEC\uB7FC");
});
