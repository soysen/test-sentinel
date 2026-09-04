/**
 * watcher.js - 零 Token 原生檔案變更監聽器 (FSEvents Sentinel)
 * 監聽目標專案原始碼異動，自動防抖並過濾暫存目錄，防止觸發無限迴圈
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

class ProjectWatcher extends EventEmitter {
  constructor(targetDir, options = {}) {
    super();
    this.targetDir = path.resolve(targetDir);
    this.debounceMs = options.debounceMs || 800;
    this.timer = null;
    this.watcher = null;
    this.active = false;
  }

  start() {
    if (this.active) return;
    if (!fs.existsSync(this.targetDir)) {
      throw new Error(`Target directory does not exist: ${this.targetDir}`);
    }

    this.active = true;
    try {
      // 使用 macOS 原生 FSEvents (Node.js 原生 fs.watch recursive)
      this.watcher = fs.watch(this.targetDir, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        if (this.shouldIgnore(filename)) return;

        this.scheduleTrigger(eventType, filename);
      });
      this.emit('started', { targetDir: this.targetDir });
    } catch (e) {
      this.emit('error', e);
    }
  }

  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.active = false;
    this.emit('stopped');
  }

  shouldIgnore(filename) {
    const normalized = filename.replace(/\\/g, '/');
    const ignorePatterns = [
      /\.git\//,
      /node_modules\//,
      /\.test-eval\//,
      /\.DS_Store/,
      /dist\//,
      /build\//,
      /\.cache\//,
      /\.gitnexus\//
    ];

    return ignorePatterns.some(pattern => pattern.test(normalized));
  }

  scheduleTrigger(eventType, filename) {
    if (this.timer) clearTimeout(this.timer);

    this.timer = setTimeout(() => {
      this.emit('change', {
        eventType,
        filename,
        fullPath: path.join(this.targetDir, filename),
        timestamp: new Date().toISOString()
      });
    }, this.debounceMs);
  }
}

module.exports = { ProjectWatcher };
