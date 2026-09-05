/**
 * self-test.js - Test Sentinel 平台全模組整合自檢
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { ProjectScanner } = require('../src/core/scanner');
const { GitNexusBridge } = require('../src/core/gitnexus');
const { DiffAnalyzer, PathScopeValidationError } = require('../src/core/diff-analyzer');
const { ProjectSourceAnalyzer, MAX_FILE_SIZE, MAX_TOTAL_FILES, MAX_TOTAL_MUTATIONS } = require('../src/core/project-source-analyzer');
const { AstMockExtractor } = require('../src/core/mock-engine/ast-extractor');
const { MockErrorHealer } = require('../src/core/mock-engine/error-healer');
const { HarMockManager } = require('../src/core/mock-engine/har-manager');
const { DiffE2ERunner } = require('../src/core/modes/diff-e2e-runner');
const { SkillEvaluator } = require('../src/core/modes/skill-evaluator');
const { HarnessAuditor } = require('../src/core/modes/harness-auditor');
const { QualityScorer } = require('../src/core/scorer');
const { buildRemediationPlan } = require('../src/core/remediation-planner');
const { HistoryManager } = require('../src/core/history-manager');
const { AgentEvalQueue } = require('../src/core/agent-eval-queue');
const { getCasesPreview } = require('../src/server/routes/preview');

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
const mutationAnalyzer = new DiffAnalyzer(path.resolve(__dirname, '..'));
assert(mutationAnalyzer.findMutationCandidates(['.remediation-header > div {'], 'src/web/css/style.css').length === 0, 'CSS combinators must not become code mutations');
assert(mutationAnalyzer.findMutationCandidates(['<div class="remediation-header">'], 'src/web/index.html').length === 0, 'HTML tag delimiters must not become code mutations');
assert(mutationAnalyzer.findMutationCandidates(['if (enabled === true) run();'], 'tests/example.test.js').length === 0, 'Test files must not become mutation targets');
assert(mutationAnalyzer.findMutationCandidates(['reuseExistingServer: false'], 'playwright.config.js').length === 0, 'Tool configuration must not become a mutation target');
assert(mutationAnalyzer.findMutationCandidates(['if (enabled === true) run();'], 'src/example.js').length === 2, 'Product source files should remain mutation targets');
assert(mutationAnalyzer.findMutationCandidates(['const markup = "<div>";'], 'src/web/app.js').length === 0, 'Operators inside strings must not become mutations');
assert(mutationAnalyzer.findMutationCandidates(['const handler = () => true;'], 'src/web/app.js').length === 1, 'Arrow syntax must not become a comparison mutation');
assert(mutationAnalyzer.findMutationCandidates(['return <div className="panel">Ready</div>;'], 'src/web/App.jsx').length === 0, 'JSX tag delimiters must not become comparison mutations');
assert(mutationAnalyzer.findMutationCandidates(['return <div className="panel">Ready</div>;'], 'src/web/App.js').length === 0, 'Legacy .js React files must not treat JSX tag delimiters as comparisons');
assert(mutationAnalyzer.findMutationCandidates(['return <Panel', '  enabled={ready === true}', '/>;'], 'src/web/App.js').length === 0, 'Multiline JSX tags in .js files must be masked across lines');
assert(mutationAnalyzer.findMutationCandidates(['if (ready === true) return <Panel />;'], 'src/web/App.tsx').length === 2, 'TSX logic outside JSX tags should remain mutable');
const logicalCandidates = mutationAnalyzer.findMutationCandidates(['if (count >= 1 && enabled === true) return;'], 'src/web/app.js');
assert(logicalCandidates.length === 4, 'Executable comparisons, logical operators, and booleans should remain mutation candidates');
assert(logicalCandidates.every(candidate => !candidate.mutatedLine.includes('!== false')), 'Each candidate must mutate only one operator occurrence');
const scannerFixture = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-scanner-'));
fs.writeFileSync(path.join(scannerFixture, 'package.json'), JSON.stringify({ scripts: { test: 'node test.js' } }));
assert(new ProjectScanner(scannerFixture).scan().harness.hasHarness === false, 'Generic test script must not be treated as Harness configuration');
fs.writeFileSync(path.join(scannerFixture, 'package.json'), JSON.stringify({ scripts: { 'harness:check': 'node harness.js' } }));
const harnessProfile = new ProjectScanner(scannerFixture).scan();
assert(harnessProfile.harness.hasHarness === true, 'harness:check script should enable Harness mode');
assert(harnessProfile.harness.command === 'npm run harness:check', 'Scanner should expose the detected Harness command');
fs.writeFileSync(path.join(scannerFixture, 'package.json'), JSON.stringify({ scripts: { test: 'node test.js' } }));
fs.writeFileSync(path.join(scannerFixture, 'run_tests.sh'), '#!/bin/sh\nexit 0\n');
const rootHarnessScriptProfile = new ProjectScanner(scannerFixture).scan();
assert(rootHarnessScriptProfile.harness.hasHarness === true, 'A root run_tests.sh script should enable Harness mode');
assert(rootHarnessScriptProfile.harness.command === 'bash run_tests.sh', 'Scanner should expose the root Harness script command');
fs.rmSync(path.join(scannerFixture, 'run_tests.sh'));
fs.writeFileSync(path.join(scannerFixture, 'package.json'), JSON.stringify({ scripts: { test: 'node test.js', 'build-sit': 'node build.js' } }));
fs.mkdirSync(path.join(scannerFixture, '.github', 'harness'), { recursive: true });
const emptyGithubHarnessProfile = new ProjectScanner(scannerFixture).scan();
assert(emptyGithubHarnessProfile.harness.hasHarness === false, 'Empty .github/harness must not enable Harness mode');
assert(emptyGithubHarnessProfile.harness.githubHarnessExists === true, 'Scanner should report an empty .github/harness directory');
fs.writeFileSync(path.join(scannerFixture, '.github', 'harness', 'config.yml'), 'enabled: true\n');
const configuredGithubHarnessProfile = new ProjectScanner(scannerFixture).scan();
assert(configuredGithubHarnessProfile.harness.hasHarness === true, '.github/harness configuration should enable Harness mode');
assert(configuredGithubHarnessProfile.harness.command === null, 'Generic package test scripts must not be treated as Harness commands');
const harnessPreviewWithoutCommand = getCasesPreview({ mode: 'harness-eval', projectPath: scannerFixture });
assert(harnessPreviewWithoutCommand.commandAvailable === false, 'Harness preview should report a missing dedicated command');
assert(!harnessPreviewWithoutCommand.targetSummary.includes('npm test'), 'Harness preview must not invent an npm test fallback');
fs.writeFileSync(path.join(scannerFixture, '.github', 'harness', 'plan.md'), 'Validation: run build-sit before completion.\n');
const referencedPackageScriptProfile = new ProjectScanner(scannerFixture).scan();
assert(referencedPackageScriptProfile.harness.command === 'npm run build-sit', 'Harness docs should resolve a referenced package script');
fs.writeFileSync(path.join(scannerFixture, 'package.json'), JSON.stringify({ engines: { node: '14.20.1' }, scripts: { 'build-sit': 'node build.js' } }));
const legacyExecutionEnv = new HarnessAuditor(scannerFixture).getExecutionEnvironment();
assert(legacyExecutionEnv.PATH.includes('/v14.') || legacyExecutionEnv.NODE_OPTIONS?.includes('--openssl-legacy-provider'), 'Legacy Node projects should receive a compatible execution environment');
fs.mkdirSync(path.join(scannerFixture, '.github', 'script'), { recursive: true });
fs.writeFileSync(path.join(scannerFixture, '.github', 'script', 'verify-harness.js'), 'process.exit(0);\n');
const githubScriptHarnessProfile = new ProjectScanner(scannerFixture).scan();
assert(githubScriptHarnessProfile.harness.command === 'node .github/script/verify-harness.js', '.github/script should provide the Harness command');
fs.rmSync(path.join(scannerFixture, '.github', 'script'), { recursive: true, force: true });
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
const bootstrapRunner = new DiffE2ERunner(diffFixture);
bootstrapRunner.runProbe = probe => ({
  status: 'MEASURED',
  passed: true,
  exitCode: 0,
  marker: probe.executionMarker,
  command: 'playwright bootstrap probe',
  reason: null
});
bootstrapRunner.runTestCommand = () => ({ passed: true, exitCode: 0, durationMs: 1, stdout: '', stderr: '' });
const bootstrapResult = bootstrapRunner.runEvaluation({
  mutations: [{
    type: 'Flip exported boolean',
    filePath: 'subject.js',
    originalLine: 'module.exports = true;',
    mutatedLine: 'module.exports = false;'
  }]
});
assert.strictEqual(bootstrapResult.status, 'MEASURED', 'Testless projects should use a successful bootstrap probe as the mutation baseline');
assert.strictEqual(bootstrapResult.testStrategy.type, 'BOOTSTRAP_PROBE', 'Testless projects should report the bootstrap strategy');
assert.strictEqual(bootstrapResult.baselinePassed, true, 'Successful bootstrap probe should provide the measured baseline');
assert.strictEqual(bootstrapResult.probeExecution.status, 'MEASURED', 'Bootstrap probe should preserve measured runtime evidence');
assert.deepStrictEqual(bootstrapResult.silentErrorsCaught, [], 'Successful bootstrap probe should report a clean runtime safety result');
const sampledMutations = bootstrapRunner.selectMutationSample(Array.from({ length: 305 }, (_, index) => ({ index })), 20);
assert.strictEqual(sampledMutations.length, 20, 'Large single-file mutation sets should be capped to the execution budget');
assert.strictEqual(sampledMutations[0].index, 0, 'Mutation sampling should include the start of the file');
assert.strictEqual(sampledMutations.at(-1).index, 304, 'Mutation sampling should include the end of the file');
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
const targetedStrategy = e2eRunner.detectTestStrategy([{ filePath: 'subject.js' }], { sourceMode: 'project' });
assert.strictEqual(targetedStrategy.type, 'TARGETED', 'Project source mode should use a related test when one exists');
assert(targetedStrategy.command.includes('subject.test.js'), 'Targeted command should identify the related test file');
const targetedEvalResult = e2eRunner.runEvaluation({
  sourceMode: 'project',
  mutations: [{
    type: 'Flip exported boolean',
    filePath: 'subject.js',
    originalLine: 'module.exports = true;',
    mutatedLine: 'module.exports = false;'
  }]
});
assert.strictEqual(targetedEvalResult.status, 'MEASURED', 'Auto-detected related test should produce measured project-mode evidence');
assert.strictEqual(targetedEvalResult.testStrategy.type, 'TARGETED', 'Measured result should disclose targeted test strategy');
assert.deepStrictEqual(targetedEvalResult.testStrategy.relatedTestFiles, ['subject.test.js'], 'Measured result should identify the related test file');
assert.strictEqual(targetedEvalResult.mutationResults.killedCount, 1, 'Related test should kill the project-file mutation');
const explicitStrategy = e2eRunner.detectTestStrategy([], { sourceMode: 'project', testCommand: 'node custom-check.js' });
assert.strictEqual(explicitStrategy.type, 'USER_SUPPLIED', 'User-supplied test command must take precedence');
fs.rmSync(diffFixture, { recursive: true, force: true });

// 模式 A 路徑範圍選測 (Path Scoped Selection) 深度自檢
const gitFixture = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-git-diff-'));
const { execFileSync } = require('child_process');
const execGit = (args) => {
  return execFileSync('git', args, {
    cwd: gitFixture,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com'
    }
  });
};

execGit(['-c', 'init.defaultBranch=main', 'init']);
execGit(['config', 'user.name', 'Test']);
execGit(['config', 'user.email', 'test@example.com']);
fs.mkdirSync(path.join(gitFixture, 'src', 'core'), { recursive: true });
fs.mkdirSync(path.join(gitFixture, 'src', 'web'), { recursive: true });
fs.mkdirSync(path.join(gitFixture, 'tests'), { recursive: true });

fs.writeFileSync(path.join(gitFixture, 'src', 'core', 'a.js'), 'const a = 1;\nmodule.exports = a === 1;\n');
fs.writeFileSync(path.join(gitFixture, 'src', 'core', 'b.js'), 'const b = 1;\nmodule.exports = b === 1;\n');
fs.writeFileSync(path.join(gitFixture, 'src', 'web', 'c.js'), 'const c = 1;\nmodule.exports = c === 1;\n');
fs.writeFileSync(path.join(gitFixture, 'tests', 'a.spec.js'), 'const test = 1;\n');
execGit(['add', '.']);
execGit(['commit', '-m', 'initial']);

fs.writeFileSync(path.join(gitFixture, 'src', 'core', 'a.js'), 'const a = 2;\nmodule.exports = a === 2;\n');
fs.writeFileSync(path.join(gitFixture, 'src', 'core', 'b.js'), 'const b = 2;\nmodule.exports = b === 2;\n');
fs.writeFileSync(path.join(gitFixture, 'src', 'web', 'c.js'), 'const c = 2;\nmodule.exports = c === 2;\n');
fs.writeFileSync(path.join(gitFixture, 'tests', 'a.spec.js'), 'const test = 2;\n');

const gitAnalyzer = new DiffAnalyzer(gitFixture);

// 1. 未篩選 (Unfiltered)
const diffAll = gitAnalyzer.getDiff('all');
assert.strictEqual(diffAll.files.length, 4, 'Unfiltered diff should match all changed files');
assert(!diffAll.scopeMetadata, 'Unfiltered diff should have no scopeMetadata');

// 2. 單檔 (Single file)
const diffSingle = gitAnalyzer.getDiff('all', { selectedPaths: ['src/core/a.js'] });
assert.strictEqual(diffSingle.files.length, 1, 'Single path scope should match exactly 1 file');
assert.strictEqual(diffSingle.files[0].filePath, 'src/core/a.js', 'Matched file must be src/core/a.js');
assert(diffSingle.scopeMetadata && diffSingle.scopeMetadata.hash, 'Scoped diff must contain scope hash');

// 3. 資料夾 (Directory)
const diffDir = gitAnalyzer.getDiff('all', { selectedPaths: ['src/core'] });
assert.strictEqual(diffDir.files.length, 2, 'Directory path scope should match all files inside folder');
assert(diffDir.files.every(f => f.filePath.startsWith('src/core/')), 'All files must be in src/core');

// 4. Include glob
const diffInclude = gitAnalyzer.getDiff('all', { includePatterns: ['src/**/*.js'] });
assert.strictEqual(diffInclude.files.length, 3, 'Include glob should match 3 js files in src');

