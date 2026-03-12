import { WorklogState } from './worklog.state';
import { Worklog } from '../../model/worklog';

describe('WorklogState', () => {
  let state: WorklogState;

  beforeEach(() => {
    state = new WorklogState();
  });

  describe('fetching', () => {
    it('should default to false', (done) => {
      state.getFetching$().subscribe(val => {
        expect(val).toBe(false);
        done();
      });
    });

    it('should emit when set to true', (done) => {
      const values: boolean[] = [];
      state.getFetching$().subscribe(val => {
        values.push(val);
        if (values.length === 2) {
          expect(values).toEqual([false, true]);
          done();
        }
      });
      state.setFetching(true);
    });
  });

  describe('worklogs', () => {
    it('should default to empty array', (done) => {
      state.getWorklogs$().subscribe(val => {
        expect(val).toEqual([]);
        done();
      });
    });

    it('should emit worklogs when set', (done) => {
      const worklogs: Worklog[] = [
        { id: '1', issueId: '100', timeSpentSeconds: 3600 },
        { id: '2', issueId: '200', timeSpentSeconds: 7200 }
      ];
      const emissions: Worklog[][] = [];
      state.getWorklogs$().subscribe(val => {
        emissions.push(val);
        if (emissions.length === 2) {
          expect(emissions[1]).toEqual(worklogs);
          done();
        }
      });
      state.setWorklogs(worklogs);
    });
  });

  describe('addOrUpdateWorklog', () => {
    it('should add a new worklog', (done) => {
      const worklog: Worklog = { id: '1', issueId: '100', timeSpentSeconds: 3600 };
      const emissions: Worklog[][] = [];
      state.getWorklogs$().subscribe(val => {
        emissions.push(val);
        if (emissions.length === 2) {
          expect(emissions[1]).toHaveLength(1);
          expect(emissions[1][0].id).toBe('1');
          done();
        }
      });
      state.addOrUpdateWorklog(worklog);
    });

    it('should update an existing worklog by id', (done) => {
      const original: Worklog = { id: '1', issueId: '100', timeSpentSeconds: 3600 };
      const updated: Worklog = { id: '1', issueId: '100', timeSpentSeconds: 7200 };

      state.setWorklogs([original]);

      const emissions: Worklog[][] = [];
      state.getWorklogs$().subscribe(val => {
        emissions.push(val);
        if (emissions.length === 2) {
          expect(emissions[1]).toHaveLength(1);
          expect(emissions[1][0].timeSpentSeconds).toBe(7200);
          done();
        }
      });
      state.addOrUpdateWorklog(updated);
    });
  });

  describe('deleteWorklog', () => {
    it('should remove a worklog by id', (done) => {
      const worklogs: Worklog[] = [
        { id: '1', issueId: '100' },
        { id: '2', issueId: '200' }
      ];
      state.setWorklogs(worklogs);

      const emissions: Worklog[][] = [];
      state.getWorklogs$().subscribe(val => {
        emissions.push(val);
        if (emissions.length === 2) {
          expect(emissions[1]).toHaveLength(1);
          expect(emissions[1][0].id).toBe('2');
          done();
        }
      });
      state.deleteWorklog('1');
    });

    it('should do nothing if worklog id not found', (done) => {
      const worklogs: Worklog[] = [{ id: '1', issueId: '100' }];
      state.setWorklogs(worklogs);

      const emissions: Worklog[][] = [];
      state.getWorklogs$().subscribe(val => {
        emissions.push(val);
        if (emissions.length === 2) {
          expect(emissions[1]).toHaveLength(1);
          done();
        }
      });
      state.deleteWorklog('999');
    });
  });
});
