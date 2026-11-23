import {expect, test} from '@playwright/test';
import {installFakeJira} from './fake-jira';

test.describe('Draft of a new worklog', () => {
  test('keeps issue and comment after clicking outside, until the entry is added', async ({page}) => {
    await installFakeJira(page, {issueCount: 1, suggestedIssueCount: 2});
    await page.goto('/');
    const add = page.locator('a[title="Add new entry"]');
    const issueField = page.locator('#issue-picker-toggle');
    const comment = page.locator('plaid-worklog-editor textarea');
    const editorOpen = page.locator('plaid-worklog-editor .wrapper.visible');

    await add.click();
    await expect(issueField).toHaveValue('E2E-1 - Fake issue 1'); // automatic suggestion
    await issueField.click();
    await page.locator('plaid-issue-picker-cloud plaid-issue-details').filter({hasText: 'E2E-2'}).first().click();
    await expect(issueField).toHaveValue('E2E-2 - Fake issue 2');
    await comment.fill('Draft comment');
    await page.locator('plaid-worklog-editor .wrapper').click({position: {x: 5, y: 5}}); // outside the panel
    await expect(editorOpen).toHaveCount(0);

    await add.click();
    await expect(issueField).toHaveValue('E2E-2 - Fake issue 2');
    await expect(comment).toHaveValue('Draft comment');

    await page.locator('#save-button').click();
    await expect(editorOpen).toHaveCount(0);
    await add.click();
    await expect(comment).toHaveValue('');
    await expect(issueField).toHaveValue('E2E-1 - Fake issue 1');
  });
});
