/**
 * scanner.js - 專案架構探測器 (Project Fingerprinting)
 * 掃描目標專案目錄，分析技術堆疊、測試框架、Skill、Harness 與 GitNexus 索引狀態
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class ProjectScanner {
  constructor(projectPath) {
    this.projectPath = path.resolve(projectPath);
  }

  scan() {
    if (!fs.existsSync(this.projectPath)) {
      throw new Error(`Project path does not exist: ${this.projectPath}`);
    }

    const pkg = this.readPackageJson();
    const gitInfo = this.getGitInfo();
    const gitnexus = this.detectGitNexus();
    const frameworks = this.detectFrameworks(pkg);
    const testFrameworks = this.detectTesting(pkg);
    const skills = this.detectSkills();
    const harness = this.detectHarness();

    const recommendedModes = [];
    if (frameworks.length > 0 || testFrameworks.length > 0) {
      recommendedModes.push('diff-e2e');
    }
    if (skills.length > 0) {
      recommendedModes.push('skill-eval');
    }
    if (harness.hasHarness) {
      recommendedModes.push('harness-eval');
    }
    // 預設如果沒有特殊檔案，至少支援 diff-e2e (基於 Git)
    if (recommendedModes.length === 0 && gitInfo.isGitRepo) {
      recommendedModes.push('diff-e2e');
    }

    return {
      name: path.basename(this.projectPath),
      path: this.projectPath,
      git: gitInfo,
      gitnexus,
      frameworks,
      testFrameworks,
      skills,
      harness,
      recommendedModes,
      timestamp: new Date().toISOString()
    };
  }

  readPackageJson() {
    const pkgPath = path.join(this.projectPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      } catch (e) {
        return { error: 'Invalid package.json' };
      }
    }
    return null;
  }

  getGitInfo() {
    const gitDir = path.join(this.projectPath, '.git');
    const isGitRepo = fs.existsSync(gitDir);
    if (!isGitRepo) {
      return { isGitRepo: false };
    }

    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: this.projectPath,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      }).trim();

      const status = execSync('git status --porcelain', {
        cwd: this.projectPath,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      }).trim();

      const uncommittedCount = status ? status.split('\n').filter(Boolean).length : 0;

      return {
        isGitRepo: true,
        branch,
        hasUncommittedChanges: uncommittedCount > 0,
        uncommittedCount
      };
    } catch (e) {
      return { isGitRepo: true, error: e.message };
    }
  }

  detectGitNexus() {
    const gitnexusDir = path.join(this.projectPath, '.gitnexus');
    const hasIndex = fs.existsSync(gitnexusDir);

    let cliAvailable = false;
    let cliPath = null;
    try {
      cliPath = execSync('which gitnexus', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
      cliAvailable = !!cliPath;
    } catch (e) {
      cliAvailable = false;
    }

    return {
      hasIndex,
      cliAvailable,
      cliPath
    };
  }

  detectFrameworks(pkg) {
    const list = [];
    const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };

    if (deps['react'] || deps['react-dom']) list.push('React');
    if (deps['next']) list.push('Next.js');
    if (deps['vue']) list.push('Vue');
    if (deps['nuxt']) list.push('Nuxt');
    if (deps['@angular/core']) list.push('Angular');
    if (deps['svelte']) list.push('Svelte');
    if (deps['vite']) list.push('Vite');
    if (deps['webpack']) list.push('Webpack');
    if (deps['express']) list.push('Express');
    if (deps['koa']) list.push('Koa');

    return list;
  }

  detectTesting(pkg) {
    const list = [];
    const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };

    if (deps['@playwright/test'] || fs.existsSync(path.join(this.projectPath, 'playwright.config.ts')) || fs.existsSync(path.join(this.projectPath, 'playwright.config.js'))) {
      list.push('Playwright');
    }
    if (deps['cypress'] || fs.existsSync(path.join(this.projectPath, 'cypress.config.ts')) || fs.existsSync(path.join(this.projectPath, 'cypress.config.js'))) {
      list.push('Cypress');
    }
    if (deps['jest'] || fs.existsSync(path.join(this.projectPath, 'jest.config.js'))) {
      list.push('Jest');
    }
    if (deps['vitest'] || fs.existsSync(path.join(this.projectPath, 'vitest.config.ts'))) {
      list.push('Vitest');
    }

    // 檢查是否有 tests/ 目錄
    const hasTestsDir = fs.existsSync(path.join(this.projectPath, 'tests')) || fs.existsSync(path.join(this.projectPath, 'test'));
    return {
      frameworks: list,
      hasTestsDir,
      hasFormalE2E: list.includes('Playwright') || list.includes('Cypress')
    };
  }

  detectSkills() {
    const skills = [];
    const candidateDirs = [
      path.join(this.projectPath, 'skills'),
      path.join(this.projectPath, '.claude', 'skills'),
      path.join(this.projectPath, '.gemini', 'skills')
    ];

    for (const dir of candidateDirs) {
      if (fs.existsSync(dir)) {
        try {
          const files = fs.readdirSync(dir);
          for (const file of files) {
            const fullPath = path.join(dir, file);
            if (fs.statSync(fullPath).isDirectory()) {
              const skillMd = path.join(fullPath, 'SKILL.md');
              if (fs.existsSync(skillMd)) {
                skills.push({ name: file, path: skillMd });
              }
            } else if (file.endsWith('.md') && file.toLowerCase().includes('skill')) {
              skills.push({ name: file.replace('.md', ''), path: fullPath });
            }
          }
        } catch (e) {}
      }
    }

    // 根目錄是否有 SKILL.md 或 AGENTS.md
    const rootSkill = path.join(this.projectPath, 'SKILL.md');
    if (fs.existsSync(rootSkill)) {
      skills.push({ name: 'RootSkill', path: rootSkill });
    }

    return skills;
  }

  detectHarness() {
    const harnessMd = path.join(this.projectPath, 'HARNESS.md');
    const harnessDir = path.join(this.projectPath, 'harness');
    const ghWorkflows = path.join(this.projectPath, '.github', 'workflows');

    const hasHarness = fs.existsSync(harnessMd) || fs.existsSync(harnessDir);
    const workflows = [];

    if (fs.existsSync(ghWorkflows)) {
      try {
        const files = fs.readdirSync(ghWorkflows);
        workflows.push(...files.filter(f => f.endsWith('.yml') || f.endsWith('.yaml')));
      } catch (e) {}
    }

    return {
      hasHarness,
      harnessMdExists: fs.existsSync(harnessMd),
      workflows
    };
  }
}

module.exports = { ProjectScanner };
