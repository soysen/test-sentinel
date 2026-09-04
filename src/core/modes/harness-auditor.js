/**
 * harness-auditor.js - [模式 C] Harness 流程真實健檢與故障注入引擎
 * 1. 真實執行基線測試 (Baseline Execution)
 * 2. 實體故障注入 (Fault Injection): 暫時破壞 JSON / 設定，檢驗 Harness 是否具備阻斷報警能力 (防假陽性)
 * 3. 實體冪等性與磁碟殘留檢測 (Idempotency Check): 檢測是否有未清理的暫存檔或狀態污染
 * 4. 腳本退出碼安全審查 (Exit Code Integrity)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class HarnessAuditor {
  constructor(projectPath) {
    this.projectPath = path.resolve(projectPath);
  }

  /**
   * 自動推導專案可執行的 Harness 指令
   */
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

  /**
   * 執行完整健檢流程
   */
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

    const checks = [];

    // 1. 基線正向執行測試
    const baseline = this.runBaselineCheck(harnessCmd);
    checks.push(baseline);

    // 2. 實體故障注入測試 (Fault Injection)
    const faultInjection = this.runFaultInjectionCheck(harnessCmd);
    checks.push(faultInjection);

    // 3. 實體冪等性與狀態殘留檢驗 (Idempotency & Cleanliness)
    const idempotency = this.runIdempotencyCheck(harnessCmd);
    checks.push(idempotency);

    // 4. 靜態腳本安全審核 (Exit Code Integrity)
    const scriptIntegrity = this.runScriptIntegrityCheck(harnessCmd);
    checks.push(scriptIntegrity);

    const passedCount = checks.filter(c => c.passed).length;
    const healthScore = Math.round((passedCount / checks.length) * 100);

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
    // 尋找一個可供注入破壞的非關鍵 JSON 檔案 (優先順序: data/settings.json, data/tasks.json, 或臨時設定檔)
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
      // 若無現有 JSON，在專案建立一個臨時無效檔案測試環境感知
      targetFile = path.join(this.projectPath, '.temp_sentinel_fault.json');
      fs.writeFileSync(targetFile, '{ invalid_json_syntax: true', 'utf8');
      createdTemp = true;
    }

    let originalContent = null;
    try {
      if (!createdTemp) {
        originalContent = fs.readFileSync(targetFile, 'utf8');
        // 實體注入破壞：寫入非法 JSON 內容
        fs.writeFileSync(targetFile, '{"__CORRUPTED_BY_TEST_SENTINEL__": true, invalid syntax ...', 'utf8');
      }

      let faultCaught = false;
      let exitCodeCaught = 0;
      let failureOutput = '';

      try {
        execSync(cmd, {
          cwd: this.projectPath,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 15000
        });
        faultCaught = false; // 居然通過了！這就是假陽性
      } catch (e) {
        faultCaught = true;
        exitCodeCaught = e.status || 1;
        failureOutput = (e.stderr || e.stdout || '').slice(0, 150);
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
      // 確保 100% 原樣復原
      if (createdTemp) {
        if (fs.existsSync(targetFile)) fs.unlinkSync(targetFile);
      } else if (originalContent !== null) {
        fs.writeFileSync(targetFile, originalContent, 'utf8');
      }
    }
  }

  runIdempotencyCheck(cmd) {
    try {
      // 取得執行前 git 狀態
      const beforeStatus = this.getGitStatus();

      // 連續執行兩次
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
    // 檢查目標腳本檔案中是否包含忽略錯誤的危險模式
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
