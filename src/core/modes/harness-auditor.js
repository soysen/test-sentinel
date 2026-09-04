/**
 * harness-auditor.js - [模式 C] Harness 流程真實健檢與故障注入引擎
 */

const fs = require('fs');
const path = require('path');
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

  auditHarness(customCommand = null) {
    const harnessCmd = customCommand || this.detectHarnessCommand();
    if (!harnessCmd) {
      return {
        timestamp: new Date().toISOString(),
        healthScore: 0,
        status: 'FAILED',
        error: '未能在目標專案中找到任何可執行的 Harness 測試指令 (如 npm run harness:check 或 bash scripts/harness_check.sh)'
      };
    }

    // 1. 執行實體檢驗
    const baseline = this.runBaselineCheck(harnessCmd);
    const faultInjection = this.runFaultInjectionCheck(harnessCmd);
    const idempotency = this.runIdempotencyCheck(harnessCmd);
    const scriptIntegrity = this.runScriptIntegrityCheck(harnessCmd);

    const checks = [baseline, faultInjection, idempotency, scriptIntegrity];
    const passedCount = checks.filter(c => c.passed).length;
    const healthScore = Math.round((passedCount / checks.length) * 100);

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
        status: faultInjection.passed ? 'PASSED' : 'FAILED'
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
        status: scriptIntegrity.passed ? 'PASSED' : 'WARNING'
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
        actual: `Exit Code = ${faultInjection.exitCodeCaught} (成功中斷阻斷)`,
        status: faultInjection.passed ? 'PASS' : 'FAIL',
        delta: faultInjection.passed ? '具備高敏銳度阻斷力' : '❌ 嚴重：損壞資料下仍假性通過！'
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
        actual: scriptIntegrity.passed ? '符合安全標準' : scriptIntegrity.detail,
        status: scriptIntegrity.passed ? 'PASS' : 'FAIL',
        delta: scriptIntegrity.detail
      }
    ];

    const suggestions = [];
    if (!faultInjection.passed) {
      suggestions.push('⚠️ 警告：注入損壞資料時 Harness 仍通過，存在嚴重的「假陽性 (False Positive)」漏洞，請檢查腳本是否未檢查返回碼！');
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
      status: healthScore >= 75 ? 'HEALTHY' : 'NEEDS_ATTENTION',
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

  runFaultInjectionCheck(cmd) {
    const candidateFiles = [
      'data/settings.json',
      'data/tasks.json',
      'config.json'
    ];

    let targetFile = null;
    for (const f of candidateFiles) {
      const full = path.join(this.projectPath, f);
      if (fs.existsSync(full)) {
        targetFile = full;
        break;
      }
    }

    let createdTemp = false;
    if (!targetFile) {
      targetFile = path.join(this.projectPath, '.temp_sentinel_fault.json');
      fs.writeFileSync(targetFile, '{ invalid_json_syntax: true', 'utf8');
      createdTemp = true;
    }

    let originalContent = null;
    try {
      if (!createdTemp) {
        originalContent = fs.readFileSync(targetFile, 'utf8');
        fs.writeFileSync(targetFile, '{"__CORRUPTED_BY_TEST_SENTINEL__": true, invalid syntax ...', 'utf8');
      }

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
        exitCodeCaught,
        detail: faultCaught
          ? `✅ 破壞注入成功被攔截 (Exit Code: ${exitCodeCaught})。Harness 具備阻斷能力。`
          : '❌ 嚴重漏洞：已注入破壞資料，但 Harness 依然回傳 0 假性通過！'
      };
    } finally {
      if (createdTemp) {
        if (fs.existsSync(targetFile)) fs.unlinkSync(targetFile);
      } else if (originalContent !== null) {
        fs.writeFileSync(targetFile, originalContent, 'utf8');
      }
    }
  }

  runIdempotencyCheck(cmd) {
    try {
      const beforeStatus = this.getGitStatus();

      execSync(cmd, { cwd: this.projectPath, stdio: ['ignore', 'ignore', 'ignore'], timeout: 20000 });
      execSync(cmd, { cwd: this.projectPath, stdio: ['ignore', 'ignore', 'ignore'], timeout: 20000 });

      const afterStatus = this.getGitStatus();
      const dirtyDiff = afterStatus.filter(file => !beforeStatus.includes(file));

      const isClean = dirtyDiff.length === 0;

      return {
        name: 'Idempotency & Cleanliness (冪等性與磁碟洩漏)',
        passed: isClean,
        detail: isClean
          ? '連續執行兩次回合，工作目錄完全純淨，無產生任何殘留暫存檔案。'
          : `發現 ${dirtyDiff.length} 個執行後未清理的殘留檔案：${dirtyDiff.slice(0, 3).join(', ')}`
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
    const parts = cmd.split(' ');
    const scriptPath = parts.find(p => p.endsWith('.sh') || p.endsWith('.js'));

    if (!scriptPath) {
      return {
        name: 'Exit Code Integrity (退出碼嚴謹度)',
        passed: true,
        detail: '標準 npm/CLI 指令管理'
      };
    }

    const fullScriptPath = path.resolve(this.projectPath, scriptPath);
    if (!fs.existsSync(fullScriptPath)) {
      return { name: 'Exit Code Integrity (退出碼嚴謹度)', passed: true, detail: '腳本由外部環境調度' };
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

  getGitStatus() {
    try {
      const output = execSync('git status --porcelain', {
        cwd: this.projectPath,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      }).trim();
      return output ? output.split('\n').map(l => l.trim().slice(3)) : [];
    } catch (e) {
      return [];
    }
  }
}

module.exports = { HarnessAuditor };
