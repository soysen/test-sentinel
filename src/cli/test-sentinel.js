#!/usr/bin/env node

/**
 * test-sentinel.js - Test Sentinel CLI 命令列工具
 * 用法:
 *   test-sentinel scan [path]
 *   test-sentinel run [mode] [path] [--format=markdown|junit|json]
 *   test-sentinel history [mode] [target] [path]
 */

const path = require('path');
const fs = require('fs');
const { ProjectScanner } = require('../core/scanner');
const { GitNexusBridge } = require('../core/gitnexus');
const { DiffAnalyzer } = require('../core/diff-analyzer');
const { DiffE2ERunner } = require('../core/modes/diff-e2e-runner');
const { SkillEvaluator } = require('../core/modes/skill-evaluator');
const { HarnessAuditor } = require('../core/modes/harness-auditor');
const { QualityScorer } = require('../core/scorer');
const { HistoryManager } = require('../core/history-manager');

const rawArgs = process.argv.slice(2);
const flags = {};
const positional = [];

rawArgs.forEach(arg => {
  if (arg.startsWith('--')) {
    const [k, v] = arg.slice(2).split('=');
    flags[k] = v === undefined ? true : v;
  } else {
    positional.push(arg);
  }
});

const command = positional[0] || 'help';
const format = flags.format || 'console'; // console | markdown | junit | json

// 輔助函式：產生 GitHub PR Comment Markdown 格式
function renderMarkdownReport(mode, targetName, report, baselineDiff) {
  const score = report.overallScore ?? report.metrics?.overallScore ?? report.healthScore ?? null;
  const rating = report.rating || report.status || (score === null ? 'INCONCLUSIVE' : score >= 90 ? 'EXCELLENT' : score >= 80 ? 'GOOD' : 'NEEDS_ATTENTION');
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

  let output = `### 🛡️ Test Sentinel 評測安全網檢核報告\n\n`;
  output += `- **目標對象**：\`${targetName}\`\n`;
  output += `- **評測模式**：\`${mode}\`\n`;
  output += `- **執行時間**：\`${now}\`\n`;
  output += `- **總體評分**：**\`${score === null ? 'N/A' : score + ' / 100'} [${rating}]\`**\n\n`;

  if (mode === 'skill-eval') {
    const recall = report.discriminationResult?.recallRate ?? report.metrics?.recall ?? null;
    const precision = report.discriminationResult?.precisionRate ?? report.metrics?.precision ?? null;
    const tokens = report.metrics?.totalTokens ?? null;
    const avgQuality = report.metrics?.avgQualityScore ?? null;

    output += `| 評測指標 | 本次實測 | 歷史基準 (Baseline) | 狀態 |\n`;
    output += `| :--- | :---: | :---: | :---: |\n`;
    output += `| 領域召回率 (Recall) | ${recall === null ? 'N/A' : recall + '%'} | N/A | ${recall === 100 ? '✅ 通過' : '⚠️ 需關注'} |\n`;
    output += `| 抗干擾精確度 (Precision) | ${precision === null ? 'N/A' : precision + '%'} | N/A | ${precision === 100 ? '✅ 通過' : '⚠️ 需關注'} |\n`;
    output += `| Context Token 消耗 | ${tokens === null ? 'N/A' : tokens.toLocaleString()} | N/A | ${tokens === null ? '未量測' : '已量測'} |\n`;
    output += `| 產出品質平均分 | ${avgQuality === null ? 'N/A' : avgQuality + ' 分'} | - | ${avgQuality === null ? '未量測' : avgQuality >= 90 ? '✅ 優良' : '⚠️ 需調優'} |\n\n`;
  } else if (mode === 'diff-e2e') {
    const killRate = report.metrics?.mutationKillRate ?? report.result?.mutationResults?.killRate ?? null;
    const silentErrors = report.metrics?.silentErrorsCaught ?? null;
    output += `| 評測指標 | 數值 | 狀態 |\n`;
    output += `| :--- | :---: | :---: |\n`;
    output += `| 變異擊殺率 (Kill Rate) | ${killRate === null ? 'N/A' : killRate + '%'} | ${killRate === null ? '未量測' : killRate >= 80 ? '✅ 具真實鑑別力' : '❌ 測試脆弱'} |\n`;
    output += `| 未捕獲運行崩潰 (Silent Errors) | ${silentErrors ?? 'N/A'} | ${silentErrors === null ? '未量測' : silentErrors === 0 ? '✅ 乾淨' : '❌ 阻斷項'} |\n\n`;
  } else if (mode === 'harness-eval') {
    output += `| 評測指標 | 數值 | 狀態 |\n`;
    output += `| :--- | :---: | :---: |\n`;
    output += `| Harness 健康度 | ${score} 分 | ${score === 100 ? '✅ HEALTHY' : '⚠️ WARNING'} |\n`;
    output += `| 故障注入阻斷力 | ${report.faultInjectionAudit?.handledCleanly ? '100%' : '0%'} | ${report.faultInjectionAudit?.handledCleanly ? '✅ 成功阻斷' : '❌ 未阻斷'} |\n`;
    output += `| 環境冪等性 | ${report.idempotencyAudit?.idempotent ? '一致' : '髒污'} | ${report.idempotencyAudit?.idempotent ? '✅ 無快照殘留' : '⚠️ 快照受污'} |\n\n`;
  }

  if (report.insights && report.insights.length > 0) {
    output += `> **💡 專家審查建議：**\n`;
    report.insights.forEach(i => { output += `> - ${i}\n`; });
  }

  return output;
}

