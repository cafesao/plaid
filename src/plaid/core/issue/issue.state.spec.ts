import { IssueState } from './issue.state';
import { Issue } from '../../model/issue';

// The state is backed by BehaviorSubjects, which emit synchronously: each test collects the emissions and asserts
// on them after the action, so every assertion always runs.
describe('IssueState', () => {
  let state: IssueState;

  beforeEach(() => {
    state = new IssueState();
  });

  describe('favorites', () => {
    it('should default to empty array', () => {
      const emissions: Issue[][] = [];
      state.getFavorites$().subscribe(val => emissions.push(val));
      expect(emissions).toEqual([[]]);
    });

    it('should emit when favorites are set', () => {
      const issues: Issue[] = [{ key: 'PROJ-1', fields: { summary: 'Test' } }];
      const emissions: Issue[][] = [];
      state.getFavorites$().subscribe(val => emissions.push(val));
      state.setFavorites(issues);
      expect(emissions).toHaveLength(2);
      expect(emissions[1]).toEqual(issues);
    });
  });

  describe('suggestions', () => {
    it('should default to empty array', () => {
      const emissions: Issue[][] = [];
      state.getSuggestions$().subscribe(val => emissions.push(val));
      expect(emissions).toEqual([[]]);
    });

    it('should emit when suggestions are set', () => {
      const issues: Issue[] = [{ key: 'PROJ-2', fields: { summary: 'Suggestion' } }];
      const emissions: Issue[][] = [];
      state.getSuggestions$().subscribe(val => emissions.push(val));
      state.setSuggestions(issues);
      expect(emissions).toHaveLength(2);
      expect(emissions[1]).toEqual(issues);
    });
  });
});
