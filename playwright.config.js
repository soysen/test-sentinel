const { defineConfig } = require('@playwright/test');

const e2ePort = Number(process.env.TEST_SENTINEL_E2E_PORT) || 3892;
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;

module.exports = defineConfig({
  testDir: '.',
  testMatch: ['tests/e2e/**/*.spec.js', '.test-eval/diff-probes/**/*.spec.js'],
  timeout: 15000,
  forbidOnly: true,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: e2eBaseUrl,
    channel: 'chrome',
    headless: true,
    trace: 'retain-on-failure'
  },
  webServer: {
    command: `PORT=${e2ePort} node src/server/app.js`,
    url: e2eBaseUrl,
    reuseExistingServer: false,
    timeout: 10000
  }
});