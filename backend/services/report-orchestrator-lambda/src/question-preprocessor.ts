import { getSharedSchemaConfig, type ViewSchema } from "./shared-config";

const FRIENDLY_VIEW_LABELS: Record<string, string> = {
  v_latest_ga4_acquisition_daily: "GA4 acquisition",
  v_latest_ga4_engagement_daily: "GA4 engagement",
  v_latest_appsflyer_installs_daily: "AppsFlyer installs",
  v_latest_appsflyer_events_daily: "AppsFlyer events",
  v_latest_appsflyer_cohort_daily: "AppsFlyer cohort",
};

const VIEW_PATTERNS: Array<{ view: string; patterns: RegExp[] }> = [
  {
    view: "v_latest_appsflyer_cohort_daily",
    patterns: [
      /\bretention\b/i,
      /\uB9AC\uD150\uC158/i,
      /\uC794\uC874/i,
      /\bcohort\b/i,
      /\uCF54\uD638\uD2B8/i,
      /\bday\s*\d+\b/i,
      /\bd\d+\b/i,
    ],
  },
  {
    view: "v_latest_appsflyer_events_daily",
    patterns: [
      /\bevent\b/i,
      /\uC774\uBCA4\uD2B8/i,
      /\bpurchase\b/i,
      /\uAD6C\uB9E4/i,
      /\uAD6C\uB9E4\s*\uB9E4\uCD9C/i,
      /\bsign[\s_-]?up\b/i,
      /\uAC00\uC785/i,
      /\bevent[_\s]?revenue\b/i,
      /\uC774\uBCA4\uD2B8\s*\uB9E4\uCD9C/i,
    ],
  },
  {
    view: "v_latest_appsflyer_installs_daily",
    patterns: [/\binstall\b/i, /\uC124\uCE58/i, /\uC778\uC2A4\uD1A8/i, /\uC7AC\uC124\uCE58/i],
  },
  {
    view: "v_latest_ga4_engagement_daily",
    patterns: [/\bengagement\b/i, /\uCC38\uC5EC/i, /\bbounce\b/i, /\uC774\uD0C8\uB960/i],
  },
  {
    view: "v_latest_ga4_acquisition_daily",
    patterns: [
      /\bsession\b/i,
      /\uC138\uC158/i,
      /\btotal[_\s]?users?\b/i,
      /\uC0AC\uC6A9\uC790/i,
      /\bconversion\b/i,
      /\uC804\uD658/i,
      /\btotal[_\s]?revenue\b/i,
      /\uB9E4\uCD9C/i,
    ],
  },
];

const AIRBRIDGE_PATTERNS = [/\bairbridge\b/i, /\uC5D0\uC5B4\uBE0C\uB9BF\uC9C0/i];
const OS_PLATFORM_PATTERNS = [/\bos\b/i, /\bplatform\b/i, /\uC6B4\uC601\uCCB4\uC81C/i, /\uD50C\uB7AB\uD3FC/i];
const RAW_ROW_LEVEL_PATTERNS = [
  /\braw\b/i,
  /\brow[-\s]?level\b/i,
  /\buser id\b/i,
  /\uC6D0\uBCF8\s*\uB370\uC774\uD130/i,
  /\uB85C\uC6B0/i,
  /\uC0AC\uC6A9\uC790\s*\uBAA9\uB85D/i,
  /\uBA85\uB2E8/i,
];
const CROSS_VIEW_SOURCE_PATTERNS = [
  /\bga4\b/i,
  /\bappsflyer\b/i,
  /(\uC138\uC158|session).*(\uC124\uCE58|install)/i,
  /(\uC124\uCE58|install).*(\uC138\uC158|session)/i,
  /(\uC138\uC158|session).*(\uB9AC\uD150\uC158|retention)/i,
  /(\uB9AC\uD150\uC158|retention).*(\uC138\uC158|session)/i,
  /(\uB9E4\uCD9C|revenue).*(\uC124\uCE58|install)/i,
  /(\uC124\uCE58|install).*(\uB9E4\uCD9C|revenue)/i,
];
const SCHEMA_ASKBACK_PATTERNS = [
  /column/i,
  /schema/i,
  /\uCEEC\uB7FC/i,
  /\uC2A4\uD0A4\uB9C8/i,
  /\uC815\uD655\uD55C\s*\uC774\uB984/i,
  /\uC815\uD655\uD55C\s*\uCEEC\uB7FC/i,
  /column name/i,
  /column list/i,
];

