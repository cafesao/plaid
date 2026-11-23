import {WorklogState} from './worklog.state';
import {Worklog} from '../../model/worklog';

// The state is backed by BehaviorSubjects, which emit synchronously: each test collects the emissions and asserts
// on them after the action, so every assertion always runs.
describe('WorklogState', () => {
  let state: WorklogState;

  beforeEach(() => {
    state = new WorklogState();
  });

  describe('fetching', () => {
    it('should default to false', () => {
      const values: boolean[] = [];
      state.getFetching$().subscribe(val => values.push(val));
      expect(values).toEqual([false]);
    });

    it('should emit when set to true', () => {
      const values: boolean[] = [];
      state.getFetching$().subscribe(val => values.push(val));
      state.setFetching(true);
      expect(values).toEqual([false, true]);
    });
  });

  describe('worklogs', () => {
    it('should default to empty array', () => {
      const emissions: Worklog[][] = [];
      state.getWorklogs$().subscribe(val => emissions.push(val));
      expect(emissions).toEqual([[]]);
    });

    it('should emit worklogs when set', () => {
      const worklogs: Worklog[] = [
        {id: '1', issueId: '100', timeSpentSeconds: 3600},
        {id: '2', issueId: '200', timeSpentSeconds: 7200}
      ];
      const emissions: Worklog[][] = [];
      state.getWorklogs$().subscribe(val => emissions.push(val));
      state.setWorklogs(worklogs);
      expect(emissions).toHaveLength(2);
      expect(emissions[1]).toEqual(worklogs);
    });
  });

  describe('addOrUpdateWorklog', () => {
    it('should add a new worklog', () => {
      const worklog: Worklog = {id: '1', issueId: '100', timeSpentSeconds: 3600};
      const emissions: Worklog[][] = [];
      state.getWorklogs$().subscribe(val => emissions.push(val));
      state.addOrUpdateWorklog(worklog);
      expect(emissions).toHaveLength(2);
      expect(emissions[1]).toHaveLength(1);
      expect(emissions[1][0].id).toBe('1');
    });

    it('should update an existing worklog by id', () => {
      const original: Worklog = {id: '1', issueId: '100', timeSpentSeconds: 3600};
      const updated: Worklog = {id: '1', issueId: '100', timeSpentSeconds: 7200};

      state.setWorklogs([original]);

      const emissions: Worklog[][] = [];
      state.getWorklogs$().subscribe(val => emissions.push(val));
      state.addOrUpdateWorklog(updated);
      expect(emissions).toHaveLength(2);
      expect(emissions[1]).toHaveLength(1);
      expect(emissions[1][0].timeSpentSeconds).toBe(7200);
    });
  });

  describe('deleteWorklog', () => {
    it('should remove a worklog by id', () => {
      const worklogs: Worklog[] = [
        {id: '1', issueId: '100'},
        {id: '2', issueId: '200'}
      ];
      state.setWorklogs(worklogs);

      const emissions: Worklog[][] = [];
      state.getWorklogs$().subscribe(val => emissions.push(val));
      state.deleteWorklog('1');
      expect(emissions).toHaveLength(2);
      expect(emissions[1]).toHaveLength(1);
      expect(emissions[1][0].id).toBe('2');
    });

    it('should do nothing if worklog id not found', () => {
      const worklogs: Worklog[] = [{id: '1', issueId: '100'}];
      state.setWorklogs(worklogs);

      const emissions: Worklog[][] = [];
      state.getWorklogs$().subscribe(val => emissions.push(val));
      state.deleteWorklog('999');
      expect(emissions).toHaveLength(2);
      expect(emissions[1]).toHaveLength(1);
    });
  });
});
