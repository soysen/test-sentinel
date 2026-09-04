/**
 * history-manager.js - 評測歷史持久化與基準對比引擎
 * 依「模式 (Mode) -> 目標對象/檔案 (Target) -> 時間戳紀錄」兩層分類歸檔
 * 嚴格遵循 Node.js 原生 API，零外部依賴
 */

const fs = require('fs');
const path = require('path');

class HistoryManager {
  constructor(projectPath) {
    this.projectPath = path.resolve(projectPath);
    this.baseDir = path.join(this.projectPath, '.test-eval', 'history');
  }

  /**
   * 將路徑、檔名或名稱轉化為乾淨安全的目錄 Slug
   */
  sanitizeSlug(target) {
    if (!target) return 'default';
    return String(target)
      .trim()
      .replace(/[\\/]/g, '_')
      .replace(/[^a-zA-Z0-9_\-\.]/g, '_')
      .replace(/_+/g, '_');
  }

  /**
   * 取得特定模式與目標的儲存目錄
   */
  getTargetDir(mode, targetName) {
    const modeDir = `mode-${mode || 'generic'}`;
    const targetSlug = this.sanitizeSlug(targetName);
    return path.join(this.baseDir, modeDir, targetSlug);
  }

  /**
   * 保存評測報告，並同步更新 latest.json 作為基準
   */
  saveReport(mode, targetName, reportData) {
    const targetDir = this.getTargetDir(mode, targetName);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const now = new Date();
    const timestampStr = now.toISOString().replace(/[:.]/g, '-');
    const filename = `${timestampStr}_eval.json`;
    const filePath = path.join(targetDir, filename);
    const latestPath = path.join(targetDir, 'latest.json');

    const enrichedData = {
      ...reportData,
      savedAt: now.toISOString(),
      mode,
      target: targetName || 'default',
      recordId: `${timestampStr}_eval`
    };

    const payload = JSON.stringify(enrichedData, null, 2);
    fs.writeFileSync(filePath, payload, 'utf8');
    fs.writeFileSync(latestPath, payload, 'utf8');

    return {
      filePath,
      latestPath,
      recordId: enrichedData.recordId,
      timestamp: enrichedData.savedAt
    };
  }

