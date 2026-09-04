/**
 * app.js - Test Sentinel 本地服務端
 * 提供 Web Dashboard 與 REST API + SSE (Server-Sent Events) 即時監聽
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const { ProjectScanner } = require('../core/scanner');
const { GitNexusBridge } = require('../core/gitnexus');
const { DiffAnalyzer } = require('../core/diff-analyzer');
const { AstMockExtractor } = require('../core/mock-engine/ast-extractor');
const { MockErrorHealer } = require('../core/mock-engine/error-healer');
const { HarMockManager } = require('../core/mock-engine/har-manager');
const { DiffE2ERunner } = require('../core/modes/diff-e2e-runner');
const { SkillEvaluator } = require('../core/modes/skill-evaluator');
const { HarnessAuditor } = require('../core/modes/harness-auditor');
const { QualityScorer } = require('../core/scorer');
const { ProjectWatcher } = require('../core/watcher');

const PORT = process.env.PORT || 3890;
const PROJECTS_BASE = path.join(process.env.HOME || '/Users/nelsonchung', 'projects');

// 儲存目前監聽中的專案
let activeWatcher = null;
const sseClients = new Set();

function sendSse(event, data) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    res.write(message);
  }
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // SSE 即時推送端點
  if (pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write('event: connected\ndata: {"status":"connected"}\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // JSON Body 輔助函式
  const readJsonBody = callback => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = body ? JSON.parse(body) : {};
        callback(null, data);
      } catch (err) {
        callback(err);
      }
    });
  };

  const jsonResponse = (data, statusCode = 200) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data, null, 2));
  };

  // API 路由
  if (pathname === '/api/projects/list' && req.method === 'GET') {
    try {
      const items = fs.readdirSync(PROJECTS_BASE);
      const projectList = items
        .filter(f => !f.startsWith('.'))
        .map(f => {
          const fullPath = path.join(PROJECTS_BASE, f);
          const isDir = fs.statSync(fullPath).isDirectory();
          return isDir ? { name: f, path: fullPath } : null;
        })
        .filter(Boolean);
      return jsonResponse(projectList);
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (pathname === '/api/projects/scan' && req.method === 'POST') {
    return readJsonBody((err, body) => {
      if (err) return jsonResponse({ error: 'Invalid JSON' }, 400);
      try {
        const targetPath = body.projectPath || PROJECTS_BASE;
        const scanner = new ProjectScanner(targetPath);
        const profile = scanner.scan();

        // 切換 Watcher 監聽目標專案
        if (activeWatcher) activeWatcher.stop();
        activeWatcher = new ProjectWatcher(targetPath);
        activeWatcher.on('change', event => {
          sendSse('project_change', event);
        });
        activeWatcher.start();

        return jsonResponse(profile);
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    });
  }

  if (pathname === '/api/inspect/gitnexus' && req.method === 'POST') {
    return readJsonBody((err, body) => {
      try {
        const bridge = new GitNexusBridge(body.projectPath);
        const changes = bridge.detectChangedSymbols(body.scope || 'unstaged');

        let impact = null;
        if (changes.changedSymbols && changes.changedSymbols.length > 0) {
          const firstTarget = changes.changedSymbols[0].split(' ')[0];
          impact = bridge.analyzeImpact(firstTarget, { direction: 'upstream' });
        }

        return jsonResponse({ changes, impact });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    });
  }

  if (pathname === '/api/inspect/diff' && req.method === 'POST') {
    return readJsonBody((err, body) => {
      try {
        const analyzer = new DiffAnalyzer(body.projectPath);
        const diffData = analyzer.getDiff(body.scope || 'all');
        return jsonResponse(diffData);
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    });
  }

  // 模式 A: Diff E2E 跑測與變異打分
  if (pathname === '/api/run/diff-e2e' && req.method === 'POST') {
    return readJsonBody((err, body) => {
      try {
        const runner = new DiffE2ERunner(body.projectPath);
        const result = runner.runEvaluation(body);

        // 結合評分器
        const scorecard = QualityScorer.computeScorecard({
          diffSummary: body.diffSummary,
          impactData: body.impactData,
          e2eResult: result,
          mockData: body.mockData
        });

        return jsonResponse({ result, scorecard });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    });
  }

  // 模式 B: Skill 效益評測
  if (pathname === '/api/run/skill-eval' && req.method === 'POST') {
    return readJsonBody((err, body) => {
      try {
        const evaluator = new SkillEvaluator(body.projectPath);
        const report = evaluator.evaluateSkill(body.skillPath);
        return jsonResponse(report);
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    });
  }

  // 模式 C: Harness 健檢
  if (pathname === '/api/run/harness-eval' && req.method === 'POST') {
    return readJsonBody((err, body) => {
      try {
        const auditor = new HarnessAuditor(body.projectPath);
        const report = auditor.auditHarness(body.harnessScript || 'npm test');
        return jsonResponse(report);
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    });
  }

  // 2 -> 3 智慧 Mock 引擎端點
  if (pathname === '/api/mocks/ast-extract' && req.method === 'POST') {
    return readJsonBody((err, body) => {
      try {
        const extractor = new AstMockExtractor();
        const fullPaths = (body.files || []).map(f => path.resolve(body.projectPath, f));
        const schema = extractor.extractFromFiles(fullPaths);
        return jsonResponse({ schema });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    });
  }

  if (pathname === '/api/mocks/heal' && req.method === 'POST') {
    return readJsonBody((err, body) => {
      try {
        const healer = new MockErrorHealer();
        const result = healer.heal(body.currentMock, body.errorMessage);

        // 若要求固化存檔
        if (body.saveAs && result.healed) {
          const manager = new HarMockManager(body.projectPath);
          result.savedPath = manager.saveSnapshot(body.saveAs, result.mock);
        }

        return jsonResponse(result);
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    });
  }

  // 一鍵晉升測案
  if (pathname === '/api/probes/promote' && req.method === 'POST') {
    return readJsonBody((err, body) => {
      try {
        const runner = new DiffE2ERunner(body.projectPath);
        const resData = runner.promoteProbe(body.probeFile, body.destination);
        return jsonResponse(resData);
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    });
  }

  // 靜態檔案服務 (Web Dashboard)
  let filePath = path.join(__dirname, '..', 'web', pathname === '/' ? 'index.html' : pathname);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml'
    };
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`\n🛡️  Test Sentinel Server running at http://localhost:${PORT}`);
  console.log(`📁 Default Projects Root: ${PROJECTS_BASE}\n`);
});
