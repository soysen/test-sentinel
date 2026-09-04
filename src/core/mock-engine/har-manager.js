/**
 * har-manager.js - [解法 1] Playwright HAR 與 Mock 快照管理器
 * 負責將自癒成功的 Mock 或 HAR 檔案固化留存，並產出 Playwright Interception 代碼
 */

const fs = require('fs');
const path = require('path');

class HarMockManager {
  constructor(projectPath) {
    this.projectPath = path.resolve(projectPath);
    this.mockDir = path.join(this.projectPath, '.test-eval', 'mocks');
    this.ensureDir();
  }

  ensureDir() {
    if (!fs.existsSync(this.mockDir)) {
      fs.mkdirSync(this.mockDir, { recursive: true });
    }
  }

  /**
   * 儲存已通過驗證的 Mock JSON 快照
   */
  saveSnapshot(name, mockData) {
    this.ensureDir();
    const cleanName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(this.mockDir, `${cleanName}.json`);
    fs.writeFileSync(filePath, JSON.stringify(mockData, null, 2), 'utf8');
    return filePath;
  }

  /**
   * 讀取快照
   */
  loadSnapshot(name) {
    const cleanName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(this.mockDir, `${cleanName}.json`);
    if (fs.existsSync(filePath)) {
      try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  /**
   * 產生可直接貼進 Playwright 的 Mock 路由攔截程式碼片段
   */
  generatePlaywrightRouteCode(urlPattern = '**/api/**', mockData) {
    const jsonStr = JSON.stringify(mockData, null, 2);
    return `
// [Test-Sentinel Auto-Generated Mock Route]
await page.route('${urlPattern}', async route => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(${jsonStr})
  });
});
`.trim();
  }
}

module.exports = { HarMockManager };
