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
      },
      remediation: {
        actions: [{ priority: 'HIGH', title: '先修復測試基線', detail: '確認基線可重現並修正根因。' }],
        aiPrompt: '請直接檢查並修正目前專案的測試基線，完成後回報實際驗證結果。'
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
  await expect(page.locator('#remediationBox')).toBeVisible();
  await expect(page.locator('#remediationActions')).toContainText('先修復測試基線');
  await expect(page.locator('#remediationPromptText')).toHaveValue(/請直接檢查並修正/);
  await expect(page.locator('#btnCopyRemediationPrompt')).toBeVisible();

  await page.locator('.mode-btn[data-mode="skill-eval"]').click();
  await expect(page.locator('#fseventStatus')).toHaveText('FSEvents 哨兵守候中 (0 Token)');
  await expect(page.locator('#casesSection')).toBeHidden();
  await expect(page.locator('#caseSearchInput')).toHaveValue('');

  await page.locator('.mode-btn[data-mode="harness-eval"]').click();
  await expect(page.locator('#fseventStatus')).toHaveText('本機 Harness 健檢');
  await expect(page.locator('#diffSegmentedControl')).toBeHidden();
  await expect(page.locator('#diffScopeControlGroup')).toBeHidden();

  expect(browserErrors).toEqual([]);
  expect(serverErrors).toEqual([]);
});

