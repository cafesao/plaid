import {Injectable} from '@angular/core';
import {DateRange} from '../../model/date-range';
import {Worklog} from '../../model/worklog';
import {Calendar} from '../../helpers/calendar';

/** How many periods the cache keeps; the least recently used one is dropped beyond that. */
export const WORKLOG_CACHE_MAX_RANGES = 20;

interface CacheEntry {
  start: number;
  /** Exclusive end: midnight of the day after the range's last day. */
  end: number;
  worklogs: Worklog[];
}

/**
 * In-memory cache of the user's work logs per visited period. Lives only while the app runs; nothing is written to
 * disk or localStorage. Arrays are copied in and out, so callers may mutate what they pass or receive.
 */
@Injectable({ providedIn: 'root' })
export class WorklogCache {
  // Map keeps insertion order: re-inserting on use makes the first key the least recently used.
  private entries = new Map<string, CacheEntry>();

  private static key(range: DateRange): string {
    return range.start.getTime() + '_' + range.end.getTime();
  }

  private static startOf(worklog: Worklog): number {
    return new Date(worklog.started).getTime();
  }

  get(range: DateRange): Worklog[] | undefined {
    const key: string = WorklogCache.key(range);
    const entry: CacheEntry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return [...entry.worklogs];
  }

  set(range: DateRange, worklogs: Worklog[]): void {
    const key: string = WorklogCache.key(range);
    this.entries.delete(key);
    this.entries.set(key, {
      start: range.start.getTime(),
      end: Calendar.dayAfter(range.end).getTime(),
      worklogs: [...worklogs]
    });
    if (this.entries.size > WORKLOG_CACHE_MAX_RANGES) {
      this.entries.delete(this.entries.keys().next().value);
    }
  }

  /**
   * Puts the work log into every cached period that contains its start and takes it out of the ones that don't (its
   * start may have moved to another period).
   */
  upsert(worklog: Worklog): void {
    const started: number = WorklogCache.startOf(worklog);
    this.entries.forEach(entry => {
      const others: Worklog[] = entry.worklogs.filter(wl => wl.id !== worklog.id);
      if (started >= entry.start && started < entry.end) {
        const index: number = entry.worklogs.findIndex(wl => wl.id === worklog.id);
        entry.worklogs = index > -1
          ? entry.worklogs.map(wl => wl.id === worklog.id ? worklog : wl)
          : [...others, worklog];
      } else {
        entry.worklogs = others;
      }
    });
  }

  remove(worklogId: string): void {
    this.entries.forEach(entry => entry.worklogs = entry.worklogs.filter(wl => wl.id !== worklogId));
  }

  clear(): void {
    this.entries.clear();
  }
}