// 5. Exclude glob (!pattern)
const diffExclude = gitAnalyzer.getDiff('all', { excludePatterns: ['**/*.spec.js'] });
assert.strictEqual(diffExclude.files.length, 3, 'Exclude glob should exclude spec files');
assert(!diffExclude.files.some(f => f.filePath.endsWith('.spec.js')), 'No spec files should remain');

// 5b. Multiline pattern string (每行一個 pattern，!pattern 為排除)
const diffPatternString = gitAnalyzer.getDiff('all', 'src/**/*.js\n!src/web/**');
assert.strictEqual(diffPatternString.files.length, 2, 'Multiline pattern string should match src/core js files');

// 6. Git scope 交集 (selectedPaths ∩ includePatterns) 與 exclude 優先序
const diffIntersection = gitAnalyzer.getDiff('all', { selectedPaths: ['src/core'], excludePatterns: ['*b.js'] });
assert.strictEqual(diffIntersection.files.length, 1, 'Intersection of directory and exclude should match 1 file');
assert.strictEqual(diffIntersection.files[0].filePath, 'src/core/a.js');

const diffSelectedAndInclude = gitAnalyzer.getDiff('all', {
  selectedPaths: ['src/core/a.js', 'src/core/b.js', 'src/web/c.js'],
  includePatterns: ['*a.js']
});
assert.strictEqual(diffSelectedAndInclude.files.length, 1, 'selectedPaths ∩ includePatterns must match 1 file');
assert.strictEqual(diffSelectedAndInclude.files[0].filePath, 'src/core/a.js');

