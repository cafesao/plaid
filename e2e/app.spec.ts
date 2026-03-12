import { test, expect, Page } from '@playwright/test';

// Mock window.electronAPI before Angular loads to avoid Electron dependency
function addElectronMock(page: Page, clearStorage = false) {
  return page.addInitScript((clear) => {
    if (clear) localStorage.clear();
    (window as any).electronAPI = {
      getNativeThemeShouldUseDarkColors: () => Promise.resolve(false),
      setNativeThemeSource: () => Promise.resolve(),
      onNativeThemeUpdated: () => {},
      openExternal: () => Promise.resolve(),
    };
  }, clearStorage);
}

async function waitForApp(page: Page) {
  await page.waitForSelector('plaid-root .top-bar', { timeout: 15000 });
}

test.describe('Plaid App - Basic Rendering', () => {
  test('should load the app and render all main components', async ({ page }) => {
    await addElectronMock(page);
    await page.goto('/');
    await waitForApp(page);

    await expect(page.locator('plaid-root')).toBeAttached();
    await expect(page.locator('plaid-date-range-picker')).toBeAttached();
    await expect(page.locator('plaid-refresh-button')).toBeAttached();
    await expect(page.locator('plaid-add-button')).toBeAttached();
    await expect(page.locator('plaid-zoom-controls.outside-settings')).toBeAttached();
    await expect(page.locator('plaid-settings')).toBeAttached();
    await expect(page.locator('plaid-auth-status')).toBeAttached();
    await expect(page.locator('plaid-grid')).toBeAttached();
    await expect(page.locator('plaid-connection-issue-resolver')).toBeAttached();
  });
});

test.describe('Plaid App - Login Flow', () => {
  test('should show login modal with form fields when no credentials', async ({ page }) => {
    await addElectronMock(page, true);
    await page.goto('/');
    await waitForApp(page);

    // Modal background should be visible
    await expect(page.locator('.modal-background.visible')).toBeAttached();

    // Login modal and form fields should be in the DOM
    await expect(page.locator('plaid-login-modal')).toBeAttached();
    await expect(page.locator('plaid-login-modal input[name="jiraUrl"]')).toBeAttached();
    await expect(page.locator('plaid-login-modal input[name="username"]')).toBeAttached();
    await expect(page.locator('plaid-login-modal input[name="password"]')).toBeAttached();
  });

  test('login button should be disabled when form fields are cleared', async ({ page }) => {
    await addElectronMock(page, true);
    await page.goto('/');
    await waitForApp(page);

    // Ensure fields are empty
    await page.locator('plaid-login-modal input[name="jiraUrl"]').fill('', { force: true });
    await page.locator('plaid-login-modal input[name="username"]').fill('', { force: true });
    await page.locator('plaid-login-modal input[name="password"]').fill('', { force: true });

    const loginButton = page.locator('plaid-login-modal button.primary');
    await expect(loginButton).toBeDisabled();
  });

  test('should enable login button when all fields are filled', async ({ page }) => {
    await addElectronMock(page, true);
    await page.goto('/');
    await waitForApp(page);

    // The modal form has tabIndex=-1 when closed, but the inputs should still accept fill
    await page.locator('plaid-login-modal input[name="jiraUrl"]').fill('https://jira.example.com', { force: true });
    await page.locator('plaid-login-modal input[name="username"]').fill('testuser', { force: true });
    await page.locator('plaid-login-modal input[name="password"]').fill('testpass', { force: true });

    const loginButton = page.locator('plaid-login-modal button.primary');
    await expect(loginButton).toBeEnabled();
  });

  test('cancel button should close the login modal', async ({ page }) => {
    await addElectronMock(page, true);
    await page.goto('/');
    await waitForApp(page);

    // Modal should be visible
    await expect(page.locator('.modal-background.visible')).toBeAttached();

    // Click cancel (force click in case of overlay issues)
    await page.locator('plaid-login-modal button:not(.primary)').click({ force: true });

    // Modal background should no longer have .visible class
    await expect(page.locator('.modal-background:not(.visible)')).toBeAttached();
  });
});

test.describe('Plaid App - Auth Status', () => {
  test('should show "Logged out" text in auth dropdown', async ({ page }) => {
    await addElectronMock(page, true);
    await page.goto('/');
    await waitForApp(page);

    // Close the login modal first
    await page.locator('plaid-login-modal button:not(.primary)').click({ force: true });
    await page.waitForTimeout(300);

    // Click the auth status button to open dropdown
    await page.locator('plaid-auth-status a.button').first().click();

    // Should show logged out state
    await expect(page.locator('plaid-auth-status .headline')).toContainText('Logged out');
  });
});
