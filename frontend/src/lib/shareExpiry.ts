export const SHARE_EXPIRY_TIME_ZONE = "Asia/Seoul";
export const SHARE_EXPIRY_TIME_ZONE_LABEL = "UTC+09:00 (Asia/Seoul)";
export const SHARE_EXPIRY_FALLBACK_LABEL = "만료 시각 확인 불가";

const SHARE_EXPIRY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: SHARE_EXPIRY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function getFormatterPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((part) => part.type === type)?.value ?? "00";
}

export function parseShareExpiry(expiresAt: string | null | undefined): Date | null {
  if (typeof expiresAt !== "string" || expiresAt.trim().length === 0) {
    return null;
  }

  const parsed = new Date(expiresAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isShareLinkReusable(
  expiresAt: string | null | undefined,
  now = Date.now()
): boolean {
  const parsed = parseShareExpiry(expiresAt);
  return parsed !== null && parsed.getTime() > now;
}

export function formatShareExpiry(expiresAt: string | null | undefined): string {
  const parsed = parseShareExpiry(expiresAt);
  if (!parsed) {
    return SHARE_EXPIRY_FALLBACK_LABEL;
  }

  const parts = SHARE_EXPIRY_FORMATTER.formatToParts(parsed);
  const year = getFormatterPart(parts, "year");
  const month = getFormatterPart(parts, "month");
  const day = getFormatterPart(parts, "day");
  const hour = getFormatterPart(parts, "hour");
  const minute = getFormatterPart(parts, "minute");
  const second = getFormatterPart(parts, "second");

  return `${year}-${month}-${day} ${hour}:${minute}:${second} ${SHARE_EXPIRY_TIME_ZONE_LABEL}`;
}