const diffSelectedIncludeExclude = gitAnalyzer.getDiff('all', {
  selectedPaths: ['src/core'],
  includePatterns: ['src/**/*.js'],
  excludePatterns: ['*b.js']
});
assert.strictEqual(diffSelectedIncludeExclude.files.length, 1, 'selectedPaths ∩ includePatterns \\ excludePatterns must match 1 file');
assert.strictEqual(diffSelectedIncludeExclude.files[0].filePath, 'src/core/a.js');

// 7. 空匹配 (Empty match)
const diffEmptySelection = gitAnalyzer.getDiff('all', { selectedPaths: [] });
assert.strictEqual(diffEmptySelection.files.length, 0, 'Empty selectedPaths must produce 0 files');
const diffNoMatch = gitAnalyzer.getDiff('all', { includePatterns: ['nonexistent/**'] });
assert.strictEqual(diffNoMatch.files.length, 0, 'Non-matching glob must produce 0 files');

// 8. 惡意路徑防禦 (Malicious paths: 絕對路徑、.. 穿越、NUL 與無效語法)
assert.throws(() => gitAnalyzer.getDiff('all', { selectedPaths: ['/etc/passwd'] }), err => {
  return err instanceof PathScopeValidationError && err.statusCode === 400 && err.code === 'INVALID_PATH_SCOPE' && /absolute/i.test(err.message);
}, 'Absolute path must throw PathScopeValidationError');
assert.throws(() => gitAnalyzer.getDiff('all', { selectedPaths: ['C:\\Windows\\system32'] }), /absolute/i, 'Windows absolute path must be rejected');
assert.throws(() => gitAnalyzer.getDiff('all', { selectedPaths: ['../secret.js'] }), /traversal/i, 'Directory traversal must be rejected');
assert.throws(() => gitAnalyzer.getDiff('all', { selectedPaths: ['src/../../secret.js'] }), /traversal/i, 'Nested traversal must be rejected');
assert.throws(() => gitAnalyzer.getDiff('all', { selectedPaths: ['src/\0evil.js'] }), /null byte/i, 'NUL byte must be rejected');
assert.throws(() => gitAnalyzer.getDiff('all', { selectedPaths: [':invalid:syntax'] }), /invalid pathspec/i, 'Invalid pathspec syntax must be rejected');

