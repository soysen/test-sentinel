/**
 * history.js - 評測歷史與基準比對路由處理器
 * 提供歷史紀錄清單、個別詳細內容檢視、以及與 Baseline 之 Diff 計算
 */

const path = require('path');
const { HistoryManager } = require('../../core/history-manager');

function handleHistoryRoutes(req, res, parsedUrl, readJsonBody, jsonResponse) {
  const pathname = parsedUrl.pathname;
  if (!pathname.startsWith('/api/history')) {
    return false;
  }

  const projectPath = parsedUrl.searchParams.get('project') || process.cwd();
  const historyMgr = new HistoryManager(projectPath);
  const mode = parsedUrl.searchParams.get('mode') || 'generic';
  const target = parsedUrl.searchParams.get('target') || 'default';
  const recordId = parsedUrl.searchParams.get('id');

  // 0. GET /api/history/all - 取得專案全域歷史紀錄
  if (pathname === '/api/history/all' && req.method === 'GET') {
    try {
      const allList = historyMgr.getAllHistory();
      jsonResponse({ project: projectPath, history: allList });
    } catch (e) {
      jsonResponse({ error: e.message }, 500);
    }
    return true;
  }

  // 1. GET /api/history - 取得指定目標的歷史紀錄列表
  if (pathname === '/api/history' && req.method === 'GET') {
    try {
      const list = historyMgr.getHistoryList(mode, target);
      const baseline = historyMgr.getLatestBaseline(mode, target);
      jsonResponse({
        mode,
        target,
        hasBaseline: !!baseline,
        baselineTime: baseline?.savedAt || null,
        history: list
      });
    } catch (e) {
      jsonResponse({ error: e.message }, 500);
    }
    return true;
  }

  // 2. GET /api/history/detail - 取得指定紀錄之詳細內容
  if (pathname === '/api/history/detail' && req.method === 'GET') {
    if (!recordId) {
      jsonResponse({ error: 'Missing record id' }, 400);
      return true;
    }
    try {
      const report = historyMgr.getReportById(mode, target, recordId);
      if (!report) {
        jsonResponse({ error: 'Report not found' }, 404);
      } else {
        jsonResponse(report);
      }
    } catch (e) {
      jsonResponse({ error: e.message }, 500);
    }
    return true;
  }

  // 3. GET /api/history/diff - 與最新基準進行差異計算
  if (pathname === '/api/history/diff' && req.method === 'GET') {
    try {
      let currentReport = null;
      if (recordId) {
        currentReport = historyMgr.getReportById(mode, target, recordId);
      }
      const baselineReport = historyMgr.getLatestBaseline(mode, target);

      if (!baselineReport) {
        jsonResponse({ hasBaseline: false, diff: null });
        return true;
      }

      const diff = historyMgr.computeDiff(currentReport || baselineReport, baselineReport);
      jsonResponse({
        hasBaseline: true,
        diff,
        baseline: {
          savedAt: baselineReport.savedAt,
          overallScore: historyMgr.extractScore(baselineReport),
          totalTokens: historyMgr.extractTokens(baselineReport)
        }
      });
    } catch (e) {
      jsonResponse({ error: e.message }, 500);
    }
    return true;
  }

  jsonResponse({ error: `Unsupported history endpoint: ${pathname}` }, 404);
  return true;
}

module.exports = { handleHistoryRoutes };
