/**
 * diff-e2e-runner.js - [模式 A] Git Diff E2E 智慧測試與變異鑑別引擎
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class DiffE2ERunner {
  constructor(projectPath) {
    this.projectPath = path.resolve(projectPath);
    this.probeDir = path.join(this.projectPath, '.test-eval', 'diff-probes');
    this.ensureDir();
  }

  ensureDir() {
    if (!fs.existsSync(this.probeDir)) {
      fs.mkdirSync(this.probeDir, { recursive: true });
    }
  }

  generateProbeSpec(options = {}) {
    const timestamp = Date.now();
    const probeFile = path.join(this.probeDir, `probe_${timestamp}.spec.js`);
    const executionMarker = `[TEST_SENTINEL_PROBE_EXECUTED:${timestamp}]`;
    const targetUrl = options.targetUrl || 'http://localhost:3000';
    const mockSnippet = options.mockSnippet || '';
    const interactions = options.interactions || [
      "await page.waitForLoadState('networkidle');",
      "const buttons = await page.getByRole('button').all();",
      "if (buttons.length > 0) await buttons[0].click().catch(() => {});"
    ];

    const code = `
const { test, expect } = require('@playwright/test');

test.describe('Test Sentinel Ephemeral Probe [Timestamp: ${timestamp}]', () => {
  let uncaughtErrors = [];
  let serverErrors = [];

  test.beforeEach(async ({ page }) => {
    uncaughtErrors = [];
    serverErrors = [];

    // [Safety Net 1] 攔截所有未捕捉的前端 JS 崩潰
    page.on('pageerror', err => {
      uncaughtErrors.push(err.message);
    });

    // [Safety Net 2] 攔截 console.error
    page.on('console', msg => {
      if (msg.type() === 'error') {
        uncaughtErrors.push(msg.text());
      }
    });

    // [Safety Net 3] 攔截未預期的後端 500 錯誤
    page.on('response', res => {
      if (res.status() >= 500) {
        serverErrors.push(\`\${res.url()} returned HTTP \${res.status()}\`);
      }
    });

    ${mockSnippet}
  });

  test('Auto-generated behavior & silent crash probe', async ({ page }) => {
    console.log('${executionMarker}');
    await page.goto('${targetUrl}');

    ${interactions.join('\n    ')}

    // 斷言全域安全網：嚴禁任何未捕獲崩潰
    expect(uncaughtErrors, 'Uncaught browser errors detected').toEqual([]);
    expect(serverErrors, 'Server 5xx errors detected').toEqual([]);
  });
});
`;

    fs.writeFileSync(probeFile, code.trim(), 'utf8');
    return {
      probeFile,
      timestamp,
      executionMarker,
      relativeFile: path.relative(this.projectPath, probeFile)
    };
  }

  runEvaluation(options = {}) {
    const reportProgress = progress => {
      if (typeof options.onProgress !== 'function') return;
      try {
        options.onProgress(progress);
      } catch {}
    };
    const probe = this.generateProbeSpec(options);
    const mutations = options.mutations || [];
    const testCommand = options.testCommand || this.detectTestCommand();
    const commandTimeoutMs = options.timeoutMs || 20000;
    const estimatedMaxMs = commandTimeoutMs * (1 + (mutations.length * 2));
    reportProgress({
      phase: 'probe',
      step: 2,
      percent: 10,
      message: '隔離探針已建立',
      estimatedMaxMs
    });

    if (!testCommand) {
      reportProgress({ phase: 'inconclusive', step: 2, percent: 100, message: '找不到可執行的測試命令' });
      return this.buildInconclusiveResult(
        probe,
        mutations,
        '未提供 testCommand，無法執行基線與變異測試。'
      );
    }

    reportProgress({ phase: 'baseline', step: 3, percent: 20, message: `正在執行基線：${testCommand}` });
    const baseline = this.runTestCommand(testCommand, options.timeoutMs);
    baseline.probeExecuted = `${baseline.stdout}\n${baseline.stderr}`.includes(probe.executionMarker);
    if (!baseline.passed) {
      reportProgress({ phase: 'inconclusive', step: 3, percent: 100, message: `基線失敗（Exit ${baseline.exitCode ?? 'unknown'}）` });
      return this.buildInconclusiveResult(
        probe,
        mutations,
        '基線測試未通過，變異結果不具判定效力。',
        baseline
      );
    }
    reportProgress({ phase: 'baseline-complete', step: 3, percent: 30, message: '基線測試通過' });

    if (mutations.length === 0) {
      reportProgress({ phase: 'inconclusive', step: 4, percent: 100, message: '沒有可執行的變異候選點' });
      return this.buildInconclusiveResult(
        probe,
        mutations,
        '未找到可執行的變異候選點。',
        baseline
      );
    }

    const mutationCases = mutations.map((mutation, index) => {
      const position = index + 1;
      const percent = 30 + Math.floor((index / mutations.length) * 60);
      reportProgress({
        phase: 'mutation',
        step: 4,
        percent,
        current: position,
        total: mutations.length,
        message: `正在執行變異 ${position}/${mutations.length}`
      });
      const result = this.evaluateMutation(mutation, testCommand, options.timeoutMs);
      reportProgress({
        phase: 'mutation-complete',
        step: 4,
        percent: 30 + Math.floor((position / mutations.length) * 60),
        current: position,
        total: mutations.length,
        message: `變異 ${position}/${mutations.length}：${result.status}`
      });
      return result;
    });
    const validCases = mutationCases.filter(result => ['KILLED', 'SURVIVED'].includes(result.status));
    const killedCount = validCases.filter(result => result.status === 'KILLED').length;
    const survivedCount = validCases.filter(result => result.status === 'SURVIVED').length;
    const killRate = validCases.length > 0
      ? Math.round((killedCount / validCases.length) * 100)
      : null;
    const evaluationStatus = validCases.length > 0 ? 'MEASURED' : 'INCONCLUSIVE';
    const hasRuntimeEvidence = baseline.probeExecuted;
    reportProgress({ phase: 'complete', step: 4, percent: 100, message: `評測完成，Kill Rate ${killRate ?? 'N/A'}%` });

    // 1. 定義測試標準
    const standards = [
      {
        name: '變異擊殺鑑別標準 (Mutation Sensitivity)',
        criterion: '當代碼關鍵條件 (如 ===, >, true) 被倒轉時，測試斷言必須能即時報錯 (Killed)，擊殺率需 >= 80%',
        target: 'Kill Rate >= 80%',
        status: killRate !== null && killRate >= 80 ? 'PASSED' : (killRate === null ? 'NOT_EVALUATED' : 'FAILED')
      },
      {
        name: '零靜默運行期崩潰 (Zero Silent Crashes)',
        criterion: '瀏覽器載入與點擊互動期間，嚴禁出現未捕獲的 pageerror 或 console.error',
        target: 'Uncaught Errors = 0',
        status: hasRuntimeEvidence ? 'PASSED' : 'NOT_EVALUATED'
      },
      {
        name: '零伺服器服務端異常 (Zero Server 5xx)',
        criterion: '所有後端 API 請求均需正常回應，不得出現 500/502/504 服務中斷',
        target: 'Server 5xx = 0',
        status: hasRuntimeEvidence ? 'PASSED' : 'NOT_EVALUATED'
      }
    ];

    // 2. 定義可視化流程步驟
    const workflow = [
      { step: 1, name: 'Git Diff 萃取', desc: '鎖定變更檔案並識別邏輯關鍵行', status: 'completed' },
      { step: 2, name: '探針合成 (.test-eval)', desc: '產生隔離測試腳本，掛載全域監聽器', status: 'completed' },
      { step: 3, name: '沙盒互動與安全網', desc: '模擬使用者操作，監控 Console 與 Network', status: 'completed' },
      { step: 4, name: '變異反向攻擊測試', desc: '注入倒轉變異運算符，檢驗斷言殺死率', status: 'completed' }
    ];

    const caseComparisons = mutationCases.map((result, index) => ({
      id: `DIFF-TC-${String(index + 1).padStart(2, '0')}`,
      name: result.mutation.type || '程式碼變異',
      type: '變異擊殺測試',
      input: `${result.mutation.filePath}: ${result.mutation.originalLine}`,
      expected: '測試因行為斷言失敗而回傳非零狀態',
      actual: `${result.status} (Exit Code: ${result.evidence.exitCode})`,
      status: result.status === 'KILLED' ? 'PASS' : (result.status === 'SURVIVED' ? 'FAIL' : 'INCONCLUSIVE'),
      delta: result.reason,
      mutation: {
        filePath: result.mutation.filePath,
        originalLine: result.mutation.originalLine,
        mutatedLine: result.mutation.mutatedLine,
        type: result.mutation.type
      },
      evidence: result.evidence
    }));

    const result = {
      timestamp: new Date().toISOString(),
      probeFile: probe.relativeFile,
      status: evaluationStatus,
      baselinePassed: baseline.passed,
      baselineEvidence: baseline,
      probeExecution: {
        status: hasRuntimeEvidence ? 'MEASURED' : 'NOT_MEASURED',
        marker: probe.executionMarker,
        reason: hasRuntimeEvidence ? null : '測試輸出中未發現探針執行標記，不能宣稱已量測瀏覽器 runtime safety。'
      },
      standards,
      workflow,
      caseComparisons,
      silentErrorsCaught: hasRuntimeEvidence ? [] : null,
      networkFailuresCaught: hasRuntimeEvidence ? [] : null,
      mutationResults: {
        totalMutations: mutations.length,
        validMutations: validCases.length,
        killedCount,
        survivedCount,
        invalidCount: mutationCases.length - validCases.length,
        killRate
      },
      discriminativeScore: killRate
    };

    return result;
  }

  detectTestCommand() {
    const packagePath = path.join(this.projectPath, 'package.json');
    if (!fs.existsSync(packagePath)) return null;
    try {
      const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      const scripts = pkg.scripts || {};
      for (const scriptName of ['test:e2e', 'e2e', 'test']) {
        if (scripts[scriptName]) return `npm run ${scriptName}`;
      }
    } catch (error) {
      return null;
    }
    return null;
  }

  runTestCommand(command, timeoutMs = 20000) {
    const startedAt = Date.now();
    try {
      const stdout = execSync(command, {
        cwd: this.projectPath,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: timeoutMs
      });
      return { passed: true, exitCode: 0, durationMs: Date.now() - startedAt, stdout: stdout.slice(-2000), stderr: '' };
    } catch (error) {
      return {
        passed: false,
        exitCode: typeof error.status === 'number' ? error.status : null,
        durationMs: Date.now() - startedAt,
        stdout: String(error.stdout || '').slice(-2000),
        stderr: String(error.stderr || error.message || '').slice(-2000),
        timedOut: error.code === 'ETIMEDOUT',
        signal: error.signal || null
      };
    }
  }

  evaluateMutation(mutation, testCommand, timeoutMs) {
    const targetPath = path.resolve(this.projectPath, mutation.filePath || '');
    const evidence = { command: testCommand, filePath: mutation.filePath, exitCode: null };
    if (!targetPath.startsWith(this.projectPath + path.sep) || !fs.existsSync(targetPath)) {
      return { mutation, status: 'INVALID', reason: '變異目標不存在或超出專案範圍。', evidence };
    }

    const originalContent = fs.readFileSync(targetPath, 'utf8');
    const occurrences = originalContent.split(mutation.originalLine).length - 1;
    if (!mutation.originalLine || !mutation.mutatedLine || occurrences !== 1) {
      return { mutation, status: 'INVALID', reason: `原始程式行命中 ${occurrences} 次，無法安全套用變異。`, evidence };
    }

    let execution;
    try {
      fs.writeFileSync(targetPath, originalContent.replace(mutation.originalLine, mutation.mutatedLine), 'utf8');
      execution = this.runTestCommand(testCommand, timeoutMs);
      Object.assign(evidence, execution);
    } finally {
      fs.writeFileSync(targetPath, originalContent, 'utf8');
      evidence.sourceRestored = fs.readFileSync(targetPath, 'utf8') === originalContent;
    }

    if (execution.passed) {
      return { mutation, status: 'SURVIVED', reason: '變異後測試仍通過。', evidence };
    }
    if (execution.timedOut || this.looksLikeInfrastructureFailure(execution)) {
      return { mutation, status: 'INVALID', reason: '測試因逾時、語法或環境錯誤失敗，不能計為擊殺。', evidence };
    }

    const restoredBaseline = this.runTestCommand(testCommand, timeoutMs);
    evidence.restoredBaseline = {
      passed: restoredBaseline.passed,
      exitCode: restoredBaseline.exitCode,
      durationMs: restoredBaseline.durationMs
    };
    if (!restoredBaseline.passed) {
      return { mutation, status: 'INVALID', reason: '還原原始碼後測試仍失敗，無法證明失敗由變異造成。', evidence };
    }
    return { mutation, status: 'KILLED', reason: '變異失敗且還原後基線重新通過，確認測試能辨識此行為變更。', evidence };
  }

  looksLikeInfrastructureFailure(execution) {
    const output = `${execution.stdout}\n${execution.stderr}`;
    if (execution.signal) return true;
    return /SyntaxError|Cannot find module|command not found|ERR_MODULE_NOT_FOUND|ENOMEM|heap out of memory|out of memory|Maximum call stack size exceeded|stack overflow|SIGKILL|SIGSEGV|SIGABRT|terminated by signal|ENOSPC|no space left on device|EACCES|EPERM|permission denied|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EADDRINUSE/i.test(output);
  }

  buildInconclusiveResult(probe, mutations, reason, baselineEvidence = null) {
    return {
      timestamp: new Date().toISOString(),
      probeFile: probe.relativeFile,
      status: 'INCONCLUSIVE',
      reason,
      baselinePassed: baselineEvidence ? baselineEvidence.passed : null,
      baselineEvidence,
      standards: [],
      workflow: [],
      caseComparisons: [],
      silentErrorsCaught: null,
      networkFailuresCaught: null,
      mutationResults: {
        totalMutations: mutations.length,
        validMutations: 0,
        killedCount: 0,
        survivedCount: 0,
        invalidCount: 0,
        killRate: null
      },
      discriminativeScore: null
    };
  }

  promoteProbe(probeFile, destinationRelPath = 'tests/e2e/sentinel-promoted.spec.js') {
    const source = path.resolve(this.projectPath, probeFile);
    const dest = path.resolve(this.projectPath, destinationRelPath);

    if (!fs.existsSync(source)) {
      throw new Error(`Probe file not found: ${source}`);
    }

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(source, dest);

    return {
      promoted: true,
      source: path.relative(this.projectPath, source),
      destination: path.relative(this.projectPath, dest)
    };
  }
}

module.exports = { DiffE2ERunner };