// 9. Canonical Scope & Hash 一致性
const scope1 = DiffAnalyzer.canonicalizePathScope({ selectedPaths: ['src/web/c.js', 'src/core/a.js'] });
const scope2 = DiffAnalyzer.canonicalizePathScope({ selectedPaths: ['src/core/a.js', 'src/web/c.js'] });
assert.strictEqual(scope1.hash, scope2.hash, 'Path scope hash must be order-independent');

// 10. Preview 與 Run 一致性與零匹配檢驗
const previewWithScope = getCasesPreview({
  mode: 'diff-e2e',
  projectPath: gitFixture,
  pathScope: { selectedPaths: ['src/core/a.js'] }
});
assert.deepStrictEqual(previewWithScope.matchedFiles, ['src/core/a.js'], 'Preview matched files must match path scope');
assert(previewWithScope.plannedCases.length > 0, 'Preview should generate planned cases for in-scope mutations');
assert.throws(() => getCasesPreview({
  mode: 'diff-e2e',
  projectPath: gitFixture,
  pathScope: { selectedPaths: [] }
}), err => {
  return err instanceof PathScopeValidationError && err.statusCode === 400 && err.code === 'EMPTY_PATH_SCOPE';
}, 'Preview must throw PathScopeValidationError with EMPTY_PATH_SCOPE when 0 files match');

