const path = require('path');
const { Worker } = require('worker_threads');

function runEvaluationWorker(mode, projectPath, options = {}, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'evaluation-worker.js'), {
      workerData: { mode, projectPath, options }
    });
    let settled = false;

    const resolveOnce = result => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const rejectOnce = error => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    worker.on('message', message => {
      if (message.type === 'progress') {
        onProgress(message.progress);
      } else if (message.type === 'result') {
        resolveOnce(message.result);
      } else if (message.type === 'error') {
        rejectOnce(new Error(message.error));
      }
    });
    worker.on('error', rejectOnce);
    worker.on('exit', code => {
      if (!settled && code !== 0) {
        rejectOnce(new Error(`Evaluation worker exited with code ${code}`));
      }
    });
  });
}

module.exports = { runEvaluationWorker };