import {Page, Route} from '@playwright/test';

export interface FakeJira {
  /** Holds every response not sent yet (and every new one) until resumeResponses() is called. */
  pauseResponses(): void;
  resumeResponses(): void;
}

export interface FakeJiraOptions {
  /** Issues E2E-1..E2E-N, each with one worklog of the user in the requested period. */
  issueCount: number;
  responseDelayMs?: number;
  /** Issues E2E-1..E2E-N returned by searches that are not the worklog search (issue picker suggestions). Default 0. */
  suggestedIssueCount?: number;
}

const JIRA_URL = 'https://jira.test';
const USER = {
  self: `${JIRA_URL}/rest/api/2/user?accountId=e2e`,
  accountId: 'e2e',
  displayName: 'E2E User',
  emailAddress: 'e2e@jira.test',
  active: true,
  avatarUrls: {}
};
const WORKLOGS_PER_DAY = 21; // 15-minute blocks every 20 minutes from 08:00, without overlaps
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*'
};

function issue(n: number) {
  return {
    id: String(10000 + n),
    key: `E2E-${n}`,
    fields: {
      summary: `Fake issue ${n}`,
      status: {name: 'In Progress', statusCategory: {colorName: 'yellow'}},
      components: []
    }
  };
}

/** The n-th issue's worklog: day (n-1) / 21 of the period, slot (n-1) % 21 of that day. */
function worklog(n: number, periodStart: number) {
  const day = Math.floor((n - 1) / WORKLOGS_PER_DAY);
  const slot = (n - 1) % WORKLOGS_PER_DAY;
  const started = new Date(periodStart + day * 86400000 + 8 * 3600000 + slot * 20 * 60000);
  return {
    id: String(20000 + n),
    issueId: String(10000 + n),
    author: USER,
    updateAuthor: USER,
    comment: `E2E worklog ${n}`,
    started: started.toISOString(),
    timeSpentSeconds: 900,
    timeSpent: '15m'
  };
}

/**
 * Logs the app in to a fake Jira Cloud served by page.route: no real network, CORS headers included (the test browser
 * enforces CORS, unlike the Electron window).
 */
export async function installFakeJira(page: Page, opts: FakeJiraOptions): Promise<FakeJira> {
  let paused = false;
  let waiting: (() => void)[] = [];
  let addedWorklogs = 0;

  await page.addInitScript(() => {
    localStorage.setItem('AUTH_INFO', JSON.stringify({jiraUrl: 'https://jira.test', username: 'e2e', password: 'e2e'}));
    localStorage.setItem('AUTH_HEADER', `Basic ${btoa('e2e:e2e')}`);
    (window as any).electronAPI = {
      getNativeThemeShouldUseDarkColors: () => Promise.resolve(false),
      setNativeThemeSource: () => Promise.resolve(),
      onNativeThemeUpdated: () => {},
      openExternal: () => Promise.resolve()
    };
  });

  const respond = (route: Route, body: unknown) =>
    route.fulfill({status: 200, contentType: 'application/json', headers: CORS_HEADERS, body: JSON.stringify(body)});

  await page.route(`${JIRA_URL}/**`, async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({status: 204, headers: CORS_HEADERS});
      return;
    }
    if (opts.responseDelayMs) {
      await new Promise(resolve => setTimeout(resolve, opts.responseDelayMs));
    }
    if (paused) {
      await new Promise<void>(resolve => waiting.push(resolve));
    }

    const url = new URL(request.url());
    const worklogPath = /^\/rest\/api\/2\/issue\/(\d+)\/worklog$/.exec(url.pathname);
    if (url.pathname === '/rest/api/2/myself') {
      await respond(route, USER);
    } else if (url.pathname === '/rest/api/3/search/jql') {
      const jql = url.searchParams.get('jql') || '';
      if (!jql.includes('worklogDate')) {
        // issue picker suggestions and searches
        const suggested = Array.from({length: opts.suggestedIssueCount ?? 0}, (_, i) => issue(i + 1));
        await respond(route, {issues: suggested, isLast: true});
        return;
      }
      const pageSize = Number(url.searchParams.get('maxResults') || 50);
      const pageIndex = Number(url.searchParams.get('nextPageToken') || 0);
      const first = pageIndex * pageSize + 1;
      const last = Math.min(opts.issueCount, first + pageSize - 1);
      const issues = [];
      for (let n = first; n <= last; n++) {
        issues.push(issue(n));
      }
      const isLast = last >= opts.issueCount;
      await respond(route, isLast ? {issues, isLast} : {issues, isLast, nextPageToken: String(pageIndex + 1)});
    } else if (worklogPath && request.method() === 'POST') {
      const body = request.postDataJSON();
      addedWorklogs++;
      await respond(route, {
        id: String(30000 + addedWorklogs),
        issueId: worklogPath[1],
        author: USER,
        updateAuthor: USER,
        started: body.started,
        timeSpentSeconds: body.timeSpentSeconds,
        comment: body.comment
      });
    } else if (worklogPath) {
      const n = Number(worklogPath[1]) - 10000;
      const worklogs = [worklog(n, Number(url.searchParams.get('startedAfter')))];
      await respond(route, {startAt: 0, maxResults: 5000, total: worklogs.length, worklogs});
    } else {
      await respond(route, {});
    }
  });

  return {
    pauseResponses: () => (paused = true),
    resumeResponses: () => {
      paused = false;
      waiting.forEach(resolve => {
        resolve();
      });
      waiting = [];
    }
  };
}
