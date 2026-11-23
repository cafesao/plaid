import {expect, test} from '@playwright/test';
import {installFakeJira} from './fake-jira';

test.describe('Saving a worklog when Jira rejects it', () => {
  test('a rejected save leaves the editor usable and the next Add works', async ({page}) => {
    await installFakeJira(page, {issueCount: 1, suggestedIssueCount: 1, failWorklogPosts: 1});
    await page.goto('/');
    const save = page.locator('#save-button');
    const comment = page.locator('plaid-worklog-editor textarea');

    await page.locator('a[title="Add new entry"]').click();
    await expect(page.locator('#issue-picker-toggle')).toHaveValue('E2E-1 - Fake issue 1');
    await comment.fill('Retry me');
    await save.click();

    const errorModal = page.locator('plaid-error-modal .modal.open');
    await expect(errorModal).toBeVisible();
    await errorModal.getByRole('button', {name: 'Close'}).click();
    await expect(save).toBeEnabled();
    await expect(comment).toHaveValue('Retry me');

    await save.click();
    await expect(page.locator('plaid-worklog-editor .wrapper.visible')).toHaveCount(0);
  });
});