const DEFERRED_DIMENSION_PATTERNS: Array<{
  column: string;
  label: string;
  patterns: RegExp[];
}> = [
  { column: "keyword", label: "keyword", patterns: [/\bkeyword\b/i, /\uD0A4\uC6CC\uB4DC/i] },
  { column: "adset", label: "adset", patterns: [/\badset\b/i, /\uC560\uB4DC\uC14B/i, /\uAD11\uACE0\uC138\uD2B8/i] },
  { column: "ad", label: "ad", patterns: [/\bad\b/i, /\uAD11\uACE0\s*\uC18C\uC7AC/i, /\uAD11\uACE0\s*\uBB38\uC548/i] },
  { column: "channel", label: "channel", patterns: [/\bchannel\b/i, /\uCC44\uB110/i] },
  { column: "app_version", label: "app_version", patterns: [/\bapp\s*version\b/i, /\uC571\s*\uBC84\uC804/i] },
  {
    column: "campaign_type",
    label: "campaign_type",
    patterns: [/\bcampaign\s*type\b/i, /\uCEA0\uD398\uC778\s*\uD0C0\uC785/i, /\uCEA0\uD398\uC778\s*\uC720\uD615/i],
  },
  { column: "match_type", label: "match_type", patterns: [/\bmatch\s*type\b/i, /\uB9E4\uCE58\s*\uD0C0\uC785/i] },
];

const METRIC_HINTS: Array<{
  metric: string;
  views: string[];
  patterns: RegExp[];
}> = [
  { metric: "sessions", views: ["v_latest_ga4_acquisition_daily"], patterns: [/\bsession\b/i, /\uC138\uC158/i] },
  {
    metric: "total_users",
    views: ["v_latest_ga4_acquisition_daily"],
    patterns: [/\btotal[_\s]?users?\b/i, /\uCD1D\s*\uC0AC\uC6A9\uC790/i, /\uC0AC\uC6A9\uC790/i],
  },
  { metric: "conversions", views: ["v_latest_ga4_acquisition_daily"], patterns: [/\bconversion\b/i, /\uC804\uD658/i] },
  {
    metric: "total_revenue",
    views: ["v_latest_ga4_acquisition_daily"],
    patterns: [/\btotal[_\s]?revenue\b/i, /\uCD1D\s*\uB9E4\uCD9C/i, /\uB9E4\uCD9C/i],
  },
  {
    metric: "engagement_rate",
    views: ["v_latest_ga4_engagement_daily"],
    patterns: [/\bengagement\b/i, /\uCC38\uC5EC/i],
  },
  { metric: "bounce_rate", views: ["v_latest_ga4_engagement_daily"], patterns: [/\bbounce\b/i, /\uC774\uD0C8\uB960/i] },
  { metric: "installs", views: ["v_latest_appsflyer_installs_daily"], patterns: [/\binstall\b/i, /\uC124\uCE58/i, /\uC778\uC2A4\uD1A8/i] },
  {
    metric: "event_count",
    views: ["v_latest_appsflyer_events_daily"],
    patterns: [/\bevent\b/i, /\uC774\uBCA4\uD2B8/i, /\bpurchase\b/i, /\uAD6C\uB9E4/i, /\bsign[\s_-]?up\b/i, /\uAC00\uC785/i],
  },
  {
    metric: "event_revenue",
    views: ["v_latest_appsflyer_events_daily"],
    patterns: [/\bevent[_\s]?revenue\b/i, /\bpurchase\s*revenue\b/i, /\uAD6C\uB9E4\s*\uB9E4\uCD9C/i, /\uC774\uBCA4\uD2B8\s*\uB9E4\uCD9C/i],
  },
  {
    metric: "retention_rate",
    views: ["v_latest_appsflyer_cohort_daily"],
    patterns: [/\bretention\b/i, /\uB9AC\uD150\uC158/i, /\uC794\uC874/i],
  },
  {
    metric: "retained_users",
    views: ["v_latest_appsflyer_cohort_daily"],
    patterns: [/\bretained\s*users\b/i, /\uC794\uC874\s*\uC0AC\uC6A9\uC790/i],
  },
  {
    metric: "cohort_size",
    views: ["v_latest_appsflyer_cohort_daily"],
    patterns: [/\bcohort\s*size\b/i, /\uCF54\uD638\uD2B8\s*\uD06C\uAE30/i, /\uCF54\uD638\uD2B8\s*\uADDC\uBAA8/i],
  },
];

