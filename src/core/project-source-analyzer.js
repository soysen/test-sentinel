/**
 * project-source-analyzer.js - 專案原始碼檔案分析與變異提取器
 * 負責在「專案檔案」範圍下列舉可測原始碼檔案、檢查安全邊界與容量上限，並提取帶有真實 1-based lineNumber 的變異候選點
 */

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { DiffAnalyzer, PathScopeValidationError } = require('./diff-analyzer');

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB
const MAX_TOTAL_FILES = 500;
const MAX_TOTAL_MUTATIONS = 1000;

const EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  '.test-eval',
  '.gitnexus',
  'dist',
  'build',
  'coverage',
  '.github',
  '.claude',
  '.gemini',
  '.cursor',
  '.vscode',
  'env',
  'venv',
  '.venv'
]);

const SUPPORTED_EXTENSIONS = new Set([
  '.js',
  '.cjs',
  '.mjs',
  '.ts',
  '.cts',
  '.mts',
  '.jsx',
  '.tsx'
]);

class ProjectSourceAnalyzer {
  constructor(projectPath) {
    this.projectPath = path.resolve(projectPath);
  }

  /**
   * 檢查路徑是否包含排除目錄段落
   */
  static isExcludedPath(relativePath) {
    const segments = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
    return segments.some(segment => EXCLUDED_DIRS.has(segment));
  }

  /**
   * 檢查副檔名是否為支援的原始碼副檔名
   */
  static isSupportedExtension(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return SUPPORTED_EXTENSIONS.has(ext);
  }

  /**
   * 列舉專案內所有檔案清單（優先使用 git ls-files，若非 Git 專案則 fallback 至 fs walker）
   */
  enumerateFiles() {
    const isGitRepo = fs.existsSync(path.join(this.projectPath, '.git'));
    if (isGitRepo) {
      try {
        const output = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
          cwd: this.projectPath,
          encoding: 'utf8',
          maxBuffer: 32 * 1024 * 1024,
          env: {
            ...process.env,
            GIT_CONFIG_NOSYSTEM: '1',
            GIT_CONFIG_GLOBAL: '/dev/null'
          }
        });
        const rawFiles = output.split('\0').filter(Boolean);
        const relativePaths = [];

        for (const raw of rawFiles) {
          const norm = raw.replace(/\\/g, '/').replace(/^\.\//, '');
          if (!norm || ProjectSourceAnalyzer.isExcludedPath(norm)) continue;

          const fullPath = path.resolve(this.projectPath, norm);
          if (!fullPath.startsWith(this.projectPath + path.sep)) continue;

          try {
            const lstat = fs.lstatSync(fullPath);
            if (lstat.isSymbolicLink() || !lstat.isFile()) continue;
            relativePaths.push(norm);
          } catch {
            // 檔案不存在或無法存取則略過
          }
        }
        return relativePaths;
      } catch {
        // Fallback to fs walker if git command fails
      }
    }

    // Fallback: Node.js fs walker (安全防禦：不跟隨 symlink、不逃出專案目錄、排除黑名單)
    const relativePaths = [];
    const walk = (currentDir) => {
      let entries;
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relPath = path.relative(this.projectPath, fullPath).replace(/\\/g, '/');

        if (!fullPath.startsWith(this.projectPath + path.sep)) continue;
        if (ProjectSourceAnalyzer.isExcludedPath(relPath)) continue;

        if (entry.isSymbolicLink()) continue;

        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          relativePaths.push(relPath);
        }
      }
    };

    walk(this.projectPath);
    return relativePaths;
  }

  /**
   * 取得專案原始碼檔案清單與可測狀態（供前端檔案樹與摘要使用）
   */
  getProjectFiles() {
    const allPaths = this.enumerateFiles();
    const diffAnalyzer = new DiffAnalyzer(this.projectPath);

    const files = [];
    for (const relPath of allPaths) {
      const isExtSupported = ProjectSourceAnalyzer.isSupportedExtension(relPath);
      const isMutable = isExtSupported && diffAnalyzer.isMutableSourceFile(relPath);

      files.push({
        filePath: relPath,
        isMutable,
        extension: path.extname(relPath).toLowerCase()
      });
    }

    files.sort((a, b) => a.filePath.localeCompare(b.filePath));

    return {
      files,
      summary: {
        totalFiles: files.length,
        mutableFiles: files.filter(f => f.isMutable).length
      }
    };
  }

  /**
   * 取得指定範圍（或全專案）的變異候選點，並做安全上限檢查
   */
  getProjectMutations(pathScope = null) {
    const canonicalScope = DiffAnalyzer.canonicalizePathScope(pathScope);
    const { files: allFiles } = this.getProjectFiles();
    const diffAnalyzer = new DiffAnalyzer(this.projectPath);

    // 篩選可測原始碼
    let targetFiles = allFiles.filter(f => f.isMutable);

    if (canonicalScope) {
      if (canonicalScope.emptySelection) {
        throw new PathScopeValidationError('指定路徑範圍為空，請勾選檔案或設定 pattern', 'EMPTY_PATH_SCOPE');
      }

      targetFiles = targetFiles.filter(file => {
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
    }

    if (targetFiles.length === 0) {
      throw new PathScopeValidationError('指定路徑範圍無任何可測試的原始碼檔案', 'EMPTY_PATH_SCOPE');
    }

    if (targetFiles.length > MAX_TOTAL_FILES) {
      throw new PathScopeValidationError(`選取的檔案數超過上限 (${targetFiles.length} > ${MAX_TOTAL_FILES})，請縮小選取範圍`, 'TOO_MANY_FILES');
    }

    const matchedFiles = [];
    const allMutations = [];

    for (const file of targetFiles) {
      const fullPath = path.resolve(this.projectPath, file.filePath);
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.size > MAX_FILE_SIZE) {
        throw new PathScopeValidationError(`檔案 ${file.filePath} 大小超過上限 1MB (${(stat.size / 1024 / 1024).toFixed(2)}MB)，無法進行變異分析`, 'FILE_TOO_LARGE');
      }

      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split(/\r?\n/);
      const candidates = diffAnalyzer.findMutationCandidates(lines, file.filePath, 1);

      matchedFiles.push({
        filePath: file.filePath,
        size: stat.size,
        mutationCount: candidates.length,
        mutationCandidates: candidates
      });

      for (const c of candidates) {
        allMutations.push(c);
        if (allMutations.length > MAX_TOTAL_MUTATIONS) {
          throw new PathScopeValidationError(`變異點總數超過上限 (${MAX_TOTAL_MUTATIONS})，請縮小測試檔案範圍`, 'TOO_MANY_MUTATIONS');
        }
      }
    }

    return {
      files: matchedFiles,
      mutations: allMutations,
      scopeMetadata: canonicalScope ? {
        selectedPaths: canonicalScope.selectedPaths,
        includePatterns: canonicalScope.includePatterns,
        excludePatterns: canonicalScope.excludePatterns,
        hash: canonicalScope.hash
      } : null,
      summary: {
        totalFiles: matchedFiles.length,
        totalMutations: allMutations.length
      }
    };
  }
}

module.exports = {
  ProjectSourceAnalyzer,
  MAX_FILE_SIZE,
  MAX_TOTAL_FILES,
  MAX_TOTAL_MUTATIONS
};