// 11. HistoryManager Baseline 隔離與 metadata 保存驗證
const scopedHistoryManager = new HistoryManager(gitFixture);
const scopeHash = scope1.hash;
const isolatedTarget = `diff-scope-${scopeHash}`;
const fakeReport = {
  result: { status: 'MEASURED', caseComparisons: [] },
  scorecard: { overallScore: 85 },
  scopeMetadata: scope1
};
const savedScoped = scopedHistoryManager.saveReport('diff-e2e', isolatedTarget, fakeReport);
assert(fs.existsSync(savedScoped.latestPath), 'Scoped baseline must be written');
const retrievedBaseline = scopedHistoryManager.getLatestBaseline('diff-e2e', isolatedTarget);
assert.strictEqual(retrievedBaseline.scopeMetadata.hash, scopeHash, 'Retrieved baseline must preserve scopeMetadata');
const allDiffBaseline = scopedHistoryManager.getLatestBaseline('diff-e2e', 'all-diffs');
assert.strictEqual(allDiffBaseline, null, 'Scoped baseline must not pollute all-diffs baseline');

// 12. Glob character class brackets [...] 支援與未支援語法拋錯測試
assert.strictEqual(DiffAnalyzer.matchesPattern('src/a.js', 'src/[a-z].js'), true, 'Character range [a-z] should match a.js');
assert.strictEqual(DiffAnalyzer.matchesPattern('src/1.js', 'src/[a-z].js'), false, 'Character range [a-z] should not match 1.js');
assert.strictEqual(DiffAnalyzer.matchesPattern('src/1.js', 'src/[!a-z].js'), true, 'Negated character range [!a-z] should match 1.js');
assert.strictEqual(DiffAnalyzer.matchesPattern('src/a.js', 'src/[^a-z].js'), false, 'Negated character range [^a-z] should not match a.js');
assert.throws(() => gitAnalyzer.getDiff('all', { includePatterns: ['src/[a-z.js'] }), err => {
  return err instanceof PathScopeValidationError && err.statusCode === 400 && /unclosed/i.test(err.message);
}, 'Unclosed bracket should throw PathScopeValidationError');
assert.throws(() => gitAnalyzer.getDiff('all', { includePatterns: ['src/{a,b}.js'] }), err => {
  return err instanceof PathScopeValidationError && err.statusCode === 400 && /brace expansion/i.test(err.message);
}, 'Brace expansion should throw PathScopeValidationError');