// 輔助函式：產生 JUnit XML 格式
function renderJunitReport(mode, targetName, report) {
  const score = report.overallScore ?? report.metrics?.overallScore ?? report.healthScore ?? null;
  const isPassed = score !== null && score >= 80 && report.status !== 'INCONCLUSIVE';
  const scoreLabel = score === null ? 'N/A' : `${score}/100`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="TestSentinel" tests="1" failures="${isPassed ? 0 : 1}" time="0.5">
  <testsuite name="${mode}" tests="1" failures="${isPassed ? 0 : 1}" time="0.5">
    <testcase classname="${mode}" name="${targetName}" time="0.5">
      ${isPassed ? '' : `<failure message="Evaluation did not pass">Score was ${scoreLabel}; status was ${report.status || report.rating || 'UNKNOWN'}.</failure>`}
    </testcase>
  </testsuite>
</testsuites>`;
}

// 1. SCAN 指令
if (command === 'scan') {
  const targetDir = positional[1] ? path.resolve(positional[1]) : process.cwd();
  console.log(`🛡️  [TEST SENTINEL CLI] Target: ${targetDir}\n`);
  const scanner = new ProjectScanner(targetDir);
  const profile = scanner.scan();
  console.log('📋 專案架構指紋：');
  console.log(JSON.stringify(profile, null, 2));

  const gn = new GitNexusBridge(targetDir);
  console.log('\n🌐 GitNexus 索引狀態:', gn.isIndexed() ? '✅ 已建立' : '❌ 未建立 (請跑 gitnexus analyze)');
  process.exit(0);
}

// 2. HISTORY 指令
if (command === 'history') {
  const mode = positional[1] || 'skill-eval';
  const target = positional[2] || 'default';
  const repo = positional[3] ? path.resolve(positional[3]) : process.cwd();
  const historyMgr = new HistoryManager(repo);

  const list = historyMgr.getHistoryList(mode, target);
  const baseline = historyMgr.getLatestBaseline(mode, target);

  if (format === 'json') {
    console.log(JSON.stringify({ mode, target, baseline, history: list }, null, 2));
  } else {
    console.log(`\n📜 [TEST SENTINEL HISTORY] Mode: ${mode} | Target: ${target}`);
    console.log(`基準 (Baseline): ${baseline ? `${baseline.savedAt} (Score: ${historyMgr.extractScore(baseline)})` : '尚無基準'}\n`);
    if (list.length === 0) {
      console.log('尚未有評測歷史紀錄。');
    } else {
      console.log('歷史版本清單：');
      list.forEach((item, idx) => {
        console.log(`  ${idx + 1}. [${item.recordId}] ${item.time} - Score: ${item.overallScore} [${item.status}]`);
      });
    }
  }
  process.exit(0);
}

// 3. RUN 指令
if (command === 'run') {
  const mode = positional[1] || 'diff-e2e';
  const repo = positional[2] ? path.resolve(positional[2]) : process.cwd();
  const historyMgr = new HistoryManager(repo);

  if (mode === 'diff-e2e') {
    if (format === 'console') console.log(`⚡ 正在執行 [模式 A] Git Diff E2E 探針與變異測試 (${repo})...`);
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

    const targetName = 'all-diffs';
    const baseline = historyMgr.getLatestBaseline('diff-e2e', targetName);
    historyMgr.saveReport('diff-e2e', targetName, { result, scorecard });
    const diff = historyMgr.computeDiff({ result, scorecard }, baseline);

    if (format === 'markdown') {
      console.log(renderMarkdownReport('diff-e2e', targetName, scorecard, diff));
    } else if (format === 'junit') {
      console.log(renderJunitReport('diff-e2e', targetName, scorecard));
    } else if (format === 'json') {
      console.log(JSON.stringify({ result, scorecard, diff }, null, 2));
    } else {
      console.log(`\n📊 評估完成！總分: ${scorecard.overallScore}/100 [${scorecard.rating}]`);
      console.log(`- 變異擊殺率: ${scorecard.metrics.mutationKillRate}%`);
      console.log(`- 靜默崩潰數: ${scorecard.metrics.silentErrorsCaught}`);
      console.log('\n💡 建議：');
      scorecard.insights.forEach(i => console.log(`  ${i}`));
    }
    process.exit(0);
  }

  if (mode === 'skill-eval') {
    const scanner = new ProjectScanner(repo);
    const profile = scanner.scan();
    const skillArg = positional[3];
    const skill = skillArg
      ? (profile.skills.find(s => s.name === skillArg || s.path.includes(skillArg)) || { path: skillArg, name: path.basename(skillArg).replace('.md', '') })
      : profile.skills[0];

    if (!skill) {
      console.log('❌ 專案中未找到任何 SKILL.md 檔案。');
      process.exit(1);
    }

    if (format === 'console') console.log(`🧠 正在執行 [模式 B] Skill 效益評測 (${skill.name})...`);
    const evaluator = new SkillEvaluator(repo);
    const report = evaluator.evaluateSkill(skill.path);

    const targetName = skill.name || 'skill';
    const baseline = historyMgr.getLatestBaseline('skill-eval', targetName);
    historyMgr.saveReport('skill-eval', targetName, report);
    const diff = historyMgr.computeDiff(report, baseline);

    if (format === 'markdown') {
      console.log(renderMarkdownReport('skill-eval', targetName, report, diff));
    } else if (format === 'junit') {
      console.log(renderJunitReport('skill-eval', targetName, report));
    } else if (format === 'json') {
      console.log(JSON.stringify({ ...report, diff }, null, 2));
    } else {
      console.log(`\n📊 評估完成！總分: ${report.metrics.overallScore}/100 [${report.metrics.overallScore >= 90 ? 'EXCELLENT' : 'GOOD'}]`);
      console.log(`- 召回率: ${report.discriminationResult?.recallRate}%`);
      console.log(`- 精確度: ${report.discriminationResult?.precisionRate}%`);
      console.log(`- Token 消耗: ${report.metrics?.totalTokens}`);
      if (diff) {
        console.log(`- 基準差異: Token ${diff.tokensSaved ? '🟢 減少' : '🔺 增加'} ${Math.abs(diff.tokensDelta)}`);
      }
    }
    process.exit(0);
  }

  if (mode === 'harness-eval') {
    if (format === 'console') console.log('🧪 正在執行 [模式 C] Harness 流程健檢...');
    const auditor = new HarnessAuditor(repo);
    const report = auditor.auditHarness();

    const targetName = 'default-harness';
    const baseline = historyMgr.getLatestBaseline('harness-eval', targetName);
    historyMgr.saveReport('harness-eval', targetName, report);
    const diff = historyMgr.computeDiff(report, baseline);

    if (format === 'markdown') {
      console.log(renderMarkdownReport('harness-eval', targetName, report, diff));
    } else if (format === 'junit') {
      console.log(renderJunitReport('harness-eval', targetName, report));
    } else if (format === 'json') {
      console.log(JSON.stringify({ ...report, diff }, null, 2));
    } else {
      console.log(`\n📊 健檢完成！狀態: ${report.status} (分數: ${report.healthScore})`);
    }
    process.exit(0);
  }
}

console.log(`
使用說明：
  node src/cli/test-sentinel.js scan [專案路徑]
  node src/cli/test-sentinel.js run diff-e2e [專案路徑] [--format=markdown|junit|json]
  node src/cli/test-sentinel.js run skill-eval [專案路徑] [Skill名稱] [--format=markdown|junit|json]
  node src/cli/test-sentinel.js run harness-eval [專案路徑] [--format=markdown|junit|json]
  node src/cli/test-sentinel.js history [模式] [目標] [專案路徑]
`);