const DIMENSION_HINTS: Array<{
  semantic: string;
  patterns: RegExp[];
  views: Partial<Record<string, string>>;
}> = [
  {
    semantic: "source_like",
    patterns: [/\bsource\b/i, /\uC18C\uC2A4/i, /\bmedia\s*source\b/i, /\uB9E4\uCCB4\s*\uC18C\uC2A4/i, /\uBBF8\uB514\uC5B4\s*\uC18C\uC2A4/i],
    views: {
      v_latest_ga4_acquisition_daily: "source",
      v_latest_ga4_engagement_daily: "source",
      v_latest_appsflyer_installs_daily: "media_source",
      v_latest_appsflyer_events_daily: "media_source",
      v_latest_appsflyer_cohort_daily: "media_source",
    },
  },
  {
    semantic: "channel_group",
    patterns: [/\bchannel\s*group\b/i, /\uCC44\uB110\s*\uADF8\uB8F9/i],
    views: {
      v_latest_ga4_acquisition_daily: "channel_group",
      v_latest_ga4_engagement_daily: "channel_group",
    },
  },
  {
    semantic: "medium",
    patterns: [/\bmedium\b/i, /\uB9E4\uCCB4/i],
    views: {
      v_latest_ga4_acquisition_daily: "medium",
      v_latest_ga4_engagement_daily: "medium",
    },
  },
  {
    semantic: "campaign",
    patterns: [/\bcampaign\b/i, /\uCEA0\uD398\uC778/i],
    views: {
      v_latest_appsflyer_installs_daily: "campaign",
      v_latest_appsflyer_events_daily: "campaign",
      v_latest_appsflyer_cohort_daily: "campaign",
    },
  },
  {
    semantic: "event_name",
    patterns: [/\bevent\s*name\b/i, /\uC774\uBCA4\uD2B8\uBA85/i],
    views: {
      v_latest_appsflyer_events_daily: "event_name",
    },
  },
  {
    semantic: "cohort_date",
    patterns: [/\bcohort\s*date\b/i, /\uCF54\uD638\uD2B8\s*\uB0A0\uC9DC/i],
    views: {
      v_latest_appsflyer_cohort_daily: "cohort_date",
    },
  },
  {
    semantic: "cohort_day",
    patterns: [/\bcohort\s*day\b/i, /\uCF54\uD638\uD2B8\s*\uB370\uC774/i, /\uCF54\uD638\uD2B8\s*\uC77C\uCC28/i],
    views: {
      v_latest_appsflyer_cohort_daily: "cohort_day",
    },
  },
];

const FILTER_HINTS: Array<{
  key: string;
  value: string | number;
  patterns: RegExp[];
  views?: string[];
  unlessDimensionSemantic?: string;
}> = [
  {
    key: "event_name",
    value: "purchase",
    patterns: [/\bpurchase\b/i, /\uAD6C\uB9E4/i],
    views: ["v_latest_appsflyer_events_daily"],
    unlessDimensionSemantic: "event_name",
  },
  {
    key: "event_name",
    value: "sign_up",
    patterns: [/\bsign[\s_-]?up\b/i, /\uAC00\uC785/i],
    views: ["v_latest_appsflyer_events_daily"],
    unlessDimensionSemantic: "event_name",
  },
  {
    key: "media_source",
    value: "Google Ads",
    patterns: [/\bgoogle\s*ads\b/i, /\uAD6C\uAE00\s*\uC560\uC988/i, /\uAD6C\uAE00\s*\uAD11\uACE0/i],
    views: [
      "v_latest_appsflyer_installs_daily",
      "v_latest_appsflyer_events_daily",
      "v_latest_appsflyer_cohort_daily",
    ],
  },
  {
    key: "media_source",
    value: "Facebook Ads",
    patterns: [/\bfacebook\s*ads\b/i, /\bmeta\b/i, /\uBA54\uD0C0/i, /\uD398\uC774\uC2A4\uBD81\s*\uC560\uC988/i],
    views: [
      "v_latest_appsflyer_installs_daily",
      "v_latest_appsflyer_events_daily",
      "v_latest_appsflyer_cohort_daily",
    ],
  },
  {
    key: "media_source",
    value: "TikTok Ads",
    patterns: [/\btiktok\s*ads\b/i, /\uD2F1\uD1A1\s*\uC560\uC988/i, /\uD2F1\uD1A1/i],
    views: [
      "v_latest_appsflyer_installs_daily",
      "v_latest_appsflyer_events_daily",
      "v_latest_appsflyer_cohort_daily",
    ],
  },
  {
    key: "cohort_day",
    value: 1,
    patterns: [/\bday\s*1\b/i, /\bd1\b/i, /1\uC77C\uCC28/i, /1\s*day/i],
    views: ["v_latest_appsflyer_cohort_daily"],
  },
  {
    key: "cohort_day",
    value: 7,
    patterns: [/\bday\s*7\b/i, /\bd7\b/i, /7\uC77C\uCC28/i, /7\s*day/i],
    views: ["v_latest_appsflyer_cohort_daily"],
  },
  {
    key: "cohort_day",
    value: 30,
    patterns: [/\bday\s*30\b/i, /\bd30\b/i, /30\uC77C\uCC28/i, /30\s*day/i],
    views: ["v_latest_appsflyer_cohort_daily"],
  },
];

