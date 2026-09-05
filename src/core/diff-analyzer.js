/**
 * diff-analyzer.js - Git Diff 分析與變異提取器
 * 提取程式碼修改段落，並標記出可用於「變異測試 (Mutation Testing)」的邏輯關鍵點
 */

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

class PathScopeValidationError extends Error {
  constructor(message, code = 'INVALID_PATH_SCOPE') {
    super(message);
    this.name = 'PathScopeValidationError';
    this.statusCode = 400;
    this.code = code;
  }
}

function validatePathOrPattern(item, fieldName = 'path') {
  if (typeof item !== 'string') {
    throw new PathScopeValidationError(`Invalid ${fieldName}: must be a string`);
  }
  const trimmed = item.trim();
  if (!trimmed) {
    throw new PathScopeValidationError(`Invalid ${fieldName}: cannot be empty`);
  }
  if (trimmed.includes('\0')) {
    throw new PathScopeValidationError(`Invalid ${fieldName}: contains null byte`);
  }
  if (path.isAbsolute(trimmed) || trimmed.startsWith('/') || trimmed.startsWith('\\') || /^[a-zA-Z]:/.test(trimmed)) {
    throw new PathScopeValidationError(`Invalid ${fieldName}: absolute paths are not allowed (${trimmed})`);
  }
  const normalized = trimmed.replace(/\\/g, '/');
  const segments = normalized.split('/');
  if (segments.includes('..')) {
    throw new PathScopeValidationError(`Invalid ${fieldName}: directory traversal (..) is not allowed (${trimmed})`);
  }
  if (/^:(?!\(|!)/.test(trimmed)) {
    throw new PathScopeValidationError(`Invalid ${fieldName}: invalid pathspec syntax (${trimmed})`);
  }
  if (fieldName.toLowerCase().includes('pattern')) {
    globToRegex(normalized);
  }
  return normalized;
}

function globToRegex(glob) {
  let p = glob.replace(/^\.\//, '').replace(/^\//, '');
  p = p.replace(/^:\(top(?:,[^)]*)?\)/, '');

  if (p.includes('{') || p.includes('}')) {
    throw new PathScopeValidationError(`Unsupported glob syntax: brace expansion is not supported (${glob})`, 'INVALID_PATH_SCOPE');
  }
  if (/@\(|\+\(|\!\(|\?\(/g.test(p)) {
    throw new PathScopeValidationError(`Unsupported glob syntax: extglob is not supported (${glob})`, 'INVALID_PATH_SCOPE');
  }

  let regexStr = '^';
  let i = 0;
  while (i < p.length) {
    const c = p[i];
    if (c === '*') {
      if (p[i + 1] === '*') {
        if (p[i + 2] === '/') {
          regexStr += '(?:.*/)?';
          i += 3;
          continue;
        } else {
          regexStr += '.*';
          i += 2;
          continue;
        }
      } else {
        regexStr += '[^/]*';
        i++;
        continue;
      }
    } else if (c === '?') {
      regexStr += '[^/]';
      i++;
      continue;
    } else if (c === '[') {
      const closeIdx = p.indexOf(']', i + 1);
      if (closeIdx === -1) {
        throw new PathScopeValidationError(`Invalid pattern: unclosed character class [...] (${glob})`, 'INVALID_PATH_SCOPE');
      }
      const inner = p.slice(i + 1, closeIdx);
      if (!inner) {
        throw new PathScopeValidationError(`Invalid pattern: empty character class [] (${glob})`, 'INVALID_PATH_SCOPE');
      }
      let classContent = inner;
      if (classContent.startsWith('!') || classContent.startsWith('^')) {
        classContent = '^' + classContent.slice(1);
      }
      regexStr += '[' + classContent + ']';
      i = closeIdx + 1;
      continue;
    } else if (['.', '+', '(', ')', '^', '$', '|', '\\'].includes(c)) {
      regexStr += '\\' + c;
      i++;
    } else {
      regexStr += c;
      i++;
    }
  }
  regexStr += '$';
  return new RegExp(regexStr);
}

function matchesPattern(filePath, pattern) {
  let p = pattern.trim().replace(/^\.\//, '').replace(/^\//, '');
  p = p.replace(/^:\(top(?:,[^)]*)?\)/, '');
  if (!p) return false;
  if (p === '.' || p === '*') return true;
  const normalizedFile = filePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');

  if (!p.includes('*') && !p.includes('?') && !p.includes('[')) {
    if (normalizedFile === p) return true;
    if (p.endsWith('/') && normalizedFile.startsWith(p)) return true;
    if (normalizedFile.startsWith(p + '/')) return true;
    return false;
  }

  if (!p.includes('/')) {
    const regex = globToRegex(p);
    const basename = normalizedFile.split('/').pop();
    return regex.test(basename) || regex.test(normalizedFile);
  } else {
    const regex = globToRegex(p);
    return regex.test(normalizedFile);
  }
}

function matchesSelectedPath(filePath, selectedPath) {
  const normFile = filePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
  const normSelected = selectedPath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '').replace(/\/+$/, '');
  if (!normSelected || normSelected === '.') return true;
  return normFile === normSelected || normFile.startsWith(normSelected + '/');
}

class DiffAnalyzer {
  constructor(repoPath) {
    this.repoPath = path.resolve(repoPath);
  }

  static validatePathOrPattern(item, fieldName = 'path') {
    return validatePathOrPattern(item, fieldName);
  }

  static matchesPattern(filePath, pattern) {
    return matchesPattern(filePath, pattern);
  }

  static matchesSelectedPath(filePath, selectedPath) {
    return matchesSelectedPath(filePath, selectedPath);
  }

  static canonicalizePathScope(input) {
    if (!input) return null;

    let rawSelected = [];
    let rawInclude = [];
    let rawExclude = [];
    let hasExplicitSelectedPaths = false;
    let hasExplicitPatterns = false;

    if (typeof input === 'string') {
      hasExplicitPatterns = true;
      const lines = input.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (line.startsWith('!')) {
          rawExclude.push(line.slice(1).trim());
        } else {
          rawInclude.push(line);
        }
      }
    } else if (typeof input === 'object') {
      if (input.selectedPaths !== undefined) {
        hasExplicitSelectedPaths = true;
        if (!Array.isArray(input.selectedPaths)) {
          throw new PathScopeValidationError('selectedPaths must be an array');
        }
        rawSelected = input.selectedPaths;
      }
      if (input.includePatterns !== undefined) {
        hasExplicitPatterns = true;
        if (!Array.isArray(input.includePatterns)) {
          throw new PathScopeValidationError('includePatterns must be an array');
        }
        rawInclude.push(...input.includePatterns);
      }
      if (input.excludePatterns !== undefined) {
        hasExplicitPatterns = true;
        if (!Array.isArray(input.excludePatterns)) {
          throw new PathScopeValidationError('excludePatterns must be an array');
        }
        rawExclude.push(...input.excludePatterns);
      }
      if (input.patternText && typeof input.patternText === 'string') {
        hasExplicitPatterns = true;
        const lines = input.patternText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
          if (line.startsWith('!')) {
            rawExclude.push(line.slice(1).trim());
          } else {
            rawInclude.push(line);
          }
        }
      }
    } else {
      throw new PathScopeValidationError('Invalid pathScope format');
    }

    if (!hasExplicitSelectedPaths && !hasExplicitPatterns) {
      return null;
    }

    const normalizedSelected = Array.from(new Set(
      rawSelected.map(p => validatePathOrPattern(p, 'selectedPath')
        .replace(/^\.\//, '')
        .replace(/\/+$/, ''))
        .filter(Boolean)
    )).sort();

    const normalizedInclude = Array.from(new Set(
      rawInclude.map(p => validatePathOrPattern(p, 'includePattern')
        .replace(/^\.\//, ''))
        .filter(Boolean)
    )).sort();

    const normalizedExclude = Array.from(new Set(
      rawExclude.map(p => validatePathOrPattern(p, 'excludePattern')
        .replace(/^\.\//, ''))
        .filter(Boolean)
    )).sort();

    const emptySelection = hasExplicitSelectedPaths &&
      normalizedSelected.length === 0 &&
      normalizedInclude.length === 0;

    const canonicalJson = JSON.stringify({
      selectedPaths: normalizedSelected,
      includePatterns: normalizedInclude,
      excludePatterns: normalizedExclude
    });

    const hash = crypto.createHash('sha256').update(canonicalJson).digest('hex').slice(0, 12);

    return {
      selectedPaths: normalizedSelected,
      includePatterns: normalizedInclude,
      excludePatterns: normalizedExclude,
      hash,
      emptySelection
    };
  }

  static applyScopeFilter(parsed, canonicalScope) {
    if (!canonicalScope || !parsed || !parsed.files) return parsed;
    parsed.files = parsed.files.filter(file => {
      const filePath = file.filePath;
      if (canonicalScope.selectedPaths.length > 0) {
        const matchesSel = canonicalScope.selectedPaths.some(sp => DiffAnalyzer.matchesSelectedPath(filePath, sp));
        if (!matchesSel) return false;
      }
      if (canonicalScope.includePatterns.length > 0) {
        const matchesInc = canonicalScope.includePatterns.some(ip => DiffAnalyzer.matchesPattern(filePath, ip));
        if (!matchesInc) return false;
      }
      if (canonicalScope.excludePatterns.length > 0) {
        const matchesExc = canonicalScope.excludePatterns.some(ep => DiffAnalyzer.matchesPattern(filePath, ep));
        if (matchesExc) return false;
      }
      return true;
    });

    parsed.summary = {
      totalFiles: parsed.files.length,
      addedLines: parsed.files.reduce((sum, f) => sum + (f.addedCount || 0), 0),
      removedLines: parsed.files.reduce((sum, f) => sum + (f.removedCount || 0), 0)
    };

    parsed.scopeMetadata = {
      selectedPaths: canonicalScope.selectedPaths,
      includePatterns: canonicalScope.includePatterns,
      excludePatterns: canonicalScope.excludePatterns,
      hash: canonicalScope.hash
    };

    return parsed;
  }

  static buildGitPathspecs(canonicalScope) {
    if (!canonicalScope || canonicalScope.emptySelection) return [];
    const pathspecs = [];
    for (const p of canonicalScope.selectedPaths) {
      pathspecs.push(`:(top)${p}`);
    }
    for (const p of canonicalScope.includePatterns) {
      pathspecs.push(`:(top)${p}`);
    }
    if (pathspecs.length === 0 && canonicalScope.excludePatterns.length > 0) {
      pathspecs.push(':(top)');
    }
    for (const p of canonicalScope.excludePatterns) {
      pathspecs.push(`:(top,exclude)${p}`);
    }
    return pathspecs;
  }

  getDiff(scope = 'all', pathScope = null) {
    const canonicalScope = DiffAnalyzer.canonicalizePathScope(pathScope);

    if (canonicalScope && canonicalScope.emptySelection) {
      return {
        files: [],
        summary: { totalFiles: 0, addedLines: 0, removedLines: 0 },
        scopeMetadata: {
          selectedPaths: [],
          includePatterns: [],
          excludePatterns: [],
          hash: canonicalScope.hash
        }
      };
    }

    let baseArgs = ['diff', 'HEAD'];
    if (scope === 'staged') baseArgs = ['diff', '--cached'];
    if (scope === 'unstaged') baseArgs = ['diff'];
    if (scope === 'last-commit') baseArgs = ['diff', 'HEAD~1', 'HEAD'];

    const pathspecs = canonicalScope ? DiffAnalyzer.buildGitPathspecs(canonicalScope) : [];
    const args = pathspecs.length > 0 ? [...baseArgs, '--', ...pathspecs] : baseArgs;

    const gitEnv = {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: process.env.GIT_CONFIG_NOSYSTEM || '1',
      GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL || '/dev/null'
    };

    const execOptions = {
      cwd: this.repoPath,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
      env: gitEnv,
      maxBuffer: 50 * 1024 * 1024
    };

    try {
      const rawDiff = execFileSync('git', args, execOptions);
      const parsed = this.parseDiff(rawDiff);
      return canonicalScope ? DiffAnalyzer.applyScopeFilter(parsed, canonicalScope) : parsed;
    } catch (e) {
      // 容錯：如果沒有 commit，嘗試 git diff
      try {
        const fallbackBaseArgs = scope === 'staged' ? ['diff', '--cached'] : ['diff'];
        const fallbackArgs = pathspecs.length > 0 ? [...fallbackBaseArgs, '--', ...pathspecs] : fallbackBaseArgs;
        const rawDiff = execFileSync('git', fallbackArgs, execOptions);
        const parsed = this.parseDiff(rawDiff);
        return canonicalScope ? DiffAnalyzer.applyScopeFilter(parsed, canonicalScope) : parsed;
      } catch (err) {
        return {
          files: [],
          summary: { addedLines: 0, removedLines: 0, totalFiles: 0 },
          ...(canonicalScope ? {
            scopeMetadata: {
              selectedPaths: canonicalScope.selectedPaths,
              includePatterns: canonicalScope.includePatterns,
              excludePatterns: canonicalScope.excludePatterns,
              hash: canonicalScope.hash
            }
          } : {})
        };
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
  findMutationCandidates(lines, filePath, startLineNumber = 1) {
    const extension = path.extname(filePath).toLowerCase();
    const supportedExtensions = new Set(['.js', '.cjs', '.mjs', '.ts', '.cts', '.mts', '.jsx', '.tsx']);
    if (!supportedExtensions.has(extension) || !this.isMutableSourceFile(filePath)) return [];

    const candidates = [];
  const maskState = { inJsxTag: false, jsxQuote: null };
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
      const executableLine = this.maskNonCodeSegments(line, extension, maskState);

      for (const op of operatorMap) {
        for (const match of executableLine.matchAll(op.pattern)) {
          candidates.push({
            filePath,
            lineIndex: index,
            lineNumber: typeof startLineNumber === 'number' && startLineNumber > 0 ? startLineNumber + index : index + 1,
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

  maskNonCodeSegments(line, extension = '', state = {}) {
    const masked = [...line];
    let quote = null;
    let escaped = false;
    const supportsJsx = ['.js', '.jsx', '.tsx'].includes(extension);

    for (let index = 0; index < line.length; index++) {
      const char = line[index];
      const next = line[index + 1];

      if (state.inJsxTag) {
        masked[index] = ' ';
        if (state.jsxQuote) {
          if (char === state.jsxQuote && line[index - 1] !== '\\') state.jsxQuote = null;
        } else if (char === '"' || char === "'") {
          state.jsxQuote = char;
        } else if (char === '>') {
          state.inJsxTag = false;
        }
        continue;
      }

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

      if (supportsJsx && char === '<' && /^<\/?(?:[A-Za-z][\w:.-]*)(?=[\s/>.]|$)|^<>/.test(line.slice(index))) {
        state.inJsxTag = true;
        masked[index] = ' ';
        continue;
      }

      if (char === '/' && (next === '/' || next === '*')) {
        for (let rest = index; rest < line.length; rest++) masked[rest] = ' ';
        break;
      }
    }

    return masked.join('');
  }
}

module.exports = { DiffAnalyzer, PathScopeValidationError };
