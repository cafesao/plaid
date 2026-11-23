import {IssueFacade} from './issue.facade';

describe('IssueFacade', () => {
  describe('stripSpecialChars (via reflection)', () => {
    // Access private static method for testing
    const stripSpecialChars = (IssueFacade as any).stripSpecialChars;

    it('should remove special characters', () => {
      expect(stripSpecialChars('hello+world')).toBe('hello world');
      expect(stripSpecialChars('test.value')).toBe('test value');
      expect(stripSpecialChars('a[b]c')).toBe('a b c');
    });

    it('should trim the result', () => {
      expect(stripSpecialChars('+hello+')).toBe('hello');
    });

    it('should leave alphanumeric and spaces unchanged', () => {
      expect(stripSpecialChars('hello world 123')).toBe('hello world 123');
    });

    it('should handle empty string', () => {
      expect(stripSpecialChars('')).toBe('');
    });
  });

  describe('canPotentiallyBeIssueKey (via reflection)', () => {
    const canPotentiallyBeIssueKey = (IssueFacade as any).canPotentiallyBeIssueKey;

    it('should match valid issue keys', () => {
      expect(canPotentiallyBeIssueKey('PROJ-1')).toBe(true);
      expect(canPotentiallyBeIssueKey('ABC-123')).toBe(true);
      expect(canPotentiallyBeIssueKey('A-1')).toBe(true);
      expect(canPotentiallyBeIssueKey('My_Project-99')).toBe(true);
    });

    it('should reject invalid issue keys', () => {
      expect(canPotentiallyBeIssueKey('123-1')).toBe(false); // starts with number
      expect(canPotentiallyBeIssueKey('PROJ-0')).toBe(false); // zero not allowed
      expect(canPotentiallyBeIssueKey('PROJ-')).toBe(false); // no number
      expect(canPotentiallyBeIssueKey('-1')).toBe(false); // starts with dash
      expect(canPotentiallyBeIssueKey('PROJ')).toBe(false); // no dash
      expect(canPotentiallyBeIssueKey('')).toBe(false); // empty
    });
  });
});