const CHART_PREFERENCE_PATTERNS: Array<{ label: string; patterns: RegExp[] }> = [
  { label: "pie", patterns: [/\bpie\b/i, /\uD30C\uC774\s*\uCC28\uD2B8/i, /\uB3C4\uB11B\s*\uCC28\uD2B8/i, /\uC6D0\uD615\s*\uCC28\uD2B8/i] },
  { label: "line", patterns: [/\bline\b/i, /\uB77C\uC778\s*\uCC28\uD2B8/i, /\uAEBE\uC740\uC120/i] },
  { label: "table", patterns: [/\btable\b/i, /\uD14C\uC774\uBE14/i, /\uD45C\uB85C/i] },
  { label: "bar", patterns: [/\bbar\b/i, /\uBC14\s*\uCC28\uD2B8/i, /\uB9C9\uB300\s*(\uCC28\uD2B8|\uADF8\uB798\uD504)/i] },
  { label: "stackedBar", patterns: [/\bstacked\s*bar\b/i, /\uB204\uC801\s*(\uB9C9\uB300|\uBC14|\uCC28\uD2B8|\uADF8\uB798\uD504)/i] },
];

const SINGLE_KPI_PATTERNS = [
  /\btotal\b/i,
  /\boverall\b/i,
  /\bone\s+number\b/i,
  /\uCD1D\uD569/i,
  /\uD569\uACC4/i,
  /\uC804\uCCB4/i,
  /\uB2E8\uC77C\s*\uAC12/i,
  /\uC22B\uC790\uB9CC/i,
  /\uBA87\s*\uAC74/i,
  /\uBA87\s*\uAC1C/i,
  /\uC5BC\uB9C8/i,
  /\uC54C\uB824\uC918/i,
];

type UnsupportedCategory =
  | "airbridge"
  | "os_platform"
  | "phase_deferred_dimension"
  | "lookback_over_90_days"
  | "raw_row_level"
  | "cross_view_join";

export type FilterHint = { key: string; value: string | number };

export type NormalizedQuestionHint = {
  metrics: string[];
  dimensions: string[];
  dimensionSemantics: string[];
  filters: FilterHint[];
  relativeDateHint: string | null;
  chartPreference: string | null;
  singleKpi: boolean;
};

export type QuestionPreprocessResult = {
  originalQuestion: string;
  agentInputText: string;
  likelyView?: string;
  normalized?: NormalizedQuestionHint;
  unsupported?: {
    category: UnsupportedCategory;
    code: "UNSUPPORTED_METRIC";
    message: string;
  };
};

export function preprocessQuestion(question: string): QuestionPreprocessResult {
  const shared = getSharedSchemaConfig();
  const likelyViews = detectLikelyViews(question);
  const likelyView = likelyViews.length === 1 ? likelyViews[0] : undefined;
  const normalized = likelyView ? normalizeQuestion(question, likelyView) : undefined;

  const unsupported = detectUnsupportedQuestion(
    question,
    likelyViews,
    shared.maxLookbackDays,
    normalized?.dimensionSemantics ?? []
  );
  if (unsupported) {
    return {
      originalQuestion: question,
      agentInputText: question,
      likelyView,
      unsupported,
      normalized,
    };
  }

  return {
    originalQuestion: question,
    agentInputText: buildAgentInputText(question, likelyView, shared, normalized),
    likelyView,
    normalized,
  };
}

