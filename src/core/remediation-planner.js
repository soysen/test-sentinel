const path = require('path');

function compact(value, maxLength = 240) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function failedCases(report) {
  const cases = report?.result?.caseComparisons || report?.caseComparisons || [];
  return cases.filter(testCase => ['FAIL', 'INCONCLUSIVE', 'NOT_EVALUATED'].includes(testCase.status));
}

function buildDiffActions(report) {
  const actions = [];
  const killRate = report.scorecard?.metrics?.mutationKillRate;
  const runtimeErrors = report.result?.silentErrorsCaught || [];
  const failures = failedCases(report);

  if (report.result?.status === 'INCONCLUSIVE' && report.result?.reason) {
    const baseline = report.result?.baselineEvidence;
    const baselineDetail = baseline
      ? `命令：${baseline.command || 'N/A'}；Exit Code：${baseline.exitCode ?? 'unknown'}；輸出：${compact(baseline.stderr || baseline.stdout || report.result.reason)}`
      : compact(report.result.reason);
    actions.push({
      priority: report.result?.baselinePassed === false ? 'HIGH' : 'MEDIUM',
      title: report.result?.baselinePassed === false ? '確認測試命令與既有基線' : '補齊模式 A 評測條件',
      detail: baselineDetail
    });
  }

  if (Number.isFinite(killRate) && killRate < 90) {
    actions.push({
      priority: killRate < 60 ? 'HIGH' : 'MEDIUM',
      title: '強化存活變異點的斷言',
      detail: `目前變異擊殺率為 ${killRate}%。針對 ${failures.slice(0, 3).map(item => item.id).join('、') || '存活變異'} 補上可觀測結果與邊界條件斷言。`
    });
  }
  if (runtimeErrors.length > 0) {
    actions.push({
      priority: 'HIGH',
      title: '修復瀏覽器運行期錯誤',
      detail: `先處理 pageerror、console error 或 HTTP 500；已捕獲 ${runtimeErrors.length} 筆錯誤。`
    });
  }
  if (report.scorecard?.evidence?.runtimeSafety !== 'MEASURED') {
    actions.push({
      priority: 'MEDIUM',
      title: 'Runtime 探針尚未執行',
      detail: 'Test Sentinel 已產生安全網探針，但目前測試命令未執行該探針。請設定可用的 target URL 與 Playwright 執行條件後重試；這不是產品程式缺陷的直接證據。'
    });
  }
  return actions;
}

function buildSkillActions(report) {
  const actions = [];
  const failures = failedCases(report);
  const skillPath = report.path || 'SKILL.md';
  if (failures.length > 0) {
    actions.push({
      priority: 'HIGH',
      title: '修正 Skill 觸發邊界',
      detail: `調整 ${skillPath} 的 description、正向觸發條件與 Negative Triggers，優先處理 ${failures.slice(0, 3).map(item => item.id).join('、')}。`
    });
  }
  if (report.promptAudit?.isBloated) {
    actions.push({
      priority: 'MEDIUM',
      title: '縮減 Skill Context',
      detail: `目前約 ${report.promptAudit.estimatedTokens} tokens；將大型範例與參考資料移至 references/，保留必要流程與限制。`
    });
  }
  if (report.metrics?.averageQualityScore !== null && report.metrics?.averageQualityScore < 90) {
    actions.push({
      priority: 'MEDIUM',
      title: '補強產出品質契約',
      detail: '依失敗的 qualityChecks 補上輸出格式、驗證步驟與禁止事項，避免只改善路由卻未改善答案品質。'
    });
  }
  return actions;
}

function buildHarnessActions(report) {
  const actions = [];
  const checks = Array.isArray(report.checks) ? report.checks : [];
  const failed = checks.filter(check => check.passed === false);
  const unevaluated = checks.filter(check => check.passed === null || check.applicable === false);

  if (report.reason || checks.find(check => check.name?.includes('Baseline') && check.passed === false)) {
    actions.push({ priority: 'HIGH', title: '先修復 Harness 正常基線', detail: compact(report.reason || failed[0]?.detail) });
  }
  if (failed.some(check => check.name?.includes('Fault Sensitivity'))) {
    actions.push({ priority: 'HIGH', title: '讓 Harness 正確傳遞失敗退出碼', detail: '移除吞錯邏輯，檢查每段命令退出碼，並確保設定損壞時回傳非 0。' });
  }
  if (failed.some(check => check.name?.includes('Idempotency'))) {
    actions.push({ priority: 'MEDIUM', title: '清理 Harness 執行殘留', detail: '加入可重入的 cleanup/trap，並將合理產物納入明確的輸出或 ignore 規則。' });
  }
  if (unevaluated.length > 0) {
    const faultTarget = checks.find(check => check.targetFile)?.targetFile;
    actions.push({
      priority: 'MEDIUM',
      title: '補齊未量測的 Harness 證據',
      detail: faultTarget
        ? `確認 ${faultTarget} 確實由 Harness 讀取，並補上可驗證的失敗路徑。`
        : '提供 Harness 實際讀取的設定檔作為 fault target，並解析底層腳本的退出碼保護。'
    });
  }
  return actions;
}