test('E2E (模式 A) 路徑範圍選測：專案檔案預設、Tab 切換、檔案勾選樹、button 展開器、全選清除、Glob 篩選與範圍變更自動清除預覽', async ({ page }) => {
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
      harness: { hasHarness: false },
      git: { branch: 'main' }
    }
  }));
  await page.route('**/api/history/all**', route => route.fulfill({ json: [] }));
  await page.route('**/api/inspect/project-files', route => route.fulfill({
    json: {
      files: [
        { filePath: 'src/core/diff-analyzer.js', isMutable: true, extension: '.js' },
        { filePath: 'src/core/scanner.js', isMutable: true, extension: '.js' },
        { filePath: 'src/web/js/app.js', isMutable: true, extension: '.js' },
        { filePath: '<img src=x onerror="window.__xss_fired=true">.js', isMutable: true, extension: '.js' }
      ],
      summary: { totalFiles: 4, mutableFiles: 4 }
    }
  }));
  await page.route('**/api/inspect/diff', route => route.fulfill({
    json: {
      files: [
        { filePath: 'src/core/diff-analyzer.js', addedCount: 10, removedCount: 2 },
        { filePath: 'src/core/scanner.js', addedCount: 5, removedCount: 0 }
      ],
      summary: { totalFiles: 2, addedLines: 15, removedLines: 2 }
    }
  }));

  let lastPreviewPayload = null;
  await page.route('**/api/cases/preview', async route => {
    lastPreviewPayload = route.request().postDataJSON();
    return route.fulfill({
      json: {
        modeTitle: '專案原始碼 E2E',
        matchedFiles: ['src/core/diff-analyzer.js'],
        plannedCases: [
          {
            id: 'PLAN-DIFF-01',
            name: '快樂路徑渲染測試',
            type: '行為健全性',
            input: 'src/core/diff-analyzer.js:10',
            objective: '驗證目標檔案修改後渲染無誤'
          }
        ]
      }
    });
  });

  let lastRunPayload = null;
  await page.route('**/api/run/diff-e2e', async route => {
    lastRunPayload = route.request().postDataJSON();
    return route.fulfill({
      json: {
        result: {
          status: 'MEASURED',
          caseComparisons: [
            { id: 'PLAN-DIFF-01', status: 'PASS', delta: '變異已擊殺' }
          ]
        },
        scorecard: {
          overallScore: 90,
          rating: 'EXCELLENT',
          status: 'MEASURED',
          metrics: { mutationKillRate: 100, silentErrorsCaught: 0 },
          evidence: { runtimeSafety: 'MEASURED' }
        },
        remediation: { actions: [], aiPrompt: '' }
      }
    });
  });

  await page.goto('/');

  // 1. 驗證 3-way segmented control 且預設選中「專案檔案」
  await expect(page.locator('#diffScopeSection')).toHaveCount(0);
  await expect(page.locator('#diffSegmentedControl')).toBeVisible();
  await expect(page.locator('#btnScopeModeProject')).toHaveClass(/active/);
  await expect(page.locator('#btnScopeModeDiff')).not.toHaveClass(/active/);
  await expect(page.locator('#btnScopeModeCustom')).not.toHaveClass(/active/);
  await expect(page.locator('#diffScopeSummaryText')).toHaveText('全部 4 個可測檔案');
  await expect(page.locator('#btnOpenScopeModal')).toBeHidden();

  // 2. 測試 375px 小螢幕排版（摘要列不產生水平溢出）
  await page.setViewportSize({ width: 375, height: 667 });
  const summaryOverflow = await page.locator('#diffScopeSummaryBar').evaluate(el => el.scrollWidth <= el.clientWidth + 1);
  expect(summaryOverflow).toBe(true);
  expect(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 800 });

  // 3. 點選「選擇檔案」開啟 Modal
  await page.locator('#btnScopeModeCustom').click();
  await expect(page.locator('#scopeModalOverlay')).toBeVisible();
  await expect(page.locator('#scopeModalDialog')).toHaveAttribute('role', 'dialog');
  await expect(page.locator('#scopeModalDialog')).toHaveAttribute('aria-modal', 'true');
  // 預設 hideNonE2E 為勾選，.github 檔案被過濾，可測檔案為 4 個
  await expect(page.locator('#chkHideNonE2E')).toBeChecked();
  await expect(page.locator('#modalSelectedCountBadge')).toHaveText('已選 4 / 4 個檔案');

  // 4. 驗證資料夾預設收合 (aria-expanded 為 false)
  const toggleBtn = page.locator('#modalDiffTreeContainer .diff-tree-toggle-btn').first();
  await expect(toggleBtn).toBeVisible();
  await expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');
  const controlledFolderId = await toggleBtn.getAttribute('aria-controls');
  expect(controlledFolderId).toBeTruthy();

  // 驗證 Enter / Space 鍵盤展開/收合支援
  await toggleBtn.focus();
  await page.keyboard.press('Enter');
  await expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Space');
  await expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');
  await toggleBtn.click(); // 保持展開以利後續點選
  await expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');

  // 5. 驗證 SVG 圖示（無 emoji）與 DOM XSS 安全性
  const treeText = await page.locator('#modalDiffTreeContainer').innerText();
  expect(treeText).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  await expect(page.locator('#modalDiffTreeContainer svg.tree-icon').first()).toBeVisible();
  const isXssFired = await page.evaluate(() => window.__xss_fired);
  expect(isXssFired).toBeUndefined();

  // 6. 測試草稿狀態與 Escape / 取消放棄修改
  const diffAnalyzerCheckbox = page.locator('#modalDiffTreeContainer .file-checkbox[data-path="src/core/diff-analyzer.js"]');
  const coreCheckbox = page.locator('#modalDiffTreeContainer .folder-checkbox[data-path="src/core"]');

  await page.locator('#btnModalClear').click();
  await expect(page.locator('#modalSelectedCountBadge')).toHaveText('已選 0 / 4 個檔案');
  await expect(page.locator('#btnApplyScopeModal')).toBeDisabled();
  await expect(page.locator('#modalScopeAlert')).toBeVisible();

  // 按 Escape 關閉 modal（應放棄剛才的清空草稿）
  await page.keyboard.press('Escape');
  await expect(page.locator('#scopeModalOverlay')).toBeHidden();
  await expect(page.locator('#diffScopeSummaryText')).toHaveText('全部 4 個可測檔案');

  // 7. 重新開啟 Modal 並套用自訂選取
  await page.locator('#btnScopeModeCustom').click();
  await expect(page.locator('#scopeModalOverlay')).toBeVisible();
  await page.locator('#btnModalClear').click();
  // 展開 src 與 core 資料夾以進行檔案勾選
  await page.getByRole('button', { name: '展開或收合資料夾 src' }).click();
  await page.getByRole('button', { name: '展開或收合資料夾 core' }).click();
  await diffAnalyzerCheckbox.check();
  await expect(page.locator('#modalSelectedCountBadge')).toHaveText('已選 1 / 4 個檔案');
  expect(await coreCheckbox.evaluate(el => el.indeterminate)).toBe(true);

  // 展開進階 Glob 並填入排除條件
  await page.locator('#btnToggleGlobAccordion').click();
  await expect(page.locator('#modalGlobContent')).toBeVisible();
  await page.locator('#modalGlobInput').fill('!**/*.spec.js');

  // 點擊套用選取
  await page.locator('#btnApplyScopeModal').click();
  await expect(page.locator('#scopeModalOverlay')).toBeHidden();
  await expect(page.locator('#btnScopeModeCustom')).toHaveClass(/active/);
  await expect(page.locator('#diffScopeSummaryText')).toHaveText('已選 1 / 4 個檔案');
  await expect(page.locator('#btnOpenScopeModal')).toBeVisible();

  // 8. 生成測案並驗證傳遞之 sourceMode 與 pathScope
  await page.locator('#btnGenerateFlow').click();
  await expect(page.locator('#casesSection')).toBeVisible();
  expect(lastPreviewPayload.sourceMode).toBe('project');
  expect(lastPreviewPayload.pathScope).toEqual({
    selectedPaths: ['src/core/diff-analyzer.js'],
    includePatterns: [],
    excludePatterns: ['**/*.spec.js']
  });

  // 9. 執行測案並確認 run 與 preview 一致
  await page.locator('#targetUrlInput').fill('http://127.0.0.1:4173/app');
  await page.locator('#btnExecutePlan').click();
  await expect(page.locator('#flowStatusBadge')).toHaveText('實體檢定完成 (Verified)');
  expect(lastRunPayload.sourceMode).toBe('project');
  expect(lastRunPayload.pathScope).toEqual(lastPreviewPayload.pathScope);
  expect(lastRunPayload.targetUrl).toBe('http://127.0.0.1:4173/app');

  // 10. 切換至「Git Diff」自動清除自訂範圍並載入 diff 檔案
  await page.locator('#btnScopeModeDiff').click();
  await expect(page.locator('#btnScopeModeDiff')).toHaveClass(/active/);
  await expect(page.locator('#diffScopeSummaryText')).toHaveText('全部 2 個變更檔案');
  await expect(page.locator('#btnOpenScopeModal')).toBeHidden();
  await expect(page.locator('#casesSection')).toBeHidden();
  await expect(page.locator('#flowStatusBadge')).toHaveText('範圍已變更，請重新生成測案');

  // 重新生成時 sourceMode 為 diff
  await page.locator('#btnGenerateFlow').click();
  await expect(page.locator('#casesSection')).toBeVisible();
  expect(lastPreviewPayload.sourceMode).toBe('diff');
  expect(lastPreviewPayload.pathScope).toBeNull();

  // 11. 切回「專案檔案」自動清除自訂範圍並載入專案檔案
  await page.locator('#btnScopeModeProject').click();
  await expect(page.locator('#btnScopeModeProject')).toHaveClass(/active/);
  await expect(page.locator('#diffScopeSummaryText')).toHaveText('全部 4 個可測檔案');
  await expect(page.locator('#btnOpenScopeModal')).toBeHidden();
  await expect(page.locator('#casesSection')).toBeHidden();

  expect(browserErrors).toEqual([]);
  expect(serverErrors).toEqual([]);
});

