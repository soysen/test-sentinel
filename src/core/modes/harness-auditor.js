/**
 * harness-auditor.js - [模式 C] Harness 流程真實健檢與故障注入引擎
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

class HarnessAuditor {
  constructor(projectPath) {
    this.projectPath = path.resolve(projectPath);
  }

  detectHarnessCommand() {
    const pkgPath = path.join(this.projectPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.scripts && pkg.scripts['harness:check']) return 'npm run harness:check';
        if (pkg.scripts && pkg.scripts['test']) return 'npm test';
      } catch (e) {}
    }

    const candidateScripts = [
      '.github/harness/harness_check.sh',
      '.github/harness/check.sh',
      '.github/harness/test.sh',
      'scripts/harness_check.sh',
      'scripts/test.sh',
      'run_tests.sh',
      'test.sh'
    ];
    for (const s of candidateScripts) {
      if (fs.existsSync(path.join(this.projectPath, s))) {
        return `bash ${s}`;
      }
    }

    return null;
  }

  auditHarness(customCommand = null, options = {}) {
    const reportProgress = progress => {
      if (typeof options.onProgress !== 'function') return;
      try {
        options.onProgress(progress);
      } catch {}
    };
    const harnessCmd = customCommand || this.detectHarnessCommand();
    if (!harnessCmd) {
      reportProgress({ phase: 'inconclusive', step: 1, percent: 100, message: '找不到 Harness 執行命令' });
      return {
        timestamp: new Date().toISOString(),
        healthScore: 0,
        status: 'FAILED',
        error: '未能在目標專案中找到任何可執行的 Harness 測試指令 (如 npm run harness:check 或 bash scripts/harness_check.sh)'
      };
    }
    reportProgress({
      phase: 'command',
      step: 1,
      percent: 10,
      message: `已選擇命令：${harnessCmd}`,
      estimatedMaxMs: 75000
    });

    // 1. 執行實體檢驗
    reportProgress({ phase: 'baseline', step: 2, percent: 20, message: '正在執行正常基線' });
    const baseline = this.runBaselineCheck(harnessCmd);
    if (!baseline.passed) {
      reportProgress({ phase: 'inconclusive', step: 2, percent: 100, message: `基線失敗（Exit ${baseline.exitCode}）` });
      return this.buildBaselineFailureResult(harnessCmd, baseline);
    }
    reportProgress({ phase: 'baseline-complete', step: 2, percent: 35, message: '正常基線通過' });
    reportProgress({ phase: 'fault-injection', step: 3, percent: 45, message: '正在執行故障注入' });
    const faultInjection = this.runFaultInjectionCheck(harnessCmd, options.faultTarget);
    reportProgress({
      phase: 'fault-injection-complete',
      step: 3,
      percent: 60,
      message: faultInjection.applicable ? '故障注入完成' : '找不到可驗證的故障目標'
    });
    reportProgress({ phase: 'idempotency', step: 4, percent: 70, message: '正在連續執行兩回合冪等性檢查' });
    const idempotency = this.runIdempotencyCheck(harnessCmd);
    reportProgress({ phase: 'integrity', step: 4, percent: 90, message: '正在檢查腳本退出碼保護' });
    const scriptIntegrity = this.runScriptIntegrityCheck(harnessCmd);

    const checks = [baseline, faultInjection, idempotency, scriptIntegrity];
    const measuredChecks = checks.filter(check => typeof check.passed === 'boolean');
    const passedCount = measuredChecks.filter(check => check.passed).length;
    const healthScore = faultInjection.applicable && measuredChecks.length > 0
      ? Math.round((passedCount / measuredChecks.length) * 100)
      : null;
    const mandatoryChecksPassed = baseline.passed && faultInjection.passed && idempotency.passed;
    const auditStatus = !faultInjection.applicable
      ? 'INCONCLUSIVE'
      : (mandatoryChecksPassed ? 'HEALTHY' : 'UNHEALTHY');
    reportProgress({ phase: 'complete', step: 4, percent: 100, message: `Harness 評測完成：${auditStatus}` });

    // 2. 測試標準規格
    const standards = [
      {
        name: '正常基線標準 (Baseline Integrity)',
        criterion: '在正常無損壞環境下執行 Harness，Exit Code 必須為 0',
        target: 'Exit Code = 0',
        status: baseline.passed ? 'PASSED' : 'FAILED'
      },
      {
        name: '故障敏銳阻斷標準 (Fault Sensitivity / Anti-False-Positive)',
        criterion: '關鍵資料或設定損壞時，腳本必須以非 0 狀態碼立即阻斷退出，嚴禁假陽性通過',
        target: 'Exit Code != 0 on failure',
        status: !faultInjection.applicable ? 'NOT_EVALUATED' : (faultInjection.passed ? 'PASSED' : 'FAILED')
      },
      {
        name: '環境隔離與冪等無痕標準 (Idempotency & Cleanliness)',
        criterion: '連續執行 Harness 兩次回合，磁碟中未被 .gitignore 忽略的殘留檔案數必須為 0',
        target: 'Dirty Residue Files = 0',
        status: idempotency.passed ? 'PASSED' : 'FAILED'
      },
      {
        name: '腳本退出碼防吞噬審核 (Exit Code Protection)',
        criterion: '腳本必須開啟 set -e 且禁止使用 || true 遮蔽錯誤',
        target: 'set -e Enabled',
        status: scriptIntegrity.passed === true ? 'PASSED' : (scriptIntegrity.passed === null ? 'NOT_EVALUATED' : 'WARNING')
      }
    ];

    // 3. 可視化流程
    const workflow = [
      { step: 1, name: 'Harness 指令探索', desc: `鎖定可執行腳本 [${harnessCmd}]`, status: 'completed' },
      { step: 2, name: '正常基線實測', desc: '執行正常流程，驗證正常狀態下 Exit Code 為 0', status: baseline.passed ? 'completed' : 'failed' },
      { step: 3, name: '實體破壞注入攻擊', desc: '故意破壞設定檔，驗證是否具備攔截報警能力', status: faultInjection.passed ? 'completed' : 'failed' },
      { step: 4, name: '復原與環境隔離檢查', desc: '原樣復原檔案，連續執行兩次確認無磁碟殘留', status: idempotency.passed ? 'completed' : 'failed' }
    ];

    // 4. 測案逐項比對表 (Expected vs Actual)
    const caseComparisons = [
      {
        id: 'HARNESS-TC-01',
        name: '正常環境基線測試 (Baseline Test)',
        type: '正向驗證',
        input: `執行指令: ${harnessCmd}`,
        expected: 'Exit Code = 0 (正常順利通過)',
        actual: `Exit Code = ${baseline.exitCode}`,
        status: baseline.passed ? 'PASS' : 'FAIL',
        delta: baseline.passed ? '正常通過，無拋出錯誤' : '基線執行異常'
      },
      {
        id: 'HARNESS-TC-02',
        name: '實體破壞注入：損壞資料阻斷測試 (Fault Injection)',
        type: '負向破壞測試',
        input: '暫時將設定檔注入非法 JSON 語法並執行 Harness',
        expected: 'Exit Code != 0 (必須阻斷中斷，嚴禁假陽性通過)',
        actual: faultInjection.applicable ? `Exit Code = ${faultInjection.exitCodeCaught}` : '未找到可驗證的故障注入目標',
        status: !faultInjection.applicable ? 'INCONCLUSIVE' : (faultInjection.passed ? 'PASS' : 'FAIL'),
        delta: !faultInjection.applicable
          ? faultInjection.detail
          : (faultInjection.passed ? '具備高敏銳度阻斷力' : '❌ 嚴重：損壞資料下仍假性通過！')
      },
      {
        id: 'HARNESS-TC-03',
        name: '雙回合連續執行狀態隔離與無痕檢驗 (Idempotency)',
        type: '冪等性測試',
        input: '連續執行 Harness 2 次，比對前後 git status',
        expected: '未清理的殘留磁碟檔案數 = 0',
        actual: idempotency.passed ? '殘留檔案數 = 0 (工作目錄乾淨)' : '發現未隔離的殘留檔案',
        status: idempotency.passed ? 'PASS' : 'FAIL',
        delta: idempotency.passed ? '無狀態洩漏污染' : '存在磁碟污染'
      },
      {
        id: 'HARNESS-TC-04',
        name: 'Shell 腳本退出碼嚴謹度審查 (Exit Code Integrity)',
        type: '靜態防禦審查',
        input: '檢視腳本內容 set -e 宣告與 || true 模式',
        expected: '啟用 set -e，且無吞噬錯誤之語法',
        actual: scriptIntegrity.passed !== true ? '符合安全標準' : scriptIntegrity.detail,
        status: scriptIntegrity.passed === null ? 'NOT_EVALUATED' : (scriptIntegrity.passed ? 'PASS' : 'FAIL'),
        delta: scriptIntegrity.detail
      }
    ];

    const suggestions = [];
    if (faultInjection.applicable && !faultInjection.passed) {
      suggestions.push('⚠️ 警告：注入損壞資料時 Harness 仍通過，存在嚴重的「假陽性 (False Positive)」漏洞，請檢查腳本是否未檢查返回碼！');
    }
    if (!faultInjection.applicable) {
      suggestions.push('找不到 Harness 已知會讀取的故障目標，本次不產生健康分數；請提供可驗證的設定檔或資料檔。');
    }
    if (!idempotency.passed) {
      suggestions.push('⚠️ Harness 執行後殘留未加入 .gitignore 的暫存檔案，請在腳本結尾加入清理邏輯 (e.g. trap cleanup EXIT)。');
    }
    if (healthScore === 100) {
      suggestions.push('✅ Harness 具備健全的阻斷力與環境隔離性，無假陽性風險。');
    }

    return {
      timestamp: new Date().toISOString(),
      harnessScript: harnessCmd,
      healthScore,
      status: auditStatus,
      standards,
      workflow,
      caseComparisons,
      checks,
      suggestions
    };
  }

  runBaselineCheck(cmd) {
    try {
      const output = execSync(cmd, {
        cwd: this.projectPath,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 20000
      });

      return {
        name: 'Baseline Execution (正常基線執行)',
        passed: true,
        exitCode: 0,
        detail: 'Harness 在正常狀態下順利通過，輸出長度 ' + output.length + ' 字元。'
      };
    } catch (err) {
      return {
        name: 'Baseline Execution (正常基線執行)',
        passed: false,
        exitCode: err.status || 1,
        detail: '基線執行失敗：' + (err.stderr || err.stdout || err.message).slice(0, 300)
      };
    }
  }

  buildBaselineFailureResult(harnessCmd, baseline) {
    return {
      timestamp: new Date().toISOString(),
      harnessScript: harnessCmd,
      healthScore: null,
      status: 'INCONCLUSIVE',
      reason: '正常基線未通過，後續故障注入與冪等性結果不具判定效力。',
      standards: [
        {
          name: '正常基線標準 (Baseline Integrity)',
          criterion: '在正常無損壞環境下執行 Harness，Exit Code 必須為 0',
          target: 'Exit Code = 0',
          status: 'FAILED'
        },
        {
          name: '故障敏銳阻斷標準 (Fault Sensitivity / Anti-False-Positive)',
          criterion: '基線通過後才可執行故障注入',
          target: 'Exit Code != 0 on failure',
          status: 'NOT_EVALUATED'
        },
        {
          name: '環境隔離與冪等無痕標準 (Idempotency & Cleanliness)',
          criterion: '基線通過後才可執行重複運行檢查',
          target: 'Dirty Residue Files = 0',
          status: 'NOT_EVALUATED'
        }
      ],
      workflow: [
        { step: 1, name: 'Harness 指令探索', desc: `鎖定可執行腳本 [${harnessCmd}]`, status: 'completed' },
        { step: 2, name: '正常基線實測', desc: '正常狀態下 Exit Code 非 0，停止後續評測', status: 'failed' },
        { step: 3, name: '實體破壞注入攻擊', desc: '基線失敗，未執行', status: 'pending' },
        { step: 4, name: '復原與環境隔離檢查', desc: '基線失敗，未執行', status: 'pending' }
      ],
      caseComparisons: [
        {
          id: 'HARNESS-TC-01',
          name: '正常環境基線測試 (Baseline Test)',
          type: '正向驗證',
          input: `執行指令: ${harnessCmd}`,
          expected: 'Exit Code = 0 (正常順利通過)',
          actual: `Exit Code = ${baseline.exitCode}`,
          status: 'FAIL',
          delta: baseline.detail
        }
      ],
      checks: [baseline],
      suggestions: ['先修復正常基線，再執行故障注入與冪等性評測。']
    };
  }

  runFaultInjectionCheck(cmd, explicitTarget = null) {
    const candidateFiles = [
      'data/settings.json',
      'data/tasks.json',
      'config.json'
    ];

    let targetFile = null;
    if (explicitTarget) {
      const resolvedTarget = path.resolve(this.projectPath, explicitTarget);
      if (!resolvedTarget.startsWith(this.projectPath + path.sep) || !fs.existsSync(resolvedTarget) || !fs.statSync(resolvedTarget).isFile()) {
        return {
          name: 'Fault Sensitivity (實體故障注入測試)',
          passed: null,
          applicable: false,
          exitCodeCaught: null,
          detail: '指定的故障注入目標不存在、不是檔案或超出專案範圍。'
        };
      }
      targetFile = resolvedTarget;
    } else {
      for (const candidateFile of candidateFiles) {
        const fullPath = path.join(this.projectPath, candidateFile);
        if (fs.existsSync(fullPath)) {
          targetFile = fullPath;
          break;
        }
      }
    }

    if (!targetFile) {
      return {
        name: 'Fault Sensitivity (實體故障注入測試)',
        passed: null,
        applicable: false,
        exitCodeCaught: null,
        detail: '找不到 Harness 已知會讀取的設定檔；拒絕以無關暫存檔冒充有效故障注入。'
      };
    }

    let originalContent = null;
    try {
      originalContent = fs.readFileSync(targetFile, 'utf8');
      fs.writeFileSync(targetFile, '{"__CORRUPTED_BY_TEST_SENTINEL__": true, invalid syntax ...', 'utf8');

      let faultCaught = false;
      let exitCodeCaught = 0;

      try {
        execSync(cmd, {
          cwd: this.projectPath,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 15000
        });
        faultCaught = false;
      } catch (e) {
        faultCaught = true;
        exitCodeCaught = e.status || 1;
      }

      return {
        name: 'Fault Sensitivity (實體故障注入測試)',
        passed: faultCaught,
        applicable: true,
        targetFile: path.relative(this.projectPath, targetFile),
        exitCodeCaught,
        detail: faultCaught
          ? `✅ 破壞注入成功被攔截 (Exit Code: ${exitCodeCaught})。Harness 具備阻斷能力。`
          : '❌ 嚴重漏洞：已注入破壞資料，但 Harness 依然回傳 0 假性通過！'
      };
    } finally {
      if (originalContent !== null) {
        fs.writeFileSync(targetFile, originalContent, 'utf8');
      }
    }
  }

  runIdempotencyCheck(cmd) {
    try {
      const beforeStatus = this.getWorktreeFingerprint();

      execSync(cmd, { cwd: this.projectPath, stdio: ['ignore', 'ignore', 'ignore'], timeout: 20000 });
      execSync(cmd, { cwd: this.projectPath, stdio: ['ignore', 'ignore', 'ignore'], timeout: 20000 });

      const afterStatus = this.getWorktreeFingerprint();
      const isClean = beforeStatus === afterStatus;

      return {
        name: 'Idempotency & Cleanliness (冪等性與磁碟洩漏)',
        passed: isClean,
        detail: isClean
          ? '連續執行兩次回合，工作目錄完全純淨，無產生任何殘留暫存檔案。'
          : '連續執行後工作樹內容或未追蹤檔案發生變化。'
      };
    } catch (e) {
      return {
        name: 'Idempotency & Cleanliness (冪等性與磁碟洩漏)',
        passed: false,
        detail: `執行期異常: ${e.message}`
      };
    }
  }

  runScriptIntegrityCheck(cmd) {
    if (/^npm\s+(?:run\s+)?[\w:-]+$/.test(cmd.trim())) {
      return {
        name: 'Exit Code Integrity (退出碼嚴謹度)',
        passed: null,
        detail: 'npm script 的退出碼完整性需解析實際命令鏈，目前不以套件管理器包裝判定為通過。'
      };
    }

    const parts = cmd.split(' ');
    const scriptPath = parts.find(p => p.endsWith('.sh') || p.endsWith('.js'));

    if (!scriptPath) {
      return {
        name: 'Exit Code Integrity (退出碼嚴謹度)',
        passed: null,
        detail: '無法定位可靜態審核的腳本，標記為未評估。'
      };
    }

    const fullScriptPath = path.resolve(this.projectPath, scriptPath);
    if (!fs.existsSync(fullScriptPath)) {
      return { name: 'Exit Code Integrity (退出碼嚴謹度)', passed: null, detail: '腳本由外部環境調度，標記為未評估。' };
    }

    const content = fs.readFileSync(fullScriptPath, 'utf8');
    const hasSetE = content.includes('set -e');
    const hasSwallowedErrors = content.includes('|| true') || content.includes('|| :');

    const passed = hasSetE && !hasSwallowedErrors;

    return {
      name: 'Exit Code Integrity (腳本退出碼審核)',
      passed,
      detail: passed
        ? '腳本含有 set -e 嚴謹保護，無 || true 忽略錯誤之模式。'
        : (!hasSetE ? '⚠️ 腳本開頭缺少 set -e，命令出錯可能繼續執行。' : '⚠️ 發現 || true 模式，可能遮蔽重要失敗。')
    };
  }

  getWorktreeFingerprint() {
    try {
      const trackedDiff = execSync('git diff --binary HEAD --', {
        cwd: this.projectPath,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      });
      const untrackedOutput = execSync('git ls-files --others --exclude-standard -z', {
        cwd: this.projectPath,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      });
      const untrackedFiles = untrackedOutput.split('\0').filter(Boolean).map(filePath => {
        const fullPath = path.join(this.projectPath, filePath);
        const digest = fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()
          ? crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex')
          : null;
        return { filePath, digest };
      });
      return JSON.stringify({ trackedDiff, untrackedFiles });
    } catch (e) {
      return this.getDirectoryFingerprint();
    }
  }

  getDirectoryFingerprint() {
    const entries = [];
    const visit = currentPath => {
      fs.readdirSync(currentPath, { withFileTypes: true }).forEach(entry => {
        if (['.git', 'node_modules', '.test-eval'].includes(entry.name)) return;
        const fullPath = path.join(currentPath, entry.name);
        if (entry.isDirectory()) return visit(fullPath);
        if (!entry.isFile()) return;
        entries.push({
          filePath: path.relative(this.projectPath, fullPath),
          digest: crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex')
        });
      });
    };
    visit(this.projectPath);
    return JSON.stringify(entries.sort((left, right) => left.filePath.localeCompare(right.filePath)));
  }
}

module.exports = { HarnessAuditor };