export function normalizeNoTableCompletion(
  question: string,
  agentSummary: string
): { code: "UNSUPPORTED_METRIC"; message: string } | null {
  const analysis = preprocessQuestion(question);
  if (analysis.unsupported) {
    return {
      code: analysis.unsupported.code,
      message: analysis.unsupported.message,
    };
  }
  if (!looksLikeSchemaAskback(agentSummary)) {
    return null;
  }

  const dateColumn = getSharedSchemaConfig().dateColumn;
  if (analysis.likelyView) {
    const label = FRIENDLY_VIEW_LABELS[analysis.likelyView] ?? analysis.likelyView;
    return {
      code: "UNSUPPORTED_METRIC",
      message:
        `\uC774 \uC694\uCCAD\uC740 \uD604\uC7AC \uD5C8\uC6A9\uB41C ${label} curated schema\uB85C \uCC98\uB9AC\uD574\uC57C \uD569\uB2C8\uB2E4. ` +
        `\uB0A0\uC9DC\uB294 \uB0B4\uBD80\uC801\uC73C\uB85C ${dateColumn} \uCEEC\uB7FC\uC744 \uC0AC\uC6A9\uD558\uBBC0\uB85C \uC0AC\uC6A9\uC790\uAC00 \uCEEC\uB7FC\uBA85\uC744 \uC9C0\uC815\uD560 \uD544\uC694\uB294 \uC5C6\uC2B5\uB2C8\uB2E4. ` +
        "\uC774\uBC88 \uC751\uB2F5\uC740 \uC5D0\uC774\uC804\uD2B8\uAC00 \uB0B4\uBD80 \uC2A4\uD0A4\uB9C8 \uD574\uC11D\uC5D0 \uC2E4\uD328\uD55C \uACBD\uC6B0\uC785\uB2C8\uB2E4.",
    };
  }

  return {
    code: "UNSUPPORTED_METRIC",
    message:
      `\uD604\uC7AC \uD5C8\uC6A9\uB41C curated schema\uC5D0\uC11C\uB294 \uB0A0\uC9DC \uCEEC\uB7FC\uC744 \uB0B4\uBD80\uC801\uC73C\uB85C ${dateColumn}\uB85C \uC0AC\uC6A9\uD569\uB2C8\uB2E4. ` +
      "\uC0AC\uC6A9\uC790\uAC00 \uCEEC\uB7FC\uBA85\uC744 \uC9C0\uC815\uD560 \uD544\uC694\uB294 \uC5C6\uC2B5\uB2C8\uB2E4.",
  };
}

function buildAgentInputText(
  question: string,
  likelyView: string | undefined,
  shared: ReturnType<typeof getSharedSchemaConfig>,
  normalized?: NormalizedQuestionHint
): string {
  const lines = [
    "You are a curated marketing reporting agent.",
    `Today's date in Asia/Seoul is ${getTodayInSeoul()}.`,
    `Use only one allowed view. The internal date column is always '${shared.dateColumn}'.`,
    "Never ask the user for internal schema details, column names, or date column names.",
    "For relative-date questions, anchor the date range to the latest available dt in the chosen view, not to the wall-clock date.",
    `Requests outside the curated schema, over ${shared.maxLookbackDays} days, raw row-level access, or cross-view joins must be refused briefly.`,
    `Allowed views: ${shared.allowedViews.join(", ")}.`,
  ];

  if (likelyView && normalized) {
    const schema = shared.views[likelyView];
    lines.push(formatViewGuidance(schema));
    lines.push(
      "Stay on the best-fit view and metric family unless the user explicitly asks for a different supported view."
    );
    lines.push(
      "If a relative-date query returns zero rows, retry once with the latest available completed period for the same view before answering."
    );
    lines.push(
      "If the request includes a required filter, preserve it exactly. Do not widen the query to other values."
    );
    if (normalized.singleKpi) {
      lines.push(
        "This is a single KPI request. Return one aggregated row with dt and the requested metric. Do not group by dimension columns."
      );
    }
    if (normalized.filters.some((filter) => filter.key === "event_name")) {
      lines.push(
        "When event_name is provided as a filter, keep event_name in WHERE. Do not convert it into a grouping dimension unless the user explicitly asked for event_name breakdown."
      );
    }
    if (likelyView === "v_latest_appsflyer_cohort_daily") {
      lines.push(
        "For retention questions, prefer the derived metric retention_rate = SUM(retained_users) / NULLIF(SUM(cohort_size), 0)."
      );
      lines.push("If the aggregated retention query returns no rows, answer no-data without fabricating null rows or a chart.");
    }
    for (const hint of buildNormalizedRequestHints(likelyView, normalized)) {
      lines.push(hint);
    }
  }

  lines.push(`User question: ${question}`);
  return lines.join("\n");
}