function buildEvidence(mode, report) {
  const failures = failedCases(report).slice(0, 5).flatMap(testCase => {
    const heading = `- ${testCase.id || testCase.name}: ${compact(testCase.delta || testCase.actual || testCase.objective)}`;
    if (mode !== 'diff-e2e') return [heading];

    const mutation = testCase.mutation || {};
    const filePath = mutation.filePath || testCase.evidence?.filePath;
    const details = [];
    if (filePath) details.push(`  檔案: ${filePath}`);
    if (mutation.originalLine) details.push(`  原始內容: ${compact(mutation.originalLine, 320)}`);
    if (mutation.mutatedLine) details.push(`  變異內容: ${compact(mutation.mutatedLine, 320)}`);
    if (details.length === 0 && testCase.input) details.push(`  定位資訊: ${compact(testCase.input, 320)}`);
    return [heading, ...details];
  });
  const checks = (report.checks || []).filter(check => check.passed !== true).slice(0, 5).map(check =>
    `- ${check.name}: ${compact(check.detail)}`
  );
  const score = report.scorecard?.overallScore ?? report.metrics?.overallScore ?? report.healthScore;
  return [
    `- 評測模式: ${mode}`,
    `- 評測狀態: ${report.result?.status || report.status || report.scorecard?.status || 'UNKNOWN'}`,
    `- 品質分數: ${Number.isFinite(score) ? `${score}/100` : 'N/A'}`,
    ...failures,
    ...checks
  ];
}

function buildRemediationPlan({ mode, projectPath, report }) {
  const builders = {
    'diff-e2e': buildDiffActions,
    'skill-eval': buildSkillActions,
    'harness-eval': buildHarnessActions
  };
  const actions = (builders[mode]?.(report) || []);
  const severity = actions.some(action => action.priority === 'HIGH')
    ? 'HIGH'
    : (actions.some(action => action.priority === 'MEDIUM') ? 'MEDIUM' : 'NONE');
  const required = severity !== 'NONE';

  if (!required) {
    return {
      actions: [],
      aiPrompt: null,
      severity,
      required,
      generatedFrom: 'MEASURED_EVIDENCE'
    };
  }

  const relativeProject = projectPath ? path.basename(projectPath) : '目前專案';
  const evidence = buildEvidence(mode, report);
  const actionLines = actions.map((action, index) => `${index + 1}. [${action.priority}] ${action.title}：${action.detail}`);
  const verification = mode === 'harness-eval'
    ? report.harnessScript || '執行專案既有 Harness 檢查命令'
    : mode === 'skill-eval'
      ? '重新執行 Test Sentinel 模式 B，確認正向召回與負向抑制測案'
      : '重新執行 Test Sentinel 模式 A，確認 baseline、變異擊殺與 Runtime 安全網';

  const hasSurvivedMutations = failedCases(report).some(testCase => testCase.status === 'FAIL');
  const mutationCompletion = hasSurvivedMutations
    ? '\n- 重新評測時，列出的存活變異應被擊殺；無法達成時必須保留實際輸出並說明阻礙。'
    : '';
  const aiPrompt = `你目前應位於專案「${relativeProject}」的 workspace。請直接處理以下 Test Sentinel 評測問題，不要只提供建議。若目前 workspace 不是此專案，先停止並回報，不要修改其他專案。\n\n實測證據：\n${evidence.join('\n')}\n\n改善目標：\n${actionLines.join('\n')}\n\n執行步驟：\n1. 先確認 Test Sentinel 選用的測試命令、實際輸出與執行環境，再判斷是否需要修改目標專案。\n2. 優先補強或修正測試斷言；只有證據指出產品程式有缺陷時才修改正式程式碼。\n3. 為每個修正保留可重現問題的最小回歸測試。\n4. 執行驗證：${verification}\n\n完成條件：\n- 上述 HIGH/MEDIUM 改善項目皆有對應修改或具證據的「不修改」說明。\n- 原有測試與新增回歸測試通過。${mutationCompletion}\n\n限制：\n- 採最小變更，遵循專案既有架構與風格，不重寫無關程式。\n- 不得直接修改 .test-eval/diff-probes/ 內的暫存探針來製造通過結果。\n- 不得捏造測試、Token、分數或成功結果；無法驗證時明確標示。\n- 最後回報根因、修改檔案、驗證命令、實際結果與仍未解決的風險。`;

  return { actions, aiPrompt, severity, required, generatedFrom: 'MEASURED_EVIDENCE' };
}

module.exports = { buildRemediationPlan };