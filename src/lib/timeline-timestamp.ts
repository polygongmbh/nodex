import { differenceInCalendarDays, differenceInMonths } from "date-fns";

function formatTime(date: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatShortDate(date: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
  }).format(date);
}

function formatMonthDay(date: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatYesterday(date: Date, locale?: string): string {
  const yesterdayLabel = new Intl.RelativeTimeFormat(locale, {
    numeric: "auto",
  }).format(-1, "day");
  return `${yesterdayLabel} ${formatTime(date, locale)}`;
}

export function formatTimelineTimestamp(date: Date, locale?: string, now: Date = new Date()): string {
  const calendarDayDelta = differenceInCalendarDays(now, date);
  const monthDelta = differenceInMonths(now, date);

  if (calendarDayDelta <= 0) {
    return formatTime(date, locale);
  }
  if (calendarDayDelta === 1) {
    return formatYesterday(date, locale);
  }
  if (monthDelta >= 10) {
    return formatShortDate(date, locale);
  }
  return formatMonthDay(date, locale);
}
