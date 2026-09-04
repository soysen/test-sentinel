/**
 * self-test.js - Test Sentinel 平台全模組整合自檢
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

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

console.log('🧪 Starting Test Sentinel Self-Verification Suite...\n');

// 1. Scanner Test
console.log('1. Testing ProjectScanner...');
const scanner = new ProjectScanner(path.resolve(__dirname, '..'));
const profile = scanner.scan();
assert(profile.name === 'test-sentinel', 'Scanner should detect project name');
console.log('   ✅ Scanner verified. Recommended modes:', profile.recommendedModes);

// 2. AST Mock Extractor Test (解法 2)
console.log('2. Testing AstMockExtractor (解法 2: 靜態推導)...');
const astExtractor = new AstMockExtractor();
const sampleCode = `
  const { user, orderList } = res.data;
  const isVip = user.profile.level > 3;
  return orderList.map(item => item.title);
`;
const extractedSchema = astExtractor.extractFromContent(sampleCode);
assert(extractedSchema.user, 'Should extract user object');
assert(extractedSchema.orderList, 'Should extract orderList');
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
const e2eRunner = new DiffE2ERunner(path.resolve(__dirname, '..'));
const probe = e2eRunner.generateProbeSpec({ targetUrl: 'http://localhost:3000' });
assert(fs.existsSync(probe.probeFile), 'Probe spec file should be generated in .test-eval');
const evalResult = e2eRunner.runEvaluation({
  mutations: [{ type: 'Invert comparison', line: 'if (a > b)' }]
});
assert(evalResult.mutationResults.killRate === 100, 'Kill rate should be 100%');
console.log('   ✅ Diff E2E Runner verified. Probe file:', probe.relativeFile);

// 6. Skill Evaluator Test (模式 B)
console.log('6. Testing SkillEvaluator (模式 B)...');
const skillEvaluator = new SkillEvaluator(path.resolve(__dirname, '..'));
const mockSkillPath = path.join(__dirname, 'mock-skill.md');
fs.writeFileSync(mockSkillPath, '---\nname: demo-skill\ndescription: Demo skill for automated testing\n---\n# Demo Skill\nUse when testing skills.');
const skillReport = skillEvaluator.evaluateSkill(mockSkillPath);
assert(skillReport.metrics.overallScore >= 90, 'Skill score should be >= 90');
fs.unlinkSync(mockSkillPath);
console.log('   ✅ Skill Evaluator verified. Overall Score:', skillReport.metrics.overallScore);

// 7. Harness Auditor Test (模式 C)
console.log('7. Testing HarnessAuditor (模式 C)...');
const harnessAuditor = new HarnessAuditor(path.resolve(__dirname, '..'));
// 建立一個有能力檢查 JSON 完整性的測試腳本
const testScript = path.join(__dirname, "mock-harness.sh");
fs.writeFileSync(testScript, "#!/bin/bash\nset -e\nnode -e \"JSON.parse(require('fs').readFileSync('data/tasks.json', 'utf8'))\"\n");
fs.mkdirSync(path.join(__dirname, "../data"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "../data/tasks.json"), "[]");
const auditReport = harnessAuditor.auditHarness("bash " + testScript);
fs.unlinkSync(testScript);
fs.unlinkSync(path.join(__dirname, "../data/tasks.json"));
fs.rmdirSync(path.join(__dirname, "../data"));
assert(auditReport.healthScore === 100, 'Harness health score should be 100');
console.log('   ✅ Harness Auditor verified. Status:', auditReport.status);

// 8. Quality Scorer Test
console.log('8. Testing QualityScorer...');
const scorecard = QualityScorer.computeScorecard({
  diffSummary: { totalFiles: 2, addedLines: 20 },
  e2eResult: evalResult,
  mockData: healResult
});
assert(scorecard.overallScore >= 80, 'Scorecard score should be >= 80');
console.log(`   ✅ Quality Scorer verified. Score: ${scorecard.overallScore}/100 [${scorecard.rating}]`);

console.log('\n🎉 ALL 8 MODULE VERIFICATION CHECKS PASSED!\n');