function formatViewGuidance(schema: ViewSchema): string {
  const derived = schema.derivedMetrics.length > 0 ? `; derived metrics: ${schema.derivedMetrics.join(", ")}` : "";
  const deferred =
    schema.phaseDeferred.length > 0
      ? `; not supported right now: ${schema.phaseDeferred.join(", ")}`
      : "";
  return (
    `Best-fit view: ${schema.view} (${schema.source}). ` +
    `Allowed dimensions: ${schema.dimensions.join(", ")}. ` +
    `Allowed metrics: ${schema.metrics.join(", ")}${derived}${deferred}.`
  );
}

function buildNormalizedRequestHints(likelyView: string, normalized: NormalizedQuestionHint): string[] {
  const hints: string[] = [];
  const requestContractParts: string[] = [`view=${likelyView}`];

  if (normalized.metrics.length > 0) {
    hints.push(`Normalized metrics for this question: ${normalized.metrics.join(", ")}.`);
    requestContractParts.push(`metrics=${normalized.metrics.join("|")}`);
  }
  if (normalized.dimensions.length > 0) {
    hints.push(`Normalized dimensions for this question: ${normalized.dimensions.join(", ")}.`);
    requestContractParts.push(`dimensions=${normalized.dimensions.join("|")}`);
  }
  if (normalized.filters.length > 0) {
    const rendered = normalized.filters.map((filter) => renderFilterHint(filter));
    hints.push(`Required filters for this question: ${rendered.join(", ")}.`);
    requestContractParts.push(`filters=${rendered.join("|")}`);
  }
  if (normalized.relativeDateHint) {
    hints.push(normalized.relativeDateHint);
    requestContractParts.push(`relative_date=${normalized.relativeDateHint}`);
  }
  if (normalized.chartPreference) {
    hints.push(`Preferred chart type from the user request: ${normalized.chartPreference}.`);
    requestContractParts.push(`chart=${normalized.chartPreference}`);
  }
  if (normalized.singleKpi) {
    hints.push("Result shape requirement: single KPI. Keep dt in the output and avoid grouped breakdowns.");
    requestContractParts.push("single_kpi=true");
  }
  if (requestContractParts.length > 1) {
    hints.push(`Resolved request contract: ${requestContractParts.join("; ")}.`);
  }
  return hints;
}

function normalizeQuestion(question: string, likelyView: string): NormalizedQuestionHint {
  const metrics = uniqueStrings(detectMetricHints(question, likelyView));
  const dimensions = detectDimensionHints(question, likelyView);
  const filters = detectFilterHints(question, likelyView, dimensions.semantics);
  return {
    metrics,
    dimensions: dimensions.columns,
    dimensionSemantics: dimensions.semantics,
    filters,
    relativeDateHint: detectRelativeDateHint(question),
    chartPreference: detectChartPreference(question),
    singleKpi: detectSingleKpiIntent(question, metrics, dimensions.columns),
  };
}

function detectLikelyViews(question: string): string[] {
  const scores = VIEW_PATTERNS.map((entry) => ({
    view: entry.view,
    score: entry.patterns.filter((pattern) => pattern.test(question)).length,
  })).filter((entry) => entry.score > 0);
  if (scores.length === 0) {
    return [];
  }
  const bestScore = Math.max(...scores.map((entry) => entry.score));
  return scores.filter((entry) => entry.score === bestScore).map((entry) => entry.view);
}

