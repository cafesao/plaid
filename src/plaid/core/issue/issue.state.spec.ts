import { IssueState } from './issue.state';
import { Issue } from '../../model/issue';

describe('IssueState', () => {
  let state: IssueState;

  beforeEach(() => {
    state = new IssueState();
  });

  describe('favorites', () => {
    it('should default to empty array', (done) => {
      state.getFavorites$().subscribe(val => {
        expect(val).toEqual([]);
        done();
      });
    });

    it('should emit when favorites are set', (done) => {
      const issues: Issue[] = [{ key: 'PROJ-1', fields: { summary: 'Test' } }];
      const emissions: Issue[][] = [];
      state.getFavorites$().subscribe(val => {
        emissions.push(val);
        if (emissions.length === 2) {
          expect(emissions[1]).toEqual(issues);
          done();
        }
      });
      state.setFavorites(issues);
    });
  });

  describe('suggestions', () => {
    it('should default to empty array', (done) => {
      state.getSuggestions$().subscribe(val => {
        expect(val).toEqual([]);
        done();
      });
    });

    it('should emit when suggestions are set', (done) => {
      const issues: Issue[] = [{ key: 'PROJ-2', fields: { summary: 'Suggestion' } }];
      const emissions: Issue[][] = [];
      state.getSuggestions$().subscribe(val => {
        emissions.push(val);
        if (emissions.length === 2) {
          expect(emissions[1]).toEqual(issues);
          done();
        }
      });
      state.setSuggestions(issues);
    });
  });
});
