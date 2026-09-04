const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { runEvaluationWorker } = require('../src/server/evaluation-runner');

async function main() {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-sentinel-worker-'));
  const sourcePath = path.join(fixtureDir, 'feature.js');
  const checkPath = path.join(fixtureDir, 'check.js');
  const originalLine = 'module.exports = true;';

  try {
    fs.writeFileSync(sourcePath, `${originalLine}\n`, 'utf8');
    fs.writeFileSync(checkPath, [
      "const featureEnabled = require('./feature');",
      "if (!featureEnabled) process.exit(1);"
    ].join('\n'), 'utf8');

    const progressEvents = [];
    const result = await runEvaluationWorker('diff-e2e', fixtureDir, {
      testCommand: 'node check.js',
      timeoutMs: 5000,
      mutations: [{
        filePath: sourcePath,
        originalLine,
        mutatedLine: 'module.exports = false;'
      }]
    }, progress => progressEvents.push(progress));

    assert.strictEqual(result.status, 'MEASURED');
    assert.strictEqual(result.mutationResults.killedCount, 1);
    assert(progressEvents.some(event => event.phase === 'baseline'));
    assert(progressEvents.some(event => event.phase === 'complete'));
    assert.strictEqual(fs.readFileSync(sourcePath, 'utf8'), `${originalLine}\n`);

    await assert.rejects(
      runEvaluationWorker('unsupported-mode', fixtureDir),
      /Unsupported evaluation worker mode/
    );

    console.log('Worker integration: PASS');
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});