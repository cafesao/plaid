import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:4300',
    headless: true
  },
  webServer: {
    command: 'pnpm serve-dev',
    port: 4300,
    timeout: 120000,
    reuseExistingServer: true
  }
});
