interface WeekRangeLike {
  start: string;
  end: string;
  label: string;
}

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatMonthDay(value: string): string | null {
  const parsed = parseIsoDate(value);
  if (!parsed) {
    return null;
  }

  return `${parsed.getMonth() + 1}/${parsed.getDate()}`;
}

export function formatWeekRangeLabel(range: WeekRangeLike): string {
  const label = range.label.trim();
  const start = formatMonthDay(range.start);
  const end = formatMonthDay(range.end);

  if (label && start && end) {
    return `${label} (${start} ~ ${end})`;
  }

  if (label) {
    return label;
  }

  if (start && end) {
    return `${start} ~ ${end}`;
  }

  return "-";
}
