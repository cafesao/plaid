import {Format} from './format';

describe('Format', () => {
  describe('timePeriod', () => {
    it('should format hours only', () => {
      expect(Format.timePeriod(3600)).toBe('1h ');
    });

    it('should format minutes only', () => {
      expect(Format.timePeriod(300)).toBe('5m ');
    });

    it('should format seconds only', () => {
      expect(Format.timePeriod(45)).toBe('45s');
    });

    it('should format hours and minutes', () => {
      expect(Format.timePeriod(5400)).toBe('1h 30m ');
    });

    it('should format hours, minutes, and seconds', () => {
      expect(Format.timePeriod(3661)).toBe('1h 1m 1s');
    });

    it('should return empty string for zero', () => {
      expect(Format.timePeriod(0)).toBe('');
    });

    it('should handle large values', () => {
      expect(Format.timePeriod(86400)).toBe('24h ');
    });
  });

  describe('date', () => {
    it('should format a date using en-US locale', () => {
      const date = new Date(2024, 0, 15); // Jan 15, 2024
      const result = Format.date(date);
      expect(result).toBe('Jan 15, 2024');
    });

    it('should format different months correctly', () => {
      const date = new Date(2024, 11, 25); // Dec 25, 2024
      const result = Format.date(date);
      expect(result).toBe('Dec 25, 2024');
    });
  });

  describe('dateRange', () => {
    it('should format a single day range', () => {
      const date = new Date(2024, 0, 15);
      const result = Format.dateRange({start: date, end: date});
      expect(result).toBe('Jan 15, 2024');
    });

    it('should format same month and year range', () => {
      const result = Format.dateRange({
        start: new Date(2024, 0, 1),
        end: new Date(2024, 0, 7)
      });
      expect(result).toBe('Jan 1 - 7, 2024');
    });

    it('should format same year but different month range', () => {
      const result = Format.dateRange({
        start: new Date(2024, 0, 15),
        end: new Date(2024, 2, 20)
      });
      expect(result).toBe('Jan 15 - Mar 20, 2024');
    });

    it('should format different year range', () => {
      const result = Format.dateRange({
        start: new Date(2023, 11, 25),
        end: new Date(2024, 0, 5)
      });
      expect(result).toContain('Dec 25');
      expect(result).toContain('Jan 5');
    });
  });
});