// 13. ProjectSourceAnalyzer 專案檔案範圍列舉、安全防護與變異提取測試
const projectAnalyzer = new ProjectSourceAnalyzer(gitFixture);
const projFiles = projectAnalyzer.getProjectFiles();
assert(projFiles.summary.totalFiles >= 4, 'Project analyzer should find files in git repo');
const mutableFilePaths = projFiles.files.filter(f => f.isMutable).map(f => f.filePath);
assert(mutableFilePaths.includes('src/core/a.js'), 'src/core/a.js should be mutable');
assert(!mutableFilePaths.includes('tests/a.spec.js'), 'tests/a.spec.js should not be mutable');

const allProjectMutations = projectAnalyzer.getProjectMutations();
assert(allProjectMutations.mutations.length > 0, 'Should extract mutations from project files');
assert(allProjectMutations.mutations.every(m => typeof m.lineNumber === 'number' && m.lineNumber > 0), 'Every project mutation must have a positive 1-based lineNumber');

const legacyJsxPath = path.join(gitFixture, 'src', 'core', 'legacy-page.js');
fs.writeFileSync(legacyJsxPath, `${Array.from({ length: 1100 }, () => 'const view = <Panel />;').join('\n')}\nif (enabled === true) run();\n`);
const legacyJsxMutations = projectAnalyzer.getProjectMutations({ selectedPaths: ['src/core/legacy-page.js'] });
assert.strictEqual(legacyJsxMutations.files.length, 1, 'Large legacy JSX scope should remain limited to the selected file');
assert.strictEqual(legacyJsxMutations.mutations.length, 2, 'JSX delimiters in .js files must not count toward the mutation limit');

// 測試預覽模式 (sourceMode: 'project')
const projectPreview = getCasesPreview({
  mode: 'diff-e2e',
  projectPath: gitFixture,
  sourceMode: 'project',
  pathScope: { selectedPaths: ['src/core/a.js'] }
});
assert.strictEqual(projectPreview.matchedFiles.length, 1, 'Project preview should match 1 file');
assert.strictEqual(projectPreview.sourceMode, 'project', 'Preview sourceMode must be project');
assert(projectPreview.plannedCases[2].input.includes(':2'), 'Planned case should show real lineNumber');

// 14. 測試非 Git 目錄之 fs walker fallback 與黑名單、symlink 略過
const nonGitFixture = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-nongit-'));
fs.mkdirSync(path.join(nonGitFixture, 'src', 'utils'), { recursive: true });
fs.mkdirSync(path.join(nonGitFixture, 'node_modules', 'pkg'), { recursive: true });
fs.mkdirSync(path.join(nonGitFixture, '.gitnexus'), { recursive: true });
fs.writeFileSync(path.join(nonGitFixture, 'src', 'utils', 'calc.js'), 'function calc(x) {\n  if (x === 1) return true;\n  return false;\n}\nmodule.exports = { calc };\n');
fs.writeFileSync(path.join(nonGitFixture, 'node_modules', 'pkg', 'index.js'), 'module.exports = true;\n');
fs.writeFileSync(path.join(nonGitFixture, '.gitnexus', 'meta.json'), '{}');

const nonGitAnalyzer = new ProjectSourceAnalyzer(nonGitFixture);
const nonGitResult = nonGitAnalyzer.getProjectMutations();
assert.strictEqual(nonGitResult.files.length, 1, 'fs walker must ignore node_modules and .gitnexus');
assert.strictEqual(nonGitResult.files[0].filePath, 'src/utils/calc.js');
assert.strictEqual(nonGitResult.mutations.length, 3, 'calc.js should yield 3 mutations (===, true, false)');
assert.strictEqual(nonGitResult.mutations[0].lineNumber, 2, 'First mutation should be on line 2');

// 15. 測試單檔 > 1MB 拋錯 (FILE_TOO_LARGE)
const largeFilePath = path.join(nonGitFixture, 'src', 'utils', 'large.js');
const largeBuf = Buffer.alloc(1024 * 1024 + 100, 'a = 1;\n');
fs.writeFileSync(largeFilePath, largeBuf);
assert.throws(() => nonGitAnalyzer.getProjectMutations({ selectedPaths: ['src/utils/large.js'] }), err => {
  return err instanceof PathScopeValidationError && err.statusCode === 400 && err.code === 'FILE_TOO_LARGE';
}, 'Files exceeding 1MB must throw FILE_TOO_LARGE 400 error');
fs.unlinkSync(largeFilePath);