test('4 欄獨立上下捲動工作區、管線流程直式排列、02 欄位置底執行按鈕與測案細節浮動視窗', async ({ page }) => {
  const browserErrors = [];
  const serverErrors = [];

  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(message.text());
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
      harness: { hasHarness: false },
      git: { branch: 'main' }
    }
  }));
  await page.route('**/api/inspect/project-files', route => route.fulfill({
    json: {
      files: [{ filePath: 'src/core/scanner.js', isMutable: true, extension: '.js' }],
      summary: { totalFiles: 1, mutableFiles: 1 }
    }
  }));
  await page.route('**/api/history/all**', route => route.fulfill({ json: [] }));
  await page.route('**/api/cases/preview', route => route.fulfill({
    json: {
      modeTitle: '專案檔案 E2E',
      plannedCases: Array.from({ length: 20 }, (_, index) => ({
        id: `PLAN-${String(index + 1).padStart(2, '0')}`,
        name: `變異測試 ${index + 1}`,
        type: '健全性',
        input: `a.js:${index + 1}`,
        objective: '測試變異'
      }))
    }
  }));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const horizontalOverflow = await page.evaluate(() => ({
    bodyScrollable: document.body.scrollWidth > window.innerWidth,
    workspaceScrollable: document.querySelector('#workspaceView').scrollWidth > document.querySelector('#workspaceView').clientWidth
  }));
  expect(horizontalOverflow.bodyScrollable).toBe(true);
  expect(horizontalOverflow.workspaceScrollable).toBe(false);

  // 1. 驗證 4 欄獨立工作區架構存在且由左至右橫向排列
  const col01 = page.locator('#col01Project');
  const col02 = page.locator('#col02Generator');
  const col03 = page.locator('#col03Cases');
  const col04 = page.locator('#col04Scorecard');

  await expect(col01).toBeVisible();
  await expect(col02).toBeVisible();
  await expect(col03).toBeVisible();
  await expect(col04).toBeVisible();

  const box1 = await col01.boundingBox();
  const box2 = await col02.boundingBox();
  const box3 = await col03.boundingBox();
  const box4 = await col04.boundingBox();

  expect(box1.x).toBeLessThan(box2.x);
  expect(box2.x).toBeLessThan(box3.x);
  expect(box3.x).toBeLessThan(box4.x);

  // 驗證 4 欄各自具備獨立捲動能力 (overflow-y 為 auto)
  const overflowCol1 = await col01.evaluate(el => window.getComputedStyle(el).overflowY);
  const overflowCol2 = await col02.evaluate(el => window.getComputedStyle(el).overflowY);
  const overflowCol3 = await col03.evaluate(el => window.getComputedStyle(el).overflowY);
  const overflowCol4 = await col04.evaluate(el => window.getComputedStyle(el).overflowY);
  expect(overflowCol1).toBe('auto');
  expect(overflowCol2).toBe('auto');
  expect(overflowCol3).toBe('auto');
  expect(overflowCol4).toBe('auto');
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  for (const column of [col01, col02, col03, col04]) {
    const box = await column.boundingBox();
    expect(box.height).toBeLessThanOrEqual(viewportHeight);
  }

  const scorecardSpacing = await page.locator('#scorecardSection').evaluate(el => {
    const style = window.getComputedStyle(el);
    return { margin: style.margin, padding: style.padding };
  });
  expect(scorecardSpacing).toEqual({ margin: '0px', padding: '0px' });

  // 2. 驗證原 STEP 03 執行區塊 (#actionTriggerSection) 初始預設隱藏
  const col03Footer = page.locator('#col03Cases #actionTriggerSection');
  await expect(col03Footer).toBeHidden();

  // 3. 驗證選擇專案或 DIFF 的 switch tab 具備充足寬度，且文字不換行
  const segmentedControl = page.locator('#diffSegmentedControl');
  await expect(segmentedControl).toBeVisible();
  const targetUrlControl = page.locator('.runtime-target-control');
  const scopeActionBar = page.locator('.diff-scope-action-bar');
  await expect(targetUrlControl).toBeVisible();
  const targetUrlBox = await targetUrlControl.boundingBox();
  const scopeActionBox = await scopeActionBar.boundingBox();
  expect(targetUrlBox.y + targetUrlBox.height).toBeLessThanOrEqual(scopeActionBox.y);
  expect(await page.locator('#targetUrlInput').evaluate(el => window.getComputedStyle(el).fontFamily)).toContain('monospace');

  const projectBtn = page.locator('#btnScopeModeProject');
  const diffBtn = page.locator('#btnScopeModeDiff');
  const projectWhiteSpace = await projectBtn.evaluate(el => window.getComputedStyle(el).whiteSpace);
  const diffWhiteSpace = await diffBtn.evaluate(el => window.getComputedStyle(el).whiteSpace);
  expect(projectWhiteSpace).toBe('nowrap');
  expect(diffWhiteSpace).toBe('nowrap');

  // 4. 驗證管線流程位於生成測案按鈕下方，由上往下排列
  const generateBtnBox = await page.locator('#btnGenerateFlow').boundingBox();
  const pipelineBox = await page.locator('#flowColPipeline').boundingBox();
  expect(pipelineBox).toBeTruthy();
  expect(pipelineBox.y).toBeGreaterThanOrEqual(generateBtnBox.y + generateBtnBox.height - 2);
  const pipelineHeaderBox = await page.locator('#flowColPipeline .header-left').boundingBox();
  const statusBadgeBox = await page.locator('#flowStatusBadge').boundingBox();
  expect(statusBadgeBox.y).toBeGreaterThanOrEqual(pipelineHeaderBox.y + pipelineHeaderBox.height - 1);
  expect(await page.locator('#flowStatusBadge').evaluate(el => window.getComputedStyle(el).whiteSpace)).toBe('nowrap');

  const stepNodes = page.locator('.function-flow-track .flow-step-node');
  const count = await stepNodes.count();
  expect(count).toBeGreaterThanOrEqual(4);

  const boxes = [];
  for (let i = 0; i < count; i++) {
    boxes.push(await stepNodes.nth(i).boundingBox());
  }
  for (let i = 0; i < boxes.length - 1; i++) {
    expect(boxes[i].y).toBeLessThan(boxes[i + 1].y);
  }

  // 5. 點選「生成測案」後，03 欄位顯示測案清單且 casesSection 無內邊距 (0px padding)，且執行區塊顯現
  await page.locator('#btnGenerateFlow').click();
  await expect(page.locator('#casesSection')).toBeVisible();
  await expect(col03Footer).toBeVisible();
  await expect(col03Footer.locator('#btnExecutePlan')).toBeVisible();
  const casesPadding = await page.locator('#casesSection').evaluate(el => window.getComputedStyle(el).padding);
  expect(casesPadding).toBe('0px');
  const caseCards = page.locator('#caseMasterList .case-item-card');
  await expect(caseCards).toHaveCount(20);
  await expect(page.locator('#btnExecutePlan')).toBeEnabled();
  expect(await col03Footer.evaluate(el => window.getComputedStyle(el).position)).toBe('static');
  const casesHeight = await page.locator('#casesSection').evaluate(el => ({
    clientHeight: el.clientHeight,
    scrollHeight: el.scrollHeight
  }));
  expect(casesHeight.clientHeight).toBeGreaterThanOrEqual(casesHeight.scrollHeight);
  const caseFooterLayout = await page.locator('#col03Cases').evaluate(column => {
    const lastCaseBox = column.querySelector('.case-item-card:last-child').getBoundingClientRect();
    const footerBox = column.querySelector('#actionTriggerSection').getBoundingClientRect();
    return { lastCaseBottom: lastCaseBox.bottom, footerTop: footerBox.top };
  });
  expect(caseFooterLayout.footerTop).toBeGreaterThanOrEqual(caseFooterLayout.lastCaseBottom - 2);

  // 6. 點選測案項目，於項目右側彈出浮動視窗 (#caseInspectorPopover) 顯示細節
  await expect(page.locator('#caseInspectorPopover')).toBeHidden();
  await page.locator('#caseMasterList .case-item-card').first().click();
  await expect(page.locator('#caseInspectorPopover')).toBeVisible();
  await expect(page.locator('#inspectorCaseTitle')).toContainText('PLAN-01');
  const inspectorPosition = await page.locator('#caseInspectorPopover').evaluate(el => window.getComputedStyle(el).position);
  expect(inspectorPosition).toBe('fixed');
  await expect(page.locator('#caseInspectorPopover')).not.toContainText('個別測案 Token 消耗明細');
  const qualityHeadingBox = await page.locator('#inspectQualityBox .quality-score-heading').boundingBox();
  const qualityPillBox = await page.locator('#inspectQualityBox .score-pill').boundingBox();
  expect(qualityPillBox.y).toBeGreaterThanOrEqual(qualityHeadingBox.y + qualityHeadingBox.height);

  // 7. 點選關閉按鈕可收合浮動視窗
  await page.locator('#btnCloseInspectorPopover').click();
  await expect(page.locator('#caseInspectorPopover')).toBeHidden();

  expect(browserErrors).toEqual([]);
  expect(serverErrors).toEqual([]);
});

