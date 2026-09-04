#!/usr/bin/env node

/**
 * test-sentinel.js - Test Sentinel CLI 命令列工具
 * 用法:
 *   test-sentinel scan [path]
 *   test-sentinel run [mode] [path]
 */

const path = require('path');
const { ProjectScanner } = require('../core/scanner');
const { GitNexusBridge } = require('../core/gitnexus');
const { DiffAnalyzer } = require('../core/diff-analyzer');
const { DiffE2ERunner } = require('../core/modes/diff-e2e-runner');
const { SkillEvaluator } = require('../core/modes/skill-evaluator');
const { HarnessAuditor } = require('../core/modes/harness-auditor');
const { QualityScorer } = require('../core/scorer');

const args = process.argv.slice(2);
const command = args[0] || 'help';
const targetDir = args[1] ? path.resolve(args[1]) : process.cwd();

console.log(`\n🛡️  [TEST SENTINEL CLI] Target: ${targetDir}\n`);

if (command === 'scan') {
  const scanner = new ProjectScanner(targetDir);
  const profile = scanner.scan();
  console.log('📋 專案架構指紋：');
  console.log(JSON.stringify(profile, null, 2));

  const gn = new GitNexusBridge(targetDir);
  console.log('\n🌐 GitNexus 索引狀態:', gn.isIndexed() ? '✅ 已建立' : '❌ 未建立 (請跑 gitnexus analyze)');
  process.exit(0);
}

if (command === 'run') {
  const mode = args[1] || 'diff-e2e';
  const repo = args[2] ? path.resolve(args[2]) : process.cwd();

  if (mode === 'diff-e2e') {
    console.log('⚡ 正在執行 [模式 A] Git Diff E2E 探針與變異測試...');
    const runner = new DiffE2ERunner(repo);
    const analyzer = new DiffAnalyzer(repo);
    const diffData = analyzer.getDiff('all');

    const result = runner.runEvaluation({
      mutations: diffData.files.flatMap(f => f.mutationCandidates)
    });

    const scorecard = QualityScorer.computeScorecard({
      diffSummary: diffData.summary,
      e2eResult: result
    });

    console.log(`\n📊 評估完成！總分: ${scorecard.overallScore}/100 [${scorecard.rating}]`);
    console.log(`- 變異擊殺率: ${scorecard.metrics.mutationKillRate}%`);
    console.log(`- 靜默崩潰數: ${scorecard.metrics.silentErrorsCaught}`);
    console.log('\n💡 建議：');
    scorecard.insights.forEach(i => console.log(`  ${i}`));
    process.exit(0);
  }

  if (mode === 'skill-eval') {
    console.log('🧠 正在執行 [模式 B] Skill 效益評測...');
    const evaluator = new SkillEvaluator(repo);
    const scanner = new ProjectScanner(repo);
    const profile = scanner.scan();
    const skill = profile.skills[0];

    if (!skill) {
      console.log('❌ 專案中未找到任何 SKILL.md 檔案。');
      process.exit(1);
    }

    const report = evaluator.evaluateSkill(skill.path);
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  if (mode === 'harness-eval') {
    console.log('🧪 正在執行 [模式 C] Harness 流程健檢...');
    const auditor = new HarnessAuditor(repo);
    const report = auditor.auditHarness();
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }
}

console.log(`
使用說明：
  node src/cli/test-sentinel.js scan [專案路徑]
  node src/cli/test-sentinel.js run diff-e2e [專案路徑]
  node src/cli/test-sentinel.js run skill-eval [專案路徑]
  node src/cli/test-sentinel.js run harness-eval [專案路徑]
`);
