const { test, expect } = require('@playwright/test');

test('模式 A 大量測案可篩選、檢視，切換模式會清除狀態', async ({ page }) => {
  const browserErrors = [];
  const serverErrors = [];

  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('response', response => {
    if (response.status() >= 500) {
      serverErrors.push(`${response.url()} returned HTTP ${response.status()}`);
    }
  });

  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 204 }));
  await page.route('**/api/projects/list', route => route.fulfill({
    json: [{ name: 'test-sentinel (當前目錄)', path: '/tmp/test-sentinel' }]
  }));
  await page.route('**/api/projects/scan', route => route.fulfill({
    json: {
      name: 'test-sentinel',
      path: '/tmp/test-sentinel',
      frameworks: ['Node.js'],
      skills: [],
      harness: { hasHarness: true },
      git: { branch: 'main' }
    }
  }));
  await page.route('**/api/history/all**', route => route.fulfill({ json: [] }));
  await page.route('**/api/cases/preview', route => route.fulfill({
    json: {
      modeTitle: 'Git Diff E2E',
      plannedCases: Array.from({ length: 30 }, (_, index) => ({
        id: `DIFF-TC-${String(index + 1).padStart(3, '0')}`,
        name: `Mutation ${index + 1}`,
        type: '變異擊殺測試',
        status: index % 3 === 0 ? 'PASS' : index % 3 === 1 ? 'FAIL' : 'INCONCLUSIVE',
        input: `src/web/js/app.js:${index + 1}`,
        objective: `驗證變異 ${index + 1}`,
        delta: `line ${index + 1}`
      }))
    }
  }));
  await page.route('**/api/run/diff-e2e', route => route.fulfill({
    json: {
      result: {
        status: 'INCONCLUSIVE',
        reason: '基線測試未通過，變異結果不具判定效力。',
        caseComparisons: []
      },
      scorecard: {
        overallScore: null,
        rating: 'INCONCLUSIVE',
        status: 'INCONCLUSIVE',
        metrics: { mutationKillRate: null, silentErrorsCaught: null },
        evidence: { runtimeSafety: 'NOT_MEASURED' },
        insights: ['基線測試未通過。']
      }
    }
  }));

  await page.goto('/');
  await expect(page.locator('#projectPathInput')).toHaveValue('test-sentinel');
  await expect(page.locator('#fseventStatus')).toHaveText('本機變異測試');
  await expect(page.locator('.mode-btn[data-mode="harness-eval"]')).toBeVisible();

  await page.locator('#btnGenerateFlow').click();
  await expect(page.locator('#casesSection')).toBeVisible();
  await expect(page.locator('#caseResultsToolbar')).toBeVisible();
  await expect(page.locator('.compact-case-card')).toHaveCount(25);
  await expect(page.locator('#casePageInfo')).toContainText('30 筆');

  await page.locator('#caseSearchInput').fill('DIFF-TC-030');
  await expect(page.locator('.compact-case-card')).toHaveCount(1);
  await page.locator('.compact-case-card').click();
  await expect(page.locator('#inspectorCaseTitle')).toContainText('DIFF-TC-030');
  await expect(page.locator('.compact-case-card')).toHaveClass(/selected/);

  await page.locator('#btnExecutePlan').click();
  await expect(page.locator('#flowStatusBadge')).toHaveText('實體檢定未完成 (Inconclusive)');
  await expect(page.locator('.compact-case-card')).toHaveCount(25);
  await expect(page.locator('.compact-case-card').first()).toContainText('Invalid');
  await expect(page.locator('#casesCountBadge')).toHaveText('30 個測案');

  await page.locator('.mode-btn[data-mode="skill-eval"]').click();
  await expect(page.locator('#fseventStatus')).toHaveText('FSEvents 哨兵守候中 (0 Token)');
  await expect(page.locator('#casesSection')).toBeHidden();
  await expect(page.locator('#caseSearchInput')).toHaveValue('');

  await page.locator('.mode-btn[data-mode="harness-eval"]').click();
  await expect(page.locator('#fseventStatus')).toHaveText('本機 Harness 健檢');

  expect(browserErrors).toEqual([]);
  expect(serverErrors).toEqual([]);
});