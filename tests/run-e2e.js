const fs = require('fs');
const net = require('net');
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

function reserveAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function main() {
  const e2ePort = await reserveAvailablePort();
  const execution = spawnSync(process.execPath, [cliPath, 'test', ...testTargets], {
    cwd: rootDir,
    env: { ...process.env, TEST_SENTINEL_E2E_PORT: String(e2ePort) },
    stdio: 'inherit'
  });

  if (execution.error) throw execution.error;
  process.exitCode = execution.status ?? 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});