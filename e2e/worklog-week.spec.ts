import {expect, Page, test} from '@playwright/test';
import {installFakeJira} from './fake-jira';

function panelFor(page: Page, issueKey: string) {
  return page.locator('plaid-worklog-panel plaid-issue-details p.name b').getByText(issueKey, {exact: true});
}

const spinner = (page: Page) => page.locator('.loading-overlay.visible');

test.describe('Week loading against a fake Jira Cloud', () => {
  test('loads a week with two search pages and hides the spinner without any click', async ({page}) => {
    await installFakeJira(page, {issueCount: 105, responseDelayMs: 200});
    await page.goto('/');
    // No interaction after goto: the screen must update on its own.

    await expect(panelFor(page, 'E2E-1')).toBeAttached({timeout: 10000});
    await expect(panelFor(page, 'E2E-105')).toBeAttached({timeout: 10000});
    await expect(spinner(page)).toHaveCount(0, {timeout: 10000});
  });

  test('shows a visited week at once when coming back to it', async ({page}) => {
    const jira = await installFakeJira(page, {issueCount: 105});
    await page.goto('/');
    await expect(panelFor(page, 'E2E-105')).toBeAttached({timeout: 10000});
    await expect(spinner(page)).toHaveCount(0, {timeout: 10000});

    await page.locator('a[title="Next week (F6)"]').click();
    await expect(panelFor(page, 'E2E-105')).toBeAttached({timeout: 10000});
    await expect(spinner(page)).toHaveCount(0, {timeout: 10000});

    jira.pauseResponses();
    await page.locator('a[title="Previous week (F4)"]').click();
    await expect(panelFor(page, 'E2E-105')).toBeAttached({timeout: 1000});
    await expect(spinner(page)).toHaveCount(0, {timeout: 1000});
    jira.resumeResponses();
  });
});
