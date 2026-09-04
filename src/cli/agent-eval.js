#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { AgentEvalQueue } = require('../core/agent-eval-queue');

const [command = 'help', projectArg = process.cwd(), jobId, resultFile] = process.argv.slice(2);
const projectPath = path.resolve(projectArg);
const queue = new AgentEvalQueue(projectPath);

function printWakeup(marker, request) {
  console.log(`[${marker}] Agent evaluation job: ${request.jobId}`);
  console.log(`[AGENT_EVAL_PROJECT] ${request.projectPath}`);
  console.log(`[AGENT_EVAL_REQUEST] ${queue.requestPath(request.jobId)}`);
  console.log(`[AGENT_EVAL_NEXT] node ${__filename} next ${JSON.stringify(projectPath)}`);
}

function watch() {
  const immediate = queue.getNext();
  if (immediate) {
    printWakeup('AGENT_EVAL_WAKEUP_IMMEDIATE', immediate);
    process.exit(0);
  }

  console.log(`[AGENT_EVAL_WATCHING] ${queue.jobsDir}`);
  let debounceTimer = null;
  const watcher = fs.watch(queue.jobsDir, () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const request = queue.getNext();
      if (!request) return;
      printWakeup('AGENT_EVAL_WAKEUP_TRIGGERED', request);
      watcher.close();
      process.exit(0);
    }, 150);
  });

  const close = () => {
    watcher.close();
    process.exit(0);
  };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}

if (command === 'watch') {
  watch();
} else if (command === 'next') {
  const request = queue.getNext();
  if (!request) {
    console.log('[AGENT_EVAL_EMPTY] No pending agent evaluation jobs.');
    process.exit(2);
  }
  console.log(JSON.stringify(request, null, 2));
  console.log('\n[AGENT_EVAL_ACTION] Evaluate every case, write the result JSON, then run:');
  console.log(`node ${__filename} complete ${JSON.stringify(projectPath)} ${request.jobId} <result.json>`);
} else if (command === 'complete') {
  if (!jobId || !resultFile) {
    console.error('Usage: agent-eval complete <project> <jobId> <result.json>');
    process.exit(2);
  }
  const payload = JSON.parse(fs.readFileSync(path.resolve(resultFile), 'utf8'));
  const result = queue.submit(jobId, payload);
  console.log(`[AGENT_EVAL_COMPLETED] ${result.jobId}`);
  console.log(queue.resultPath(result.jobId));
} else if (command === 'status') {
  if (!jobId) {
    console.error('Usage: agent-eval status <project> <jobId>');
    process.exit(2);
  }
  const status = queue.getStatus(jobId);
  if (!status) process.exit(3);
  console.log(JSON.stringify(status, null, 2));
} else {
  console.log(`Usage:
  agent-eval watch <project>
  agent-eval next <project>
  agent-eval complete <project> <jobId> <result.json>
  agent-eval status <project> <jobId>`);
}