/**
 * diff-analyzer.js - Git Diff 分析與變異提取器
 * 提取程式碼修改段落，並標記出可用於「變異測試 (Mutation Testing)」的邏輯關鍵點
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

class DiffAnalyzer {
  constructor(repoPath) {
    this.repoPath = path.resolve(repoPath);
  }

  getDiff(scope = 'all') {
    let cmd = 'git diff HEAD';
    if (scope === 'staged') cmd = 'git diff --cached';
    if (scope === 'unstaged') cmd = 'git diff';
    if (scope === 'last-commit') cmd = 'git diff HEAD~1 HEAD';

    try {
      const rawDiff = execSync(cmd, {
        cwd: this.repoPath,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      });

      return this.parseDiff(rawDiff);
    } catch (e) {
      // 容錯：如果沒有 commit，嘗試 git diff
      try {
        const rawDiff = execSync('git diff', {
          cwd: this.repoPath,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore']
        });
        return this.parseDiff(rawDiff);
      } catch (err) {
        return { files: [], summary: { addedLines: 0, removedLines: 0 } };
      }
    }
  }

  parseDiff(rawDiff) {
    if (!rawDiff || !rawDiff.trim()) {
      return { files: [], summary: { addedLines: 0, removedLines: 0, totalFiles: 0 } };
    }

    const files = [];
    const fileChunks = rawDiff.split(/^diff --git /m).filter(Boolean);

    let totalAdded = 0;
    let totalRemoved = 0;

    for (const chunk of fileChunks) {
      const lines = chunk.split('\n');
      const headerMatch = lines[0].match(/a\/(.+?)\s+b\/(.+)/);
      if (!headerMatch) continue;

      const filePath = headerMatch[2];
      const addedLines = [];
      const removedLines = [];
      const hunks = [];
      let currentHunk = null;

      for (const line of lines) {
        if (line.startsWith('@@')) {
          if (currentHunk) hunks.push(currentHunk);
          currentHunk = { header: line, lines: [] };
        } else if (currentHunk) {
          currentHunk.lines.push(line);
          if (line.startsWith('+') && !line.startsWith('+++')) {
            addedLines.push(line.substring(1));
            totalAdded++;
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            removedLines.push(line.substring(1));
            totalRemoved++;
          }
        }
      }
      if (currentHunk) hunks.push(currentHunk);

      // 提取可變異候選點 (Mutation Candidates)
      const mutationCandidates = this.findMutationCandidates(addedLines, filePath);

      files.push({
        filePath,
        addedCount: addedLines.length,
        removedCount: removedLines.length,
        addedLines,
        hunks,
        mutationCandidates
      });
    }

    return {
      files,
      summary: {
        totalFiles: files.length,
        addedLines: totalAdded,
        removedLines: totalRemoved
      }
    };
  }

  /**
   * 找出可以故意改壞以檢驗測試鑑別度的語法點
   */
  findMutationCandidates(lines, filePath) {
    const extension = path.extname(filePath).toLowerCase();
    const supportedExtensions = new Set(['.js', '.cjs', '.mjs', '.ts', '.cts', '.mts', '.jsx', '.tsx']);
    if (!supportedExtensions.has(extension) || !this.isMutableSourceFile(filePath)) return [];

    const candidates = [];
    const operatorMap = [
      { pattern: /===/g, replacement: '!==', desc: 'Invert equality (=== to !==)' },
      { pattern: /!==/g, replacement: '===', desc: 'Invert inequality (!== to ===)' },
      { pattern: /(?<![=!])==(?!=)/g, replacement: '!=', desc: 'Invert loose equality (== to !=)' },
      { pattern: /(?<![=!])!=(?!=)/g, replacement: '==', desc: 'Invert loose inequality (!= to ==)' },
      { pattern: />=/g, replacement: '<', desc: 'Invert comparison (>= to <)' },
      { pattern: /<=/g, replacement: '>', desc: 'Invert comparison (<= to >)' },
      { pattern: /(?<![=>])>(?!=)/g, replacement: '<=', desc: 'Invert comparison (> to <=)' },
      { pattern: /(?<![=<])<(?!=)/g, replacement: '>=', desc: 'Invert comparison (< to >=)' },
      { pattern: /&&/g, replacement: '||', desc: 'Swap logical AND with OR' },
      { pattern: /\|\|/g, replacement: '&&', desc: 'Swap logical OR with AND' },
      { pattern: /\btrue\b/g, replacement: 'false', desc: 'Flip boolean true to false' },
      { pattern: /\bfalse\b/g, replacement: 'true', desc: 'Flip boolean false to true' }
    ];

    lines.forEach((line, index) => {
      // 忽略註解與空行
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || !trimmed) return;
      const executableLine = this.maskNonCodeSegments(line, extension);

      for (const op of operatorMap) {
        for (const match of executableLine.matchAll(op.pattern)) {
          candidates.push({
            filePath,
            lineIndex: index,
            originalLine: line,
            mutatedLine: `${line.slice(0, match.index)}${op.replacement}${line.slice(match.index + match[0].length)}`,
            type: op.desc
          });
        }
      }
    });

    return candidates;
  }

  isMutableSourceFile(filePath) {
    const normalized = filePath.replace(/\\/g, '/');
    if (/(^|\/)(?:tests?|__tests__|\.test-eval)(\/|$)/i.test(normalized)) return false;
    if (/\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(normalized)) return false;
    return !/(^|\/)(?:playwright|vitest|jest|webpack|vite|eslint|babel|rollup)\.config\.[cm]?[jt]s$/i.test(normalized);
  }

  maskNonCodeSegments(line, extension = '') {
    const masked = [...line];
    let quote = null;
    let escaped = false;

    for (let index = 0; index < line.length; index++) {
      const char = line[index];
      const next = line[index + 1];

      if (quote) {
        masked[index] = ' ';
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === quote) {
          quote = null;
        }
        continue;
      }

      if (char === '"' || char === "'" || char === '`') {
        quote = char;
        masked[index] = ' ';
        continue;
      }

      if (char === '/' && (next === '/' || next === '*')) {
        for (let rest = index; rest < line.length; rest++) masked[rest] = ' ';
        break;
      }
    }

    let executableLine = masked.join('');
    if (extension === '.jsx' || extension === '.tsx') {
      executableLine = executableLine.replace(/<\/?[A-Za-z][^>]*>|<\/?\s*>/g, match => ' '.repeat(match.length));
    }
    return executableLine;
  }
}

module.exports = { DiffAnalyzer };
