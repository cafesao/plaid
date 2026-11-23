import { Calendar } from './calendar';
import { DateRange } from '../model/date-range';

describe('Calendar', () => {
  describe('months', () => {
    it('should have 12 months', () => {
      expect(Calendar.months).toHaveLength(12);
    });

    it('should start with January and end with December', () => {
      expect(Calendar.months[0]).toBe('January');
      expect(Calendar.months[11]).toBe('December');
    });
  });

  describe('monthsShort', () => {
    it('should have 12 short month names', () => {
      expect(Calendar.monthsShort).toHaveLength(12);
    });

    it('should have 3-letter abbreviations', () => {
      for (const m of Calendar.monthsShort) {
        expect(m).toHaveLength(3);
      }
    });
  });

  describe('weekdays', () => {
    it('should have 7 weekdays starting with Sunday', () => {
      expect(Calendar.weekdays).toHaveLength(7);
      expect(Calendar.weekdays[0]).toBe('Sunday');
      expect(Calendar.weekdays[6]).toBe('Saturday');
    });
  });

  describe('weekdaysShort', () => {
    it('should have 7 short weekday names', () => {
      expect(Calendar.weekdaysShort).toHaveLength(7);
      expect(Calendar.weekdaysShort[0]).toBe('Sun');
      expect(Calendar.weekdaysShort[6]).toBe('Sat');
    });
  });

  describe('getDaysOfMonth', () => {
    it('should return weeks of 7 days each', () => {
      const month = new Date(2024, 0, 1); // January 2024
      const weeks = Calendar.getDaysOfMonth(month);
      for (const week of weeks) {
        expect(week).toHaveLength(7);
      }
    });

    it('should contain all days of the month', () => {
      const month = new Date(2024, 0, 1); // January 2024 (31 days)
      const weeks = Calendar.getDaysOfMonth(month);
      const allDays = weeks.flat();
      // All 31 days of January should be present
      for (let d = 1; d <= 31; d++) {
        expect(allDays.some(date =>
          date.getFullYear() === 2024 && date.getMonth() === 0 && date.getDate() === d
        )).toBe(true);
      }
    });

    it('should pad first week with days from previous month', () => {
      // January 2024 starts on Monday (day 1)
      const month = new Date(2024, 0, 1);
      const weeks = Calendar.getDaysOfMonth(month);
      // First element of first week should be Sunday Dec 31 2023
      expect(weeks[0][0].getMonth()).toBe(11); // December
      expect(weeks[0][0].getDate()).toBe(31);
    });

    it('should handle February in a leap year', () => {
      const month = new Date(2024, 1, 1); // February 2024 (leap year, 29 days)
      const weeks = Calendar.getDaysOfMonth(month);
      const allDays = weeks.flat();
      expect(allDays.some(date =>
        date.getFullYear() === 2024 && date.getMonth() === 1 && date.getDate() === 29
      )).toBe(true);
    });

    it('should handle February in a non-leap year', () => {
      const month = new Date(2023, 1, 1); // February 2023 (28 days)
      const weeks = Calendar.getDaysOfMonth(month);
      const allDays = weeks.flat();
      expect(allDays.some(date =>
        date.getFullYear() === 2023 && date.getMonth() === 1 && date.getDate() === 28
      )).toBe(true);
      // Day 29 should NOT be in February
      expect(allDays.some(date =>
        date.getMonth() === 1 && date.getDate() === 29
      )).toBe(false);
    });

    it('should handle a month starting on Sunday', () => {
      // September 2024 starts on Sunday
      const month = new Date(2024, 8, 1);
      const weeks = Calendar.getDaysOfMonth(month);
      expect(weeks[0][0].getDate()).toBe(1);
      expect(weeks[0][0].getMonth()).toBe(8);
    });
  });

  describe('copyDateRange', () => {
    it('should return a new DateRange with the same dates', () => {
      const original: DateRange = {
        start: new Date(2024, 0, 1),
        end: new Date(2024, 0, 7)
      };
      const copy = Calendar.copyDateRange(original);
      expect(copy.start.getTime()).toBe(original.start.getTime());
      expect(copy.end.getTime()).toBe(original.end.getTime());
    });

    it('should return independent copies (not references)', () => {
      const original: DateRange = {
        start: new Date(2024, 0, 1),
        end: new Date(2024, 0, 7)
      };
      const copy = Calendar.copyDateRange(original);
      copy.start.setFullYear(2000);
      copy.end.setFullYear(2000);
      expect(original.start.getFullYear()).toBe(2024);
      expect(original.end.getFullYear()).toBe(2024);
    });
  });
});
