/**
 * gitnexus.js - GitNexus 知識圖譜衝擊分析器
 * 封裝 CLI 工具：detect-changes 與 impact，計算代碼變更的「爆炸半徑」與受波及元件
 */

const { execSync, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

class GitNexusBridge {
  constructor(repoPath) {
    this.repoPath = path.resolve(repoPath);
    this.cliPath = this.findCli();
  }

  findCli() {
    try {
      return execSync('which gitnexus', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    } catch (e) {
      return '/Users/nelsonchung/.nvm/versions/node/v24.20.0/bin/gitnexus';
    }
  }

  isIndexed() {
    const indexPath = path.join(this.repoPath, '.gitnexus');
    return fs.existsSync(indexPath);
  }

  /**
   * 呼叫 gitnexus detect-changes 映射 diff 到 symbols 與 flows
   */
  detectChangedSymbols(scope = 'unstaged') {
    if (!this.isIndexed()) {
      return {
        indexed: false,
        message: 'Repository not indexed by GitNexus. Run gitnexus analyze first.',
        changedSymbols: [],
        executionFlows: []
      };
    }

    try {
      // 執行 detect-changes
      const cmd = `gitnexus detect-changes -s ${scope}`;
      const output = execSync(cmd, {
        cwd: this.repoPath,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
        timeout: 15000
      });

      return this.parseDetectChanges(output);
    } catch (e) {
      return {
        indexed: true,
        error: e.message,
        changedSymbols: [],
        executionFlows: []
      };
    }
  }

  /**
   * 呼叫 gitnexus impact 分析某個 symbol 或檔案的爆炸半徑 (Blast Radius)
   */
  analyzeImpact(target, options = {}) {
    if (!this.isIndexed()) {
      return {
        indexed: false,
        target,
        blastRadius: { totalAffected: 0, upstream: [], downstream: [] }
      };
    }

    const direction = options.direction || 'upstream';
    const depth = options.depth || 3;
    const fileArg = options.file ? `-f "${options.file}"` : '';

    try {
      const cmd = `gitnexus impact -d ${direction} --depth ${depth} ${fileArg} "${target}"`;
      const output = execSync(cmd, {
        cwd: this.repoPath,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
        timeout: 15000
      });

      return this.parseImpactOutput(target, output);
    } catch (e) {
      return {
        indexed: true,
        target,
        error: e.message,
        blastRadius: { totalAffected: 0, upstream: [] }
      };
    }
  }

  parseDetectChanges(output) {
    const lines = output.split('\n');
    const symbols = [];
    const executionFlows = [];

    let currentSection = null;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (line.toLowerCase().includes('changed symbol') || line.toLowerCase().includes('symbols:')) {
        currentSection = 'symbols';
        continue;
      }
      if (line.toLowerCase().includes('execution flow') || line.toLowerCase().includes('affected flows:')) {
        currentSection = 'flows';
        continue;
      }

      if (currentSection === 'symbols') {
        symbols.push(line.replace(/^[-*•]\s*/, ''));
      } else if (currentSection === 'flows') {
        executionFlows.push(line.replace(/^[-*•]\s*/, ''));
      } else {
        // 容錯提取符號
        if (line.startsWith('- ') || line.startsWith('* ')) {
          symbols.push(line.replace(/^[-*•]\s*/, ''));
        }
      }
    }

    return {
      indexed: true,
      raw: output,
      changedSymbols: symbols,
      executionFlows
    };
  }

  parseImpactOutput(target, output) {
    const lines = output.split('\n');
    const affected = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith('- ') || line.startsWith('• ') || line.match(/^[0-9]+\.\s+/)) {
        const item = line.replace(/^([-•]|\d+\.)\s+/, '');
        affected.push(item);
      }
    }

    return {
      indexed: true,
      target,
      raw: output,
      blastRadius: {
        totalAffected: affected.length,
        affectedItems: affected,
        riskLevel: affected.length > 5 ? 'HIGH' : affected.length > 1 ? 'MEDIUM' : 'LOW'
      }
    };
  }

  /**
   * 觸發分析建立索引
   */
  startIndexing(callback) {
    const cmd = 'gitnexus analyze';
    exec(cmd, { cwd: this.repoPath }, (error, stdout, stderr) => {
      if (callback) callback(error, stdout, stderr);
    });
  }
}

module.exports = { GitNexusBridge };