// 16. 測試 DiffE2ERunner 多處相同 originalLine 且帶 lineNumber 之精準替換
const duplicateFixture = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-dup-'));
fs.writeFileSync(path.join(duplicateFixture, 'package.json'), JSON.stringify({ scripts: { test: 'node test.js' } }));
// 檔案中第 2 行與第 4 行皆為相同內容 "  if (a === 1) return 10;"
const dupContent = 'function test(a) {\n  if (a === 1) return 10;\n  let b = 2;\n  if (a === 1) return 10;\n  return 0;\n}\nmodule.exports = { test };\n';
fs.writeFileSync(path.join(duplicateFixture, 'index.js'), dupContent);
fs.writeFileSync(path.join(duplicateFixture, 'test.js'), 'const { test } = require("./index");\nconst assert = require("assert");\nassert.strictEqual(test(1), 10);\nassert.strictEqual(test(2), 0);\n');

const dupRunner = new DiffE2ERunner(duplicateFixture);
// 若無 lineNumber，命中 2 次會被拒絕為 INVALID
const evalNoLineNumber = dupRunner.evaluateMutation({
  filePath: 'index.js',
  originalLine: '  if (a === 1) return 10;',
  mutatedLine: '  if (a !== 1) return 10;',
  type: 'Invert equality'
}, 'node test.js', 5000);
assert.strictEqual(evalNoLineNumber.status, 'INVALID', 'Duplicate line without lineNumber must be rejected');

// 若有精確 lineNumber: 2，成功替換第 2 行並被測試擊殺 (KILLED)
const evalWithLineNumber = dupRunner.evaluateMutation({
  filePath: 'index.js',
  lineNumber: 2,
  originalLine: '  if (a === 1) return 10;',
  mutatedLine: '  if (a !== 1) return 10;',
  type: 'Invert equality'
}, 'node test.js', 5000);
assert.strictEqual(evalWithLineNumber.status, 'KILLED', 'Accurate line replacement by lineNumber must succeed and be killed');
assert.strictEqual(fs.readFileSync(path.join(duplicateFixture, 'index.js'), 'utf8'), dupContent, 'Original file must be restored after evaluation');

fs.rmSync(duplicateFixture, { recursive: true, force: true });
fs.rmSync(nonGitFixture, { recursive: true, force: true });

