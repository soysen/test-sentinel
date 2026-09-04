#!/usr/bin/env node

/**
 * watch-gate.js - 零 Token 哨兵喚醒門禁 (Reactive Wakeup Gate)
 * 監聽專案檔案變更，在偵測到代碼異動時發送喚醒訊號並退出 (exit 0)，
 * 讓外部 Desktop AI (Antigravity / Cursor / Claude) 接收完成事件並喚醒開工。
 */

const path = require('path');
const { ProjectWatcher } = require('../core/watcher');

const targetDir = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();

console.log(`[SENTINEL_GATE_ARMED] 正在守候專案異動 (0 Token 開銷): ${targetDir}`);

const watcher = new ProjectWatcher(targetDir, { debounceMs: 1000 });

watcher.on('change', event => {
  console.log(`\n[WAKEUP_TRIGGERED] 偵測到檔案變更: ${event.filename} (${event.eventType})`);
  watcher.stop();
  process.exit(0);
});

watcher.on('error', err => {
  console.error('[SENTINEL_GATE_ERROR]', err);
  process.exit(1);
});

watcher.start();