test('選擇專案範圍彈窗：資料夾預設關閉且可切換隱藏非 E2E 檔案 (.github / .claude / env)', async ({ page }) => {
  const browserErrors = [];
  const serverErrors = [];

  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(message.text());
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
      harness: { hasHarness: false },
      git: { branch: 'main' }
    }
  }));
  await page.route('**/api/history/all**', route => route.fulfill({ json: [] }));
  await page.route('**/api/inspect/project-files', route => route.fulfill({
    json: {
      files: [
        { filePath: 'src/index.js', isMutable: true, extension: '.js' },
        { filePath: '.github/workflows/ci.yml', isMutable: false, extension: '.yml' },
        { filePath: '.claude/settings.json', isMutable: false, extension: '.json' },
        { filePath: 'env/local.env', isMutable: false, extension: '.env' }
      ],
      summary: { totalFiles: 4, mutableFiles: 1 }
    }
  }));

  await page.goto('/');

  // 開啟自訂範圍彈窗
  await page.locator('#btnScopeModeCustom').click();
  await expect(page.locator('#scopeModalOverlay')).toBeVisible();

  // 1. 驗證 #chkHideNonE2E 預設為勾選
  const chkHide = page.locator('#chkHideNonE2E');
  await expect(chkHide).toBeChecked();

  // 2. 驗證非 E2E 檔案被隱藏，只顯示 src 目錄
  await expect(page.locator('#modalDiffTreeContainer .diff-tree-node[data-path="src"]')).toBeVisible();
  await expect(page.locator('#modalDiffTreeContainer .diff-tree-node[data-path=".github"]')).toBeHidden();
  await expect(page.locator('#modalDiffTreeContainer .diff-tree-node[data-path=".claude"]')).toBeHidden();
  await expect(page.locator('#modalDiffTreeContainer .diff-tree-node[data-path="env"]')).toBeHidden();
  await expect(page.locator('#modalSelectedCountBadge')).toHaveText('已選 1 / 1 個檔案');

  // 3. 驗證資料夾節點預設為收合狀態 (aria-expanded="false", children display: none)
  const srcToggle = page.locator('#modalDiffTreeContainer .diff-tree-node[data-path="src"] .diff-tree-toggle-btn');
  await expect(srcToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#modalDiffTreeContainer .diff-tree-node[data-path="src"] .diff-tree-children')).toBeHidden();

  // 4. 取消勾選隱藏非 E2E 項目，驗證 .github, .claude, env 重新出現
  await chkHide.uncheck();
  await expect(chkHide).not.toBeChecked();
  await expect(page.locator('#modalDiffTreeContainer .diff-tree-node[data-path=".github"]')).toBeVisible();
  await expect(page.locator('#modalDiffTreeContainer .diff-tree-node[data-path=".claude"]')).toBeVisible();
  await expect(page.locator('#modalDiffTreeContainer .diff-tree-node[data-path="env"]')).toBeVisible();
  await expect(page.locator('#modalSelectedCountBadge')).toHaveText('已選 4 / 4 個檔案');

  // 5. 重新勾選隱藏非 E2E 項目，驗證再度被過濾
  await chkHide.check();
  await expect(page.locator('#modalDiffTreeContainer .diff-tree-node[data-path=".github"]')).toBeHidden();
  await expect(page.locator('#modalSelectedCountBadge')).toHaveText('已選 1 / 1 個檔案');

  expect(browserErrors).toEqual([]);
  expect(serverErrors).toEqual([]);
});