import {WORKLOG_CACHE_MAX_RANGES, WorklogCache} from './worklog-cache';
import {DateRange} from '../../model/date-range';
import {Worklog} from '../../model/worklog';

describe('WorklogCache', () => {
  const weekA: DateRange = {start: new Date(2026, 10, 23), end: new Date(2026, 10, 29)};
  const weekB: DateRange = {start: new Date(2026, 10, 30), end: new Date(2026, 11, 6)};
  let cache: WorklogCache;

  function worklog(id: string, started: Date, timeSpentSeconds = 900): Worklog {
    return {id, issueId: '1', started: started.toISOString(), timeSpentSeconds};
  }

  function week(n: number): DateRange {
    return {start: new Date(2026, 0, 1 + 7 * n), end: new Date(2026, 0, 7 + 7 * n)};
  }

  beforeEach(() => (cache = new WorklogCache()));

  it('returns what was stored for the same range', () => {
    const worklogs = [worklog('1', new Date(2026, 10, 24, 9))];
    cache.set(weekA, worklogs);
    expect(cache.get({start: new Date(weekA.start), end: new Date(weekA.end)})).toEqual(worklogs);
  });

  it('returns undefined for a range never stored', () => {
    cache.set(weekA, []);
    expect(cache.get(weekB)).toBeUndefined();
  });

  it('is not affected by changes to the arrays it was given or returned', () => {
    const worklogs = [worklog('1', new Date(2026, 10, 24, 9))];
    cache.set(weekA, worklogs);
    worklogs.push(worklog('2', new Date(2026, 10, 24, 10)));
    cache.get(weekA).push(worklog('3', new Date(2026, 10, 24, 11)));
    expect(cache.get(weekA).map(wl => wl.id)).toEqual(['1']);
  });

  it('upserts a worklog only into ranges that contain its start', () => {
    cache.set(weekA, [worklog('1', new Date(2026, 10, 24, 9))]);
    cache.set(weekB, []);

    cache.upsert(worklog('1', new Date(2026, 10, 24, 9), 1800));
    cache.upsert(worklog('2', new Date(2026, 10, 29, 23, 30)));

    expect(cache.get(weekA).map(wl => [wl.id, wl.timeSpentSeconds])).toEqual([
      ['1', 1800],
      ['2', 900]
    ]);
    expect(cache.get(weekB)).toEqual([]);
  });

  it('moves a worklog whose start changed to another cached range', () => {
    cache.set(weekA, [worklog('1', new Date(2026, 10, 24, 9))]);
    cache.set(weekB, []);

    cache.upsert(worklog('1', new Date(2026, 11, 1, 9)));

    expect(cache.get(weekA)).toEqual([]);
    expect(cache.get(weekB).map(wl => wl.id)).toEqual(['1']);
  });

  it('removes a worklog from every range', () => {
    const shared = worklog('1', new Date(2026, 10, 30, 9));
    const overlapping: DateRange = {start: new Date(2026, 10, 30), end: new Date(2026, 10, 30)};
    cache.set(weekB, [shared, worklog('2', new Date(2026, 11, 1, 9))]);
    cache.set(overlapping, [shared]);

    cache.remove('1');

    expect(cache.get(weekB).map(wl => wl.id)).toEqual(['2']);
    expect(cache.get(overlapping)).toEqual([]);
  });

  it('forgets everything on clear', () => {
    cache.set(weekA, []);
    cache.set(weekB, []);
    cache.clear();
    expect(cache.get(weekA)).toBeUndefined();
    expect(cache.get(weekB)).toBeUndefined();
  });

  it('keeps at most 20 ranges, dropping the least recently used', () => {
    expect(WORKLOG_CACHE_MAX_RANGES).toBe(20);
    for (let n = 0; n < WORKLOG_CACHE_MAX_RANGES; n++) {
      cache.set(week(n), []);
    }
    cache.get(week(0)); // week 1 is now the least recently used

    cache.set(week(WORKLOG_CACHE_MAX_RANGES), []);

    expect(cache.get(week(0))).toEqual([]);
    expect(cache.get(week(1))).toBeUndefined();
    expect(cache.get(week(WORKLOG_CACHE_MAX_RANGES))).toEqual([]);
  });
});