function detectUnsupportedQuestion(
  question: string,
  likelyViews: string[],
  maxLookbackDays: number,
  dimensionSemantics: string[]
): QuestionPreprocessResult["unsupported"] {
  if (matchesAny(question, AIRBRIDGE_PATTERNS)) {
    return unsupported(
      "airbridge",
      "\uD604\uC7AC \uC11C\uBE44\uC2A4\uB294 Airbridge \uB370\uC774\uD130\uAC00 \uC544\uB2C8\uB77C \uD5C8\uC6A9\uB41C GA4 / AppsFlyer curated view\uB9CC \uC9C0\uC6D0\uD569\uB2C8\uB2E4."
    );
  }

  if (matchesAny(question, RAW_ROW_LEVEL_PATTERNS)) {
    return unsupported(
      "raw_row_level",
      "\uD604\uC7AC \uC11C\uBE44\uC2A4\uB294 \uC9D1\uACC4 \uB9AC\uD3EC\uD2B8 \uC804\uC6A9\uC774\uBA70 raw row-level \uB370\uC774\uD130\uB098 \uC0AC\uC6A9\uC790 \uBAA9\uB85D \uC870\uD68C\uB294 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4."
    );
  }

  if (isCrossViewQuestion(question, likelyViews)) {
    return unsupported(
      "cross_view_join",
      "\uD604\uC7AC \uC11C\uBE44\uC2A4\uB294 \uD55C \uBC88\uC5D0 \uD558\uB098\uC758 curated view\uB9CC \uC9C8\uC758\uD560 \uC218 \uC788\uC5B4 \uC11C\uB85C \uB2E4\uB978 \uBDF0\uB97C \uACB0\uD569\uD558\uB294 \uC9C8\uBB38\uC740 \uC544\uC9C1 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4."
    );
  }

  if (matchesAny(question, OS_PLATFORM_PATTERNS)) {
    return unsupported(
      "os_platform",
      "\uD604\uC7AC \uD5C8\uC6A9\uB41C curated schema\uC5D0\uB294 OS / platform \uCC28\uC6D0\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. OS\uBCC4 \uBD84\uC11D\uC740 \uC544\uC9C1 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4."
    );
  }

  const deferred = detectDeferredDimension(question, dimensionSemantics);
  if (deferred) {
    return unsupported(
      "phase_deferred_dimension",
      `\uD604\uC7AC curated schema\uC5D0\uC11C\uB294 ${deferred.label} \uCC28\uC6D0\uC744 \uC544\uC9C1 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.`
    );
  }

  if (exceedsLookback(question, maxLookbackDays)) {
    return unsupported(
      "lookback_over_90_days",
      `\uD604\uC7AC \uC11C\uBE44\uC2A4\uB294 \uCD5C\uADFC ${maxLookbackDays}\uC77C \uC774\uB0B4 \uAE30\uAC04\uB9CC \uC9C0\uC6D0\uD569\uB2C8\uB2E4.`
    );
  }

  return undefined;
}

function unsupported(
  category: UnsupportedCategory,
  message: string
): QuestionPreprocessResult["unsupported"] {
  return {
    category,
    code: "UNSUPPORTED_METRIC",
    message,
  };
}

function detectDeferredDimension(
  question: string,
  dimensionSemantics: string[]
): { column: string; label: string } | null {
  for (const entry of DEFERRED_DIMENSION_PATTERNS) {
    if (entry.column === "channel" && dimensionSemantics.includes("channel_group")) {
      continue;
    }
    if (matchesAny(question, entry.patterns)) {
      return { column: entry.column, label: entry.label };
    }
  }
  return null;
}

function isCrossViewQuestion(question: string, likelyViews: string[]): boolean {
  if (likelyViews.length > 1) {
    return true;
  }
  return matchesAny(question, CROSS_VIEW_SOURCE_PATTERNS);
}

function exceedsLookback(question: string, maxLookbackDays: number): boolean {
  for (const match of question.matchAll(/(\d+)\s*(\uC77C|days?)/gi)) {
    if (Number(match[1]) > maxLookbackDays) {
      return true;
    }
  }
  for (const match of question.matchAll(/(\d+)\s*(\uC8FC|weeks?)/gi)) {
    if (Number(match[1]) * 7 > maxLookbackDays) {
      return true;
    }
  }
  for (const match of question.matchAll(/(\d+)\s*(\uAC1C\uC6D4|\uB2EC|months?)/gi)) {
    if (Number(match[1]) * 30 > maxLookbackDays) {
      return true;
    }
  }
  return /\uBC18\uB144|six\s*months/i.test(question);
}

