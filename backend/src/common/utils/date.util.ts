import { BadRequestException } from '@nestjs/common';

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

export function formatDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatMonth(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

/**
 * Resolve a YYYY-MM-DD string (or today, if omitted) into a local-time
 * start/end-of-day range for querying.
 */
export function parseDayRange(day?: string): DayRange {
  let base: Date;
  if (day) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      throw new BadRequestException('date must be in YYYY-MM-DD format');
    }
    base = new Date(`${day}T00:00:00`);
  } else {
    base = new Date();
  }

  if (Number.isNaN(base.getTime())) {
    throw new BadRequestException('Invalid date');
  }

  const start = new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    0,
    0,
    0,
    0,
  );
  const end = new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    23,
    59,
    59,
    999,
  );
  return { start, end, day: formatDay(start) };
}

/**
 * Resolve a YYYY-MM string (or the current month, if omitted) into a
 * local-time start/end-of-month range for querying.
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
    const now = new Date();
    year = now.getFullYear();
    monthIndex = now.getMonth();
  }

  const start = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999); // day 0 = last day of prev month
  return { start, end, month: formatMonth(start) };
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
