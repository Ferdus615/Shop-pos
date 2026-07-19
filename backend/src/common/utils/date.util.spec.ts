import { formatDay, parseDayRange, parseMonthRange } from './date.util';

/**
 * These tests assert that report boundaries follow the Asia/Dhaka (UTC+6)
 * business day. Because the fix anchors boundaries to the business zone rather
 * than the process zone, the expected instants below hold regardless of the
 * server's TZ — which is exactly the bug that was fixed. Run under TZ=UTC to
 * reproduce the original (broken) deployment scenario.
 */
describe('date.util (Asia/Dhaka boundaries, server-TZ independent)', () => {
  describe('parseDayRange', () => {
    it('maps a Dhaka day to the correct UTC instants', () => {
      const { start, end, day } = parseDayRange('2026-07-19');
      expect(start.toISOString()).toBe('2026-07-18T18:00:00.000Z');
      expect(end.toISOString()).toBe('2026-07-19T17:59:59.999Z');
      expect(day).toBe('2026-07-19');
    });

    it('includes an order placed just after midnight Dhaka time', () => {
      const { start, end } = parseDayRange('2026-07-19');
      // 00:30 Dhaka on the 19th === 18:30Z on the 18th.
      const order = new Date('2026-07-18T18:30:00.000Z');
      expect(order >= start && order <= end).toBe(true);
    });

    it('excludes an order from the previous Dhaka day', () => {
      const { start } = parseDayRange('2026-07-19');
      // 23:30 Dhaka on the 18th === 17:30Z on the 18th, before the window.
      const order = new Date('2026-07-18T17:30:00.000Z');
      expect(order < start).toBe(true);
    });

    it('rejects malformed dates', () => {
      expect(() => parseDayRange('19-07-2026')).toThrow();
    });
  });

  describe('parseMonthRange', () => {
    it('maps a Dhaka month to the correct UTC instants', () => {
      const { start, end, month } = parseMonthRange('2026-07');
      expect(start.toISOString()).toBe('2026-06-30T18:00:00.000Z');
      expect(end.toISOString()).toBe('2026-07-31T17:59:59.999Z');
      expect(month).toBe('2026-07');
    });

    it('handles February (28-day month)', () => {
      const { start, end } = parseMonthRange('2026-02');
      expect(start.toISOString()).toBe('2026-01-31T18:00:00.000Z');
      expect(end.toISOString()).toBe('2026-02-28T17:59:59.999Z');
    });
  });

  describe('formatDay', () => {
    it('reports the Dhaka calendar day, not the UTC day', () => {
      // 20:00Z is 02:00 the next day in Dhaka.
      expect(formatDay(new Date('2026-07-19T20:00:00.000Z'))).toBe('2026-07-20');
    });
  });
});