  /**
   * 取得指定模式與目標的最新基準報告
   */
  getLatestBaseline(mode, targetName) {
    const latestPath = path.join(this.getTargetDir(mode, targetName), 'latest.json');
    if (fs.existsSync(latestPath)) {
      try {
        return JSON.parse(fs.readFileSync(latestPath, 'utf8'));
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  /**
   * 取得特定歷史評測檔案內容
   */
  getReportById(mode, targetName, recordId) {
    const filename = recordId.endsWith('.json') ? recordId : `${recordId}.json`;
    const targetFile = path.join(this.getTargetDir(mode, targetName), filename);
    if (fs.existsSync(targetFile)) {
      try {
        return JSON.parse(fs.readFileSync(targetFile, 'utf8'));
      } catch (e) {
        return null;
      }
    }
    // 彈性後援：若傳入的 target 與實際目錄有些微差異，在該模式目錄下搜尋
    try {
      const modeDir = path.join(this.baseDir, `mode-${mode || 'generic'}`);
      if (fs.existsSync(modeDir)) {
        const subdirs = fs.readdirSync(modeDir);
        for (const sub of subdirs) {
          const candidate = path.join(modeDir, sub, filename);
          if (fs.existsSync(candidate)) {
            return JSON.parse(fs.readFileSync(candidate, 'utf8'));
          }
        }
      }
    } catch (err) {}
    return null;
  }

  extractScore(data) {
    if (!data) return null;
    const candidates = [
      data.overallScore,
      data.scorecard?.overallScore,
      data.metrics?.overallScore,
      data.healthScore
    ];
    const score = candidates.find(candidate => candidate !== undefined);
    return Number.isFinite(score) ? score : null;
  }

  extractTokens(data) {
    if (!data) return 0;
    return data.metrics?.totalTokens ?? data.scorecard?.metrics?.totalTokens ?? 0;
  }

  /**
   * 取得專案下所有模式與目標的歷史紀錄列表 (依照時間由新到舊排序)
   */
  getAllHistory() {
    if (!fs.existsSync(this.baseDir)) return [];
    const results = [];
    try {
      const modeDirs = fs.readdirSync(this.baseDir);
      for (const mDir of modeDirs) {
        if (!mDir.startsWith('mode-')) continue;
        const mode = mDir.replace(/^mode-/, '');
        const fullMDir = path.join(this.baseDir, mDir);
        if (!fs.statSync(fullMDir).isDirectory()) continue;

        const targetDirs = fs.readdirSync(fullMDir);
        for (const tDir of targetDirs) {
          const fullTDir = path.join(fullMDir, tDir);
          if (!fs.statSync(fullTDir).isDirectory()) continue;

          const files = fs.readdirSync(fullTDir)
            .filter(f => f.endsWith('.json') && f !== 'latest.json')
            .sort((a, b) => b.localeCompare(a));

          for (const file of files) {
            try {
              const content = JSON.parse(fs.readFileSync(path.join(fullTDir, file), 'utf8'));
              results.push({
                recordId: file.replace('.json', ''),
                mode,
                target: content.target || tDir,
                targetSlug: tDir,
                time: content.savedAt || content.timestamp,
                overallScore: this.extractScore(content),
                totalTokens: this.extractTokens(content),
                status: content.status || (this.extractScore(content) === null ? 'INCONCLUSIVE' : (this.extractScore(content) >= 80 ? 'PASSED' : 'NEEDS_ATTENTION'))
              });
            } catch (err) {}
          }
        }
      }
      return results.sort((a, b) => (b.time || '').localeCompare(a.time || ''));
    } catch (e) {
      return [];
    }
  }

  /**
   * 列出特定目標的所有歷史紀錄清單
   */
  getHistoryList(mode, targetName) {
    const targetDir = this.getTargetDir(mode, targetName);
    if (!fs.existsSync(targetDir)) {
      return [];
    }

    try {
      const files = fs.readdirSync(targetDir)
        .filter(f => f.endsWith('.json') && f !== 'latest.json')
        .sort((a, b) => b.localeCompare(a)); // 最新在前

      return files.map(filename => {
        const filePath = path.join(targetDir, filename);
        let summary = {
          recordId: filename.replace('.json', ''),
          filename,
          time: null,
          overallScore: null,
          status: null
        };

        try {
          const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          summary.time = content.savedAt || content.timestamp;
          summary.overallScore = this.extractScore(content);
          summary.status = content.status || (summary.overallScore === null ? 'INCONCLUSIVE' : (summary.overallScore >= 80 ? 'PASSED' : 'NEEDS_ATTENTION'));
          summary.totalTokens = this.extractTokens(content);
        } catch (err) {}

        return summary;
      });
    } catch (e) {
      return [];
    }
  }

  /**
   * 比對當前評測與歷史基準之間的 Delta 差異
   */
  computeDiff(current, baseline) {
    if (!current || !baseline) {
      return null;
    }

    const currentScore = this.extractScore(current);
    const baselineScore = this.extractScore(baseline);

    const currentTokens = this.extractTokens(current);
    const baselineTokens = this.extractTokens(baseline);

    const currentRecall = current.discriminationResult?.recallRate ?? current.metrics?.recall ?? null;
    const baselineRecall = baseline.discriminationResult?.recallRate ?? baseline.metrics?.recall ?? null;

    const currentPrecision = current.discriminationResult?.precisionRate ?? current.metrics?.precision ?? null;
    const baselinePrecision = baseline.discriminationResult?.precisionRate ?? baseline.metrics?.precision ?? null;

    const scoreDelta = currentScore === null || baselineScore === null ? null : currentScore - baselineScore;
    const tokensDelta = currentTokens - baselineTokens;
    const recallDelta = currentRecall === null || baselineRecall === null ? null : currentRecall - baselineRecall;
    const precisionDelta = currentPrecision === null || baselinePrecision === null ? null : currentPrecision - baselinePrecision;

    return {
      scoreDelta,
      tokensDelta,
      recallDelta,
      precisionDelta,
      scoreImproved: scoreDelta === null ? null : scoreDelta >= 0,
      tokensSaved: tokensDelta < 0,
      baselineTime: baseline.savedAt || baseline.timestamp
    };
  }
}

module.exports = { HistoryManager };
