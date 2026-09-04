const { parentPort, workerData } = require('worker_threads');

const { DiffE2ERunner } = require('../core/modes/diff-e2e-runner');
const { HarnessAuditor } = require('../core/modes/harness-auditor');

function reportProgress(progress) {
  parentPort.postMessage({ type: 'progress', progress });
}

try {
  const { mode, projectPath, options } = workerData;
  let result;

  if (mode === 'diff-e2e') {
    result = new DiffE2ERunner(projectPath).runEvaluation({
      ...options,
      onProgress: reportProgress
    });
  } else if (mode === 'harness-eval') {
    result = new HarnessAuditor(projectPath).auditHarness(options.customCommand || null, {
      faultTarget: options.faultTarget || null,
      onProgress: reportProgress
    });
  } else {
    throw new Error(`Unsupported evaluation worker mode: ${mode}`);
  }

  parentPort.postMessage({ type: 'result', result });
} catch (error) {
  parentPort.postMessage({
    type: 'error',
    error: error instanceof Error ? error.message : String(error)
  });
}