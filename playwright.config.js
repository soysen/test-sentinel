const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  testMatch: ['tests/e2e/**/*.spec.js', '.test-eval/diff-probes/**/*.spec.js'],
  timeout: 15000,
  forbidOnly: true,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:3892',
    channel: 'chrome',
    headless: true,
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'PORT=3892 node src/server/app.js',
    url: 'http://127.0.0.1:3892',
    reuseExistingServer: false,
    timeout: 10000
  }
});