/**
 * self-test.js - Test Sentinel 平台全模組整合自檢
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { ProjectScanner } = require('../src/core/scanner');
const { GitNexusBridge } = require('../src/core/gitnexus');
const { DiffAnalyzer } = require('../src/core/diff-analyzer');
const { AstMockExtractor } = require('../src/core/mock-engine/ast-extractor');
const { MockErrorHealer } = require('../src/core/mock-engine/error-healer');
const { HarMockManager } = require('../src/core/mock-engine/har-manager');
const { DiffE2ERunner } = require('../src/core/modes/diff-e2e-runner');
const { SkillEvaluator } = require('../src/core/modes/skill-evaluator');
const { HarnessAuditor } = require('../src/core/modes/harness-auditor');
const { QualityScorer } = require('../src/core/scorer');
const { HistoryManager } = require('../src/core/history-manager');
const { AgentEvalQueue } = require('../src/core/agent-eval-queue');

console.log('🧪 Starting Test Sentinel Self-Verification Suite...\n');

const dashboardHtml = fs.readFileSync(path.resolve(__dirname, '../src/web/index.html'), 'utf8');
assert(dashboardHtml.includes('<div id="caseResultsToolbar" class="case-results-toolbar hidden">'), 'Case result toolbar must use a valid opening div tag');
assert(!dashboardHtml.includes('>=div id="caseResultsToolbar"'), 'Case result toolbar tag must not render as visible text');
const dashboardScript = fs.readFileSync(path.resolve(__dirname, '../src/web/js/app.js'), 'utf8');
assert(!dashboardScript.includes('class="compact-case-summary"<='), 'Compact case summary must use a valid opening span tag');
assert(!dashboardScript.includes('</strong<=</span<='), 'Compact case summary must use valid closing tags');

// 1. Scanner Test
console.log('1. Testing ProjectScanner...');
const scanner = new ProjectScanner(path.resolve(__dirname, '..'));
const profile = scanner.scan();
assert(profile.name === 'test-sentinel', 'Scanner should detect project name');
const scannerFixture = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-scanner-'));
fs.writeFileSync(path.join(scannerFixture, 'package.json'), JSON.stringify({ scripts: { test: 'node test.js' } }));
assert(new ProjectScanner(scannerFixture).scan().harness.hasHarness === false, 'Generic test script must not be treated as Harness configuration');
fs.writeFileSync(path.join(scannerFixture, 'package.json'), JSON.stringify({ scripts: { 'harness:check': 'node harness.js' } }));
const harnessProfile = new ProjectScanner(scannerFixture).scan();
assert(harnessProfile.harness.hasHarness === true, 'harness:check script should enable Harness mode');
assert(harnessProfile.harness.command === 'npm run harness:check', 'Scanner should expose the detected Harness command');
fs.writeFileSync(path.join(scannerFixture, 'package.json'), JSON.stringify({ scripts: { test: 'node test.js' } }));
fs.mkdirSync(path.join(scannerFixture, '.github', 'harness'), { recursive: true });
const emptyGithubHarnessProfile = new ProjectScanner(scannerFixture).scan();
assert(emptyGithubHarnessProfile.harness.hasHarness === false, 'Empty .github/harness must not enable Harness mode');
assert(emptyGithubHarnessProfile.harness.githubHarnessExists === true, 'Scanner should report an empty .github/harness directory');
fs.writeFileSync(path.join(scannerFixture, '.github', 'harness', 'check.sh'), '#!/bin/sh\nexit 0\n');
const githubHarnessProfile = new ProjectScanner(scannerFixture).scan();
assert(githubHarnessProfile.harness.hasHarness === true, '.github/harness should enable Harness mode');
assert(githubHarnessProfile.harness.githubHarnessExists === true, 'Scanner should report .github/harness presence');
assert(githubHarnessProfile.harness.command === 'bash .github/harness/check.sh', 'Scanner should expose a .github/harness script command');
fs.rmSync(scannerFixture, { recursive: true, force: true });
console.log('   ✅ Scanner verified. Recommended modes:', profile.recommendedModes);

// 2. AST Mock Extractor Test (解法 2)
console.log('2. Testing AstMockExtractor (解法 2: 靜態推導)...');
const astExtractor = new AstMockExtractor();
const sampleCode = `
  interface OrderProps {
    orderId: number;
    customerName: string;
    items: string[];
  }
  const { user, orderList } = res.data;
  const isVip = user.profile.level > 3;
  return orderList.map(item => item.title);
`;
const extractedSchema = astExtractor.extractFromContent(sampleCode);
assert(extractedSchema.user, 'Should extract user object');
assert(extractedSchema.orderList, 'Should extract orderList');
assert(extractedSchema.order && extractedSchema.order.orderId === 100, 'Should extract OrderProps from TypeScript interface');
console.log('   ✅ AST Mock Extractor verified. Extracted Seed:', JSON.stringify(extractedSchema));

// 3. Error Healer Test (解法 3)
console.log('3. Testing MockErrorHealer (解法 3: 報錯自癒)...');
const healer = new MockErrorHealer();
const initialMock = { user: { id: 101 } };
const sampleError = "TypeError: Cannot read properties of undefined (reading 'roles')";
const healResult = healer.heal(initialMock, sampleError);
assert(healResult.healed === true, 'Healer should heal missing property');
assert(healResult.patchedField === 'roles', 'Patched field should be roles');
console.log('   ✅ Error Healer verified. Healed Result:', JSON.stringify(healResult.mock));

// 4. HAR Mock Manager Test (解法 1)
console.log('4. Testing HarMockManager (解法 1: 固化快照)...');
const harManager = new HarMockManager(path.resolve(__dirname, '..'));
const savedPath = harManager.saveSnapshot('test_snapshot', healResult.mock);
assert(fs.existsSync(savedPath), 'Snapshot file should exist');
const loaded = harManager.loadSnapshot('test_snapshot');
assert(loaded.user && loaded.user.roles, 'Loaded snapshot should contain user.roles');
console.log('   ✅ HAR Mock Manager verified. Saved snapshot:', savedPath);

// 5. Diff E2E Runner Test (模式 A)
console.log('5. Testing DiffE2ERunner (模式 A: 探針與變異)...');
const diffFixture = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-diff-'));
fs.writeFileSync(path.join(diffFixture, 'subject.js'), 'const unused = true;\nmodule.exports = true;\n');
fs.writeFileSync(path.join(diffFixture, 'subject.test.js'), "const assert = require('assert');\nassert.strictEqual(require('./subject'), true);\n");
const e2eRunner = new DiffE2ERunner(diffFixture);
const inconclusiveResult = e2eRunner.runEvaluation({ mutations: [] });
assert(inconclusiveResult.status === 'INCONCLUSIVE', 'Missing test command must be inconclusive');
assert(inconclusiveResult.mutationResults.killRate === null, 'Unmeasured kill rate must be null');
const originalSubject = fs.readFileSync(path.join(diffFixture, 'subject.js'), 'utf8');
const diffProgress = [];
const evalResult = e2eRunner.runEvaluation({
  testCommand: 'node subject.test.js',
  onProgress: progress => diffProgress.push(progress),
  mutations: [
    {
      type: 'Flip exported boolean',
      filePath: 'subject.js',
      originalLine: 'module.exports = true;',
      mutatedLine: 'module.exports = false;'
    },
    {
      type: 'Flip unused boolean',
      filePath: 'subject.js',
      originalLine: 'const unused = true;',
      mutatedLine: 'const unused = false;'
    }
  ]
});
assert(evalResult.status === 'MEASURED', 'Valid mutations should produce measured results');
assert(evalResult.mutationResults.killedCount === 1, 'Behavior mutation should be killed');
assert(evalResult.mutationResults.survivedCount === 1, 'Unused mutation should survive');
assert(evalResult.mutationResults.killRate === 50, 'Kill rate should reflect killed and survived mutants');
assert(evalResult.probeExecution.status === 'NOT_MEASURED', 'Passing tests must not imply that the generated browser probe ran');
assert(evalResult.silentErrorsCaught === null, 'Runtime errors must remain unmeasured without probe execution evidence');
assert(evalResult.caseComparisons[0].evidence.restoredBaseline.passed === true, 'Killed mutation must be confirmed by a restored passing baseline');
assert(e2eRunner.looksLikeInfrastructureFailure({ stdout: '', stderr: 'FATAL ERROR: heap out of memory', signal: null }) === true, 'Out-of-memory failures must be invalid infrastructure evidence');
assert(e2eRunner.looksLikeInfrastructureFailure({ stdout: '', stderr: '', signal: 'SIGKILL' }) === true, 'Signal-terminated tests must be invalid infrastructure evidence');
assert(e2eRunner.looksLikeInfrastructureFailure({ stdout: '', stderr: 'ENOSPC: no space left on device', signal: null }) === true, 'Disk exhaustion must be invalid infrastructure evidence');
assert(diffProgress.some(progress => progress.phase === 'baseline'), 'Diff evaluation must report baseline progress');
assert(diffProgress.filter(progress => progress.phase === 'mutation').length === 2, 'Diff evaluation must report each mutation progress');
assert(diffProgress.at(-1).phase === 'complete', 'Diff evaluation must report completion');
assert(fs.readFileSync(path.join(diffFixture, 'subject.js'), 'utf8') === originalSubject, 'Mutated source must be restored');
fs.rmSync(diffFixture, { recursive: true, force: true });
console.log('   ✅ Diff E2E Runner verified with killed/survived controls and restoration.');

// 6. Skill Evaluator Test (模式 B)
console.log('6. Testing SkillEvaluator (模式 B)...');
const skillEvaluator = new SkillEvaluator(path.resolve(__dirname, '..'));
const mockSkillPath = path.join(__dirname, 'mock-skill.md');
fs.writeFileSync(mockSkillPath, '---\nname: demo-skill\ndescription: Demo skill for automated testing\n---\n# Demo Skill\nUse when testing skills.');
const heuristicReport = skillEvaluator.evaluateSkill(mockSkillPath);
assert(heuristicReport.status === 'HEURISTIC', 'Generated cases must not be presented as measured');
assert(heuristicReport.metrics.overallScore === null, 'Heuristic routing must not receive a formal score');
assert(heuristicReport.caseComparisons.every(testCase => testCase.evidenceType === 'KEYWORD_HEURISTIC'), 'Generated cases must disclose heuristic evidence');
const reviewSkillContent = fs.readFileSync(path.join(__dirname, '../skills/code-review-agent/SKILL.md'), 'utf8');
const reviewSkillMeta = skillEvaluator.parseSkillMeta(reviewSkillContent);
const reviewSuite = skillEvaluator.generateBenchmarkSuite(reviewSkillMeta);
assert(reviewSuite.length === 8, 'Code review benchmark should contain eight diverse cases');
assert(reviewSuite.filter(testCase => testCase.expectedTrigger).length === 4, 'Benchmark should balance positive and negative cases');
assert(reviewSuite.every(testCase => !testCase.query.toLowerCase().includes(reviewSkillMeta.name.toLowerCase())), 'Queries must not leak the Skill name');
assert(reviewSuite.some(testCase => testCase.strategy.includes('最小差異')), 'Benchmark should include a minimal-pair boundary');
assert(reviewSuite.some(testCase => testCase.strategy.includes('否定')), 'Benchmark should include explicit negation');
assert(reviewSuite.some(testCase => testCase.strategy.includes('跨語言')), 'Benchmark should include a cross-language paraphrase');
const skillReport = skillEvaluator.evaluateSkill(mockSkillPath, [
  { type: 'in-domain', query: '請驗證自動化流程', expectedTrigger: true, triggered: true },
  { type: 'distractor', query: '請分析本週股市', expectedTrigger: false, triggered: false }
]);
assert(skillReport.status === 'MEASURED', 'Observed router outcomes should be measured');
assert(skillReport.metrics.recallRate === 100, 'Observed positive case should produce 100% recall');
assert(skillReport.metrics.precisionRate === 100, 'Observed cases should produce 100% precision');
assert(skillReport.metrics.averageQualityScore === null, 'Quality must remain unscored without output evidence');
assert(skillReport.metrics.routingScore === 100, 'Measured routing should retain its own score');
assert(skillReport.metrics.overallScore === null, 'Overall score requires measured output quality evidence');
fs.unlinkSync(mockSkillPath);
const agentQueueFixture = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-agent-'));
const agentQueue = new AgentEvalQueue(agentQueueFixture);
const agentJob = agentQueue.createSkillJob({
  skillPath: 'SKILL.md',
  cases: [{ id: 'A', type: 'in-domain', query: 'Perform the requested workflow', expectedTrigger: true }]
});
assert(!JSON.stringify(agentQueue.getStatus(agentJob.jobId)).includes('expectedTrigger'), 'Pending Agent request must keep labels sealed');
agentQueue.submit(agentJob.jobId, {
  agent: 'self-test',
  observations: [{ id: 'A', triggered: true, output: 'done', latencyMs: 25, tokenMeasurementReason: 'Test runtime does not expose tokens.', qualityChecks: [{ name: 'completed', passed: true, evidence: 'output=done' }] }]
});
const completedAgentJob = agentQueue.getStatus(agentJob.jobId);
assert(completedAgentJob.status === 'COMPLETED', 'Agent result should complete the job');
assert(completedAgentJob.evaluationCases[0].expectedTrigger === true, 'Completed job should restore sealed labels for evaluation');
assert(completedAgentJob.result.observations[0].tokenMeasurementStatus === 'UNAVAILABLE', 'Missing runtime token usage must be explicit');
assert(completedAgentJob.result.observations[0].tokenMeasurementReason === 'Test runtime does not expose tokens.', 'Token unavailability reason must be preserved');
fs.rmSync(agentQueueFixture, { recursive: true, force: true });
console.log('   ✅ Skill Evaluator verified with heuristic and measured evidence separation.');

// 7. Harness Auditor Test (模式 C)
console.log('7. Testing HarnessAuditor (模式 C)...');
const harnessFixture = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-harness-'));
fs.mkdirSync(path.join(harnessFixture, 'data'));
fs.writeFileSync(path.join(harnessFixture, 'data/tasks.json'), '[]');
const testScript = path.join(harnessFixture, 'good-harness.sh');
const badScript = path.join(harnessFixture, 'bad-harness.sh');
fs.writeFileSync(testScript, "#!/bin/bash\nset -e\nnode -e \"JSON.parse(require('fs').readFileSync('data/tasks.json', 'utf8'))\"\n");
fs.writeFileSync(badScript, "#!/bin/bash\nnode -e \"JSON.parse(require('fs').readFileSync('data/tasks.json', 'utf8'))\" || true\n");
const harnessAuditor = new HarnessAuditor(harnessFixture);
const harnessProgress = [];
const auditReport = harnessAuditor.auditHarness('bash ' + testScript, {
  onProgress: progress => harnessProgress.push(progress)
});
assert(auditReport.healthScore === 100, 'Harness health score should be 100');
assert(auditReport.status === 'HEALTHY', 'Fault-sensitive harness should be healthy');
assert(auditReport.checks.find(check => check.name.includes('Fault Sensitivity')).targetFile === 'data/tasks.json', 'Fault evidence must identify its target file');
assert(harnessProgress.some(progress => progress.phase === 'fault-injection'), 'Harness evaluation must report fault injection progress');
assert(harnessProgress.some(progress => progress.phase === 'idempotency'), 'Harness evaluation must report idempotency progress');
assert(harnessProgress.at(-1).phase === 'complete', 'Harness evaluation must report completion');
const badAuditReport = harnessAuditor.auditHarness('bash ' + badScript);
assert(badAuditReport.status === 'UNHEALTHY', 'Harness that swallows failures must be unhealthy');
assert(badAuditReport.checks.find(check => check.name.includes('Fault Sensitivity')).passed === false, 'Swallowed fault must be detected');
const failedBaselineReport = harnessAuditor.auditHarness('node -e "process.exit(2)"');
assert(failedBaselineReport.status === 'INCONCLUSIVE', 'Failed baseline must stop the harness evaluation');
assert(failedBaselineReport.healthScore === null, 'Failed baseline must not receive a health score');
assert(failedBaselineReport.checks.length === 1, 'Failed baseline must skip fault injection and idempotency checks');
fs.unlinkSync(path.join(harnessFixture, 'data/tasks.json'));
const missingFaultTargetReport = harnessAuditor.auditHarness('node -e "process.exit(0)"');
assert(missingFaultTargetReport.status === 'INCONCLUSIVE', 'Missing fault target must be inconclusive');
assert(missingFaultTargetReport.healthScore === null, 'Missing fault evidence must not receive a health score');
assert(missingFaultTargetReport.checks.find(check => check.name.includes('Fault Sensitivity')).passed === null, 'Unavailable fault injection must not be counted as a failure');
const invalidFaultTargetReport = harnessAuditor.auditHarness('node -e "process.exit(0)"', { faultTarget: '../outside.json' });
assert(invalidFaultTargetReport.status === 'INCONCLUSIVE', 'Out-of-project fault target must be rejected');
fs.rmSync(harnessFixture, { recursive: true, force: true });
console.log('   ✅ Harness Auditor verified with healthy and swallowed-error controls.');

// 8. Quality Scorer Test
console.log('8. Testing QualityScorer...');
const scorecard = QualityScorer.computeScorecard({
  diffSummary: { totalFiles: 2, addedLines: 20 },
  e2eResult: evalResult,
  mockData: healResult
});
assert(scorecard.status === 'MEASURED', 'Measured mutation evidence should produce a score');
assert(scorecard.overallScore === 80, '50% mutation kill rate should produce an evidence-based score of 80');
const unmeasuredScorecard = QualityScorer.computeScorecard({});
assert(unmeasuredScorecard.status === 'INCONCLUSIVE', 'Missing evidence must be inconclusive');
assert(unmeasuredScorecard.overallScore === null, 'Missing evidence must not receive a default score');
console.log(`   ✅ Quality Scorer verified. Evidence-based score: ${scorecard.overallScore}/100`);

// 9. History Manager Test (持久化與基準對比)
console.log('9. Testing HistoryManager (歷史分層持久化與基準對比)...');
const historyFixture = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-history-'));
const historyManager = new HistoryManager(historyFixture);
const sampleReport1 = {
  overallScore: 88,
  metrics: { recall: 90, precision: 100, totalTokens: 1500 }
};
const save1 = historyManager.saveReport('test-mode', 'target-demo', sampleReport1);
assert(fs.existsSync(save1.filePath), 'History file should be written');
assert(fs.existsSync(save1.latestPath), 'Latest baseline should be written');

const sampleReport2 = {
  overallScore: 95,
  metrics: { recall: 100, precision: 100, totalTokens: 1100 }
};
const baseline = historyManager.getLatestBaseline('test-mode', 'target-demo');
assert(baseline !== null, 'Baseline should exist');
const diff = historyManager.computeDiff(sampleReport2, baseline);
assert(diff.scoreDelta === 7, 'Score delta should be +7');
assert(diff.tokensSaved === true, 'Tokens should be saved');

const historyList = historyManager.getHistoryList('test-mode', 'target-demo');
assert(historyList.length >= 1, 'History list should contain at least 1 record');
historyManager.saveReport('test-mode', 'target-inconclusive', { status: 'INCONCLUSIVE', overallScore: null });
const inconclusiveHistory = historyManager.getHistoryList('test-mode', 'target-inconclusive');
assert(inconclusiveHistory[0].overallScore === null, 'History must preserve an inconclusive null score');
assert(inconclusiveHistory[0].status === 'INCONCLUSIVE', 'History must preserve inconclusive status');
const inconclusiveDiff = historyManager.computeDiff({ overallScore: null }, sampleReport1);
assert(inconclusiveDiff.scoreDelta === null, 'Score delta must be unavailable when either score is inconclusive');
console.log(`   ✅ History Manager verified. Records: ${historyList.length}, Score Delta: +${diff.scoreDelta}, Tokens Delta: ${diff.tokensDelta}`);
fs.rmSync(historyFixture, { recursive: true, force: true });

console.log('\n🎉 ALL 9 MODULE VERIFICATION CHECKS PASSED!\n');
