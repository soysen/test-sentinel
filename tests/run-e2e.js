const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const probeDir = path.join(rootDir, '.test-eval', 'diff-probes');
const testTargets = ['tests/e2e'];
const recentThresholdMs = 60000;

if (fs.existsSync(probeDir)) {
  const recentProbe = fs.readdirSync(probeDir)
    .filter(name => name.endsWith('.spec.js'))
    .map(name => ({
      name,
      modifiedAt: fs.statSync(path.join(probeDir, name)).mtimeMs
    }))
    .filter(probe => Date.now() - probe.modifiedAt <= recentThresholdMs)
    .sort((left, right) => right.modifiedAt - left.modifiedAt)[0];

  if (recentProbe) {
    testTargets.push(path.join('.test-eval', 'diff-probes', recentProbe.name));
  }
}

const cliPath = require.resolve('@playwright/test/cli');
const execution = spawnSync(process.execPath, [cliPath, 'test', ...testTargets], {
  cwd: rootDir,
  env: process.env,
  stdio: 'inherit'
});

if (execution.error) throw execution.error;
process.exitCode = execution.status ?? 1;