fs.rmSync(gitFixture, { recursive: true, force: true });
console.log('   ✅ Diff E2E Runner and Path Scoped Selection verified with git pathspecs, security barriers, and baseline isolation.');

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
const referencedTargetFixture = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-harness-reference-'));
fs.mkdirSync(path.join(referencedTargetFixture, 'env'));
fs.writeFileSync(path.join(referencedTargetFixture, 'env', 'sit.env'), 'REQUIRED_VALUE=true\n');
fs.writeFileSync(path.join(referencedTargetFixture, 'package.json'), JSON.stringify({ scripts: { 'build-sit': 'node -e "require(\'fs\').accessSync(\'env/sit.env\')" -f env/sit.env' } }));
const referencedTargetAuditor = new HarnessAuditor(referencedTargetFixture);
const referencedFault = referencedTargetAuditor.runFaultInjectionCheck('npm run build-sit');
assert(referencedFault.passed === true, 'A package script referenced config should be a measurable fault target');
assert(referencedFault.targetFile === 'env/sit.env', 'Fault evidence should identify the referenced config file');
assert(fs.readFileSync(path.join(referencedTargetFixture, 'env', 'sit.env'), 'utf8') === 'REQUIRED_VALUE=true\n', 'Referenced config must be restored after fault injection');
fs.rmSync(referencedTargetFixture, { recursive: true, force: true });
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
const diffRemediation = buildRemediationPlan({
  mode: 'diff-e2e',
  projectPath: '/tmp/sample-project',
  report: { result: evalResult, scorecard }
});
assert(diffRemediation.actions.some(action => action.title.includes('存活變異')), 'Low mutation score should produce an assertion remediation action');
assert(diffRemediation.aiPrompt.includes('不得捏造'), 'AI remediation prompt must prohibit fabricated evidence');
const locatedDiffRemediation = buildRemediationPlan({
  mode: 'diff-e2e',
  projectPath: '/tmp/sample-project',
  report: {
    result: {
      status: 'MEASURED',
      silentErrorsCaught: [],
      caseComparisons: [{
        id: 'DIFF-TC-02',
        status: 'FAIL',
        delta: '變異後測試仍通過。',
        mutation: { filePath: 'src/example.js', originalLine: 'enabled === true', mutatedLine: 'enabled !== true' }
      }]
    },
    scorecard: { overallScore: 72, metrics: { mutationKillRate: 27 }, evidence: { runtimeSafety: 'MEASURED' } }
  }
});
assert(locatedDiffRemediation.aiPrompt.includes('檔案: src/example.js'), 'Diff remediation prompt should identify the mutation file');
assert(locatedDiffRemediation.aiPrompt.includes('原始內容: enabled === true'), 'Diff remediation prompt should include original code');
assert(locatedDiffRemediation.aiPrompt.includes('變異內容: enabled !== true'), 'Diff remediation prompt should include mutated code');
assert(locatedDiffRemediation.aiPrompt.includes('不得直接修改 .test-eval/diff-probes/'), 'Diff remediation prompt should protect ephemeral probes');
const failedBaselineRemediation = buildRemediationPlan({
  mode: 'diff-e2e',
  projectPath: '/tmp/sample-project',
  report: {
    sourceMode: 'project',
    result: {
      status: 'INCONCLUSIVE',
      reason: '基線測試未通過，變異結果不具判定效力。',
      baselinePassed: false,
      baselineEvidence: { command: 'npm test', exitCode: 1, stdout: '', stderr: 'existing failure' },
      caseComparisons: []
    },
    scorecard: { overallScore: null, metrics: { mutationKillRate: null }, evidence: { runtimeSafety: 'NOT_MEASURED' } }
  }
});
assert(failedBaselineRemediation.actions.some(action => action.title.includes('測試命令')), 'Baseline remediation should identify command configuration before blaming product code');
assert(failedBaselineRemediation.aiPrompt.includes('命令：npm test'), 'Baseline remediation should preserve the actual failed command');
assert(!failedBaselineRemediation.aiPrompt.includes('列出的存活變異應被擊殺'), 'No survived mutation instruction should be emitted without survived mutations');
const failedCommandFixture = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-failed-command-'));
fs.writeFileSync(path.join(failedCommandFixture, 'package.json'), JSON.stringify({ scripts: { test: 'node -e "process.exit(1)"' } }));
const failedCommandResult = new DiffE2ERunner(failedCommandFixture).runEvaluation({
  sourceMode: 'project',
  mutations: [{ filePath: 'missing.js', originalLine: 'true', mutatedLine: 'false' }]
});
assert.strictEqual(failedCommandResult.status, 'INCONCLUSIVE', 'Failed baseline should remain inconclusive');
assert.strictEqual(failedCommandResult.baselineEvidence.command, 'npm run test', 'Failed baseline evidence must preserve the selected command');
assert.strictEqual(failedCommandResult.reasonCode, 'TEST_BASELINE_FAILED', 'Failed baseline should expose a stable reason code');
fs.rmSync(failedCommandFixture, { recursive: true, force: true });
const harnessRemediation = buildRemediationPlan({
  mode: 'harness-eval',
  projectPath: harnessFixture,
  report: {
    status: 'UNHEALTHY',
    harnessScript: 'npm run harness:check',
    checks: [{ name: 'Fault Sensitivity', passed: false, detail: 'Corruption returned exit code 0' }]
  }
});
assert(harnessRemediation.actions.some(action => action.title.includes('退出碼')), 'Harness false positive should produce an exit-code remediation action');
assert(harnessRemediation.aiPrompt.includes('npm run harness:check'), 'Harness remediation prompt should include the measured verification command');
const healthyRemediation = buildRemediationPlan({
  mode: 'diff-e2e',
  projectPath: '/tmp/sample-project',
  report: {
    result: { status: 'MEASURED', silentErrorsCaught: [], caseComparisons: [] },
    scorecard: { overallScore: 100, metrics: { mutationKillRate: 100 }, evidence: { runtimeSafety: 'MEASURED' } }
  }
});
assert(healthyRemediation.severity === 'NONE', 'Healthy measured results should have no remediation severity');
assert(healthyRemediation.required === false, 'Healthy measured results should not require remediation');
assert(healthyRemediation.actions.length === 0 && healthyRemediation.aiPrompt === null, 'Healthy measured results should not generate a generic AI prompt');
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
