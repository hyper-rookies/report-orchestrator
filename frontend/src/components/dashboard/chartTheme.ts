function cssVar(name: string, fallback: string): string {
  return `var(${name}, ${fallback})`;
}

export const CHART_GRID_STROKE = cssVar("--border", "#d8dde2");
export const CHART_TEXT_COLOR = cssVar("--foreground", "#191919");
export const CHART_SURFACE_COLOR = cssVar("--card", "#ffffff");
export const CHART_SERIES_1 = cssVar("--chart-1", "#191919");
export const CHART_SERIES_2 = cssVar("--chart-2", "#1d8844");
export const CHART_SERIES_3 = cssVar("--chart-3", "#d41f4c");
export const CHART_SERIES_4 = cssVar("--chart-4", "#ebb528");
export const CHART_SERIES_5 = cssVar("--chart-5", "#abb0b1");

export const CHANNEL_PALETTE = [
  CHART_SERIES_1,
  CHART_SERIES_2,
  CHART_SERIES_3,
  CHART_SERIES_4,
  CHART_SERIES_5,
  "#2563EB",
  "#14B8A6",
  "#6D28D9",
  "#EA580C",
  "#4B5563",
] as const;

const CHANNEL_COLOR_OVERRIDES: Record<string, string> = {
  organic: CHANNEL_PALETTE[0],
  "organic search": CHANNEL_PALETTE[0],
  direct: CHANNEL_PALETTE[1],
  referral: CHANNEL_PALETTE[2],
  email: CHANNEL_PALETTE[3],
  social: CHANNEL_PALETTE[4],
  "paid search": CHANNEL_PALETTE[5],
  "google ads": CHANNEL_PALETTE[5],
  "facebook ads": CHANNEL_PALETTE[6],
  "apple search ads": CHANNEL_PALETTE[7],
  display: CHANNEL_PALETTE[8],
  other: CHANNEL_PALETTE[9],
  unknown: CHANNEL_PALETTE[9],
};

function normalizeCategoryKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function getCategoryColor(category: string): string {
  const normalized = normalizeCategoryKey(category || "unknown");

  let hash = 0;
  for (const char of normalized) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return CHANNEL_PALETTE[hash % CHANNEL_PALETTE.length];
}

export function getChannelColor(channel: string): string {
  const normalized = normalizeCategoryKey(channel || "unknown");
  const overridden = CHANNEL_COLOR_OVERRIDES[normalized];

  if (overridden) {
    return overridden;
  }

  return getCategoryColor(normalized);
}

export const CHART_TICK_STYLE = {
  fontSize: 11,
  fill: CHART_TEXT_COLOR,
} as const;

export const CHART_TICK_STYLE_SMALL = {
  fontSize: 10,
  fill: CHART_TEXT_COLOR,
} as const;

export const CHART_AXIS_LINE_STYLE = {
  stroke: CHART_GRID_STROKE,
} as const;

export const CHART_TICK_LINE_STYLE = {
  stroke: CHART_GRID_STROKE,
} as const;

export const CHART_LEGEND_STYLE = {
  color: CHART_TEXT_COLOR,
  fontSize: 12,
} as const;

export const CHART_AXIS_LABEL_STYLE = {
  fill: CHART_TEXT_COLOR,
  fontSize: 12,
  fontWeight: 600,
} as const;

export const CHART_TOOLTIP_STYLE = {
  borderRadius: 12,
  border: `1px solid ${CHART_GRID_STROKE}`,
  backgroundColor: CHART_SURFACE_COLOR,
  color: CHART_TEXT_COLOR,
} as const;
