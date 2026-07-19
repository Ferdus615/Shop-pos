import { BadRequestException } from '@nestjs/common';

/**
 * Business timezone for all reporting boundaries.
 *
 * The server may run in UTC, but sales/expense reports must be bucketed by the
 * shop's local calendar day/month (Asia/Dhaka). Every helper here derives its
 * boundaries in this zone regardless of the process `TZ`, so a report for
 * "2026-07-19" spans the Dhaka business day, not the server's UTC day.
 *
 * Override with the APP_TIMEZONE env var if the shop relocates.
 */
export const APP_TIME_ZONE = process.env.APP_TIMEZONE?.trim() || 'Asia/Dhaka';

export interface DayRange {
  start: Date;
  end: Date;
  day: string; // YYYY-MM-DD
}

export interface MonthRange {
  start: Date;
  end: Date;
  month: string; // YYYY-MM
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

/** Calendar-date parts (in APP_TIME_ZONE) for a given instant. */
function zonedParts(date: Date): {
  year: number;
  month: number; // 1-12
  day: number;
} {
  // 'en-CA' formats as YYYY-MM-DD, which parses cleanly.
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  const [year, month, day] = formatted.split('-').map(Number);
  return { year, month, day };
}

/**
 * Offset (in ms) to add to a UTC instant to get APP_TIME_ZONE wall-clock time,
 * evaluated at `date`. For fixed-offset zones (e.g. Asia/Dhaka, +06:00, no DST)
 * this is constant; for DST zones it reflects the offset in effect at `date`.
 */
function zoneOffsetMs(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);

  const map: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = Number(part.value);
    }
  }

  const asUtc = Date.UTC(
    map.year,
    map.month - 1,
    map.day,
    map.hour % 24,
    map.minute,
    map.second,
  );
  // Wall-clock-as-UTC minus the true instant (seconds resolution) = offset.
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Absolute instant for a wall-clock time in APP_TIME_ZONE. Given calendar
 * fields as they read on a Dhaka clock, returns the corresponding UTC Date.
 */
function zonedTimeToInstant(
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms: number,
): Date {
  const naiveUtc = Date.UTC(year, monthIndex, day, hour, minute, second, ms);
  // Offset at the approximate instant; exact for fixed-offset zones.
  const offset = zoneOffsetMs(new Date(naiveUtc));
  return new Date(naiveUtc - offset);
}

/** Format an instant as YYYY-MM-DD in APP_TIME_ZONE. */
export function formatDay(date: Date): string {
  const { year, month, day } = zonedParts(date);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Format an instant as YYYY-MM in APP_TIME_ZONE. */
export function formatMonth(date: Date): string {
  const { year, month } = zonedParts(date);
  return `${year}-${pad(month)}`;
}

/**
 * Resolve a YYYY-MM-DD string (or today, if omitted) into the start/end
 * instants of that calendar day in APP_TIME_ZONE.
 */
export function parseDayRange(day?: string): DayRange {
  let year: number;
  let monthIndex: number;
  let date: number;

  if (day) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      throw new BadRequestException('date must be in YYYY-MM-DD format');
    }
    const [y, m, d] = day.split('-').map(Number);
    if (m < 1 || m > 12 || d < 1 || d > 31) {
      throw new BadRequestException('Invalid date');
    }
    year = y;
    monthIndex = m - 1;
    date = d;
  } else {
    const parts = zonedParts(new Date());
    year = parts.year;
    monthIndex = parts.month - 1;
    date = parts.day;
  }

  const start = zonedTimeToInstant(year, monthIndex, date, 0, 0, 0, 0);
  const end = zonedTimeToInstant(year, monthIndex, date, 23, 59, 59, 999);
  return { start, end, day: formatDay(start) };
}

/**
 * Resolve a YYYY-MM string (or the current month, if omitted) into the
 * start/end instants of that calendar month in APP_TIME_ZONE.
 */
export function parseMonthRange(month?: string): MonthRange {
  let year: number;
  let monthIndex: number;

  if (month) {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new BadRequestException('month must be in YYYY-MM format');
    }
    const [y, m] = month.split('-').map(Number);
    if (m < 1 || m > 12) {
      throw new BadRequestException('month must be between 01 and 12');
    }
    year = y;
    monthIndex = m - 1;
  } else {
    const parts = zonedParts(new Date());
    year = parts.year;
    monthIndex = parts.month - 1;
  }

  // Day 0 of the next month = last day of this month (UTC math, tz-agnostic).
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

  const start = zonedTimeToInstant(year, monthIndex, 1, 0, 0, 0, 0);
  const end = zonedTimeToInstant(year, monthIndex, lastDay, 23, 59, 59, 999);
  return { start, end, month: formatMonth(start) };
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