function looksLikeSchemaAskback(text: string): boolean {
  return matchesAny(text, SCHEMA_ASKBACK_PATTERNS);
}

function matchesAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function detectMetricHints(question: string, likelyView: string): string[] {
  return METRIC_HINTS.filter(
    (entry) => entry.views.includes(likelyView) && matchesAny(question, entry.patterns)
  ).map((entry) => entry.metric);
}

function detectDimensionHints(
  question: string,
  likelyView: string
): { columns: string[]; semantics: string[] } {
  const matches = DIMENSION_HINTS.flatMap((entry) => {
    const dimension = entry.views[likelyView];
    if (!dimension || !matchesAny(question, entry.patterns)) {
      return [];
    }
    return [{ column: dimension, semantic: entry.semantic }];
  });

  return {
    columns: uniqueStrings(matches.map((entry) => entry.column)),
    semantics: uniqueStrings(matches.map((entry) => entry.semantic)),
  };
}

function detectFilterHints(
  question: string,
  likelyView: string,
  dimensionSemantics: string[]
): FilterHint[] {
  return FILTER_HINTS.flatMap((entry) => {
    if (entry.views && !entry.views.includes(likelyView)) {
      return [];
    }
    if (entry.unlessDimensionSemantic && dimensionSemantics.includes(entry.unlessDimensionSemantic)) {
      return [];
    }
    if (!matchesAny(question, entry.patterns)) {
      return [];
    }
    return [{ key: entry.key, value: entry.value }];
  }).filter(
    (entry, index, array) =>
      array.findIndex((candidate) => candidate.key === entry.key && candidate.value === entry.value) === index
  );
}

function detectSingleKpiIntent(question: string, metrics: string[], dimensions: string[]): boolean {
  if (/(\uCD94\uC774|trend|\uBE44\uC911|share|\uAD6C\uC131|composition|\uBE44\uAD50|compare|top|rank|\uC21C\uC704)/i.test(question)) {
    return false;
  }
  if (dimensions.length > 0) {
    return false;
  }
  if (metrics.length > 1) {
    return false;
  }
  if (/(\uCD5C\uC2E0\s*(\uB0A0\uC9DC|\uC9D1\uACC4\uC77C)|\uCD5C\uADFC\s*\uC9D1\uACC4\uC77C|today|single\s*day|\b\d{4}-\d{2}-\d{2}\b)/i.test(question)) {
    return true;
  }
  return matchesAny(question, SINGLE_KPI_PATTERNS);
}

function detectRelativeDateHint(question: string): string | null {
  if (/\uC9C0\uB09C\uC8FC/i.test(question)) {
    return "Use the latest available completed 7-day window in the chosen view for '\uC9C0\uB09C\uC8FC'. Do not anchor '\uC9C0\uB09C\uC8FC' to today's calendar week.";
  }
  if (/\uCD5C\uADFC\s*4\uC8FC/i.test(question) || /last\s*4\s*weeks?/i.test(question)) {
    return "Use the latest available 28-day window ending at MAX(dt) in the chosen view for 'recent 4 weeks'.";
  }
  if (/\uC9C0\uB09C\uB2EC/i.test(question) || /last\s*month/i.test(question)) {
    return "Use the latest available full month in the chosen view for 'last month'.";
  }
  if (/\uCD5C\uC2E0\s*(\uB0A0\uC9DC|\uC9D1\uACC4\uC77C)|\uCD5C\uADFC\s*\uC9D1\uACC4\uC77C/i.test(question)) {
    return "Use MAX(dt) in the chosen view for 'latest reporting day'.";
  }
  return null;
}

function detectChartPreference(question: string): string | null {
  for (const entry of CHART_PREFERENCE_PATTERNS) {
    if (matchesAny(question, entry.patterns)) {
      return entry.label;
    }
  }
  return null;
}

function renderFilterHint(filter: FilterHint): string {
  if (typeof filter.value === "number") {
    return `${filter.key}=${filter.value}`;
  }
  return `${filter.key}='${filter.value}'`;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function getTodayInSeoul(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
