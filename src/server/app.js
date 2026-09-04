const { getCasesPreview } = require("./routes/preview");
const { handleHistoryRoutes } = require("./routes/history");
const { HistoryManager } = require("../core/history-manager");
/**
 * app.js - Test Sentinel 本地服務端
 * 提供 Web Dashboard 與 REST API + SSE (Server-Sent Events) 即時監聽
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const os = require('os');
const { exec } = require('child_process');

const { ProjectScanner } = require('../core/scanner');
const { GitNexusBridge } = require('../core/gitnexus');
const { DiffAnalyzer } = require('../core/diff-analyzer');
const { AstMockExtractor } = require('../core/mock-engine/ast-extractor');
const { MockErrorHealer } = require('../core/mock-engine/error-healer');
const { HarMockManager } = require('../core/mock-engine/har-manager');
const { SkillEvaluator } = require('../core/modes/skill-evaluator');
const { QualityScorer } = require('../core/scorer');
const { ProjectWatcher } = require('../core/watcher');
const { AgentEvalQueue } = require('../core/agent-eval-queue');
const { runEvaluationWorker } = require('./evaluation-runner');

const PORT = process.env.PORT || 3890;
const PROJECTS_BASE = path.join(process.env.HOME || '/Users/nelsonchung', 'projects');

function resolveUserPath(inputPath) {
  if (!inputPath || typeof inputPath !== 'string') return process.cwd();
  let resolved = inputPath.trim();
  if (resolved.startsWith('~')) {
    const home = os.homedir() || process.env.HOME || process.env.USERPROFILE || '';
    resolved = path.join(home, resolved.slice(1));
  }
  return path.resolve(resolved);
}

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
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost:3890"}`);
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
    if (res.headersSent || res.writableEnded) return true;
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data, null, 2));
    return true;
  };

  // 測案預覽與目的解說端點 (Step 1: Preview)
  if (pathname === "/api/cases/preview" && req.method === "POST") {
    return readJsonBody((err, body) => {
      try {
        if (body.projectPath) {
          body.projectPath = resolveUserPath(body.projectPath);
        }
        const preview = getCasesPreview(body);
        return jsonResponse(preview);
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    });
  }

  // 歷史紀錄與 Baseline 對比 API 路由
  if (handleHistoryRoutes(req, res, parsedUrl, readJsonBody, jsonResponse)) {
    return;
  }

  // API 路由: 取得已知/推薦專案清單 (包含當前目錄與 PROJECTS_BASE)
  if (pathname === '/api/projects/list' && req.method === 'GET') {
    try {
      const projectList = [];
      const currentDir = process.cwd();
      projectList.push({ name: `${path.basename(currentDir)} (當前目錄)`, path: currentDir });

      if (fs.existsSync(PROJECTS_BASE)) {
        const items = fs.readdirSync(PROJECTS_BASE);
        items
          .filter(f => !f.startsWith('.'))
          .forEach(f => {
            const fullPath = path.join(PROJECTS_BASE, f);
            try {
              if (fs.statSync(fullPath).isDirectory() && fullPath !== currentDir) {
                projectList.push({ name: f, path: fullPath });
              }
            } catch {}
          });
      }
      return jsonResponse(projectList);
    } catch (e) {
      return jsonResponse([{ name: path.basename(process.cwd()), path: process.cwd() }]);
    }
  }

  // 系統目錄選取對話框 (支援 macOS / Windows / Linux)
  if (pathname === '/api/projects/choose-dialog' && req.method === 'POST') {
    if (process.platform === 'darwin') {
      exec(`osascript -e 'POSIX path of (choose folder with prompt "請選擇專案目錄")'`, (err, stdout, stderr) => {
        if (err) {
          if (stderr && (stderr.includes('User canceled') || stderr.includes('cancelled') || stderr.includes('-128'))) {
            return jsonResponse({ canceled: true });
          }
          return jsonResponse({ error: err.message || '無法開啟目錄選取視窗' }, 500);
        }
        const chosen = stdout.trim();
        return jsonResponse({ path: chosen });
      });
      return;
    } else if (process.platform === 'win32') {
      const psCmd = `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = '請選擇專案目錄'; if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $f.SelectedPath }"`;
      exec(psCmd, (err, stdout) => {
        if (err) return jsonResponse({ error: err.message }, 500);
        const chosen = stdout.trim();
        if (!chosen) return jsonResponse({ canceled: true });
        return jsonResponse({ path: chosen });
      });
      return;
    } else {
      exec(`zenity --file-selection --directory --title="請選擇專案目錄"`, (err, stdout) => {
        if (err) return jsonResponse({ canceled: true });
        const chosen = stdout.trim();
        return jsonResponse({ path: chosen });
      });
      return;
    }
  }

  if (pathname === '/api/projects/scan' && req.method === 'POST') {
    return readJsonBody((err, body) => {
      if (err) return jsonResponse({ error: 'Invalid JSON' }, 400);
      try {
        const rawPath = body.projectPath || process.cwd();
        const targetPath = resolveUserPath(rawPath);
        if (!fs.existsSync(targetPath)) {
          return jsonResponse({ error: `路徑不存在: ${targetPath}` }, 400);
        }
        if (!fs.statSync(targetPath).isDirectory()) {
          return jsonResponse({ error: `指定路徑非目錄: ${targetPath}` }, 400);
        }
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
        const projectPath = resolveUserPath(body.projectPath);
        const bridge = new GitNexusBridge(projectPath);
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
        const projectPath = resolveUserPath(body.projectPath);
        const analyzer = new DiffAnalyzer(projectPath);
        const diffData = analyzer.getDiff(body.scope || 'all');
        return jsonResponse(diffData);
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    });
  }

  if (pathname === '/api/agent-eval/status' && req.method === 'GET') {
    try {
      const rawProjectPath = parsedUrl.searchParams.get('projectPath');
      const jobId = parsedUrl.searchParams.get('jobId');
      if (!rawProjectPath || !jobId) {
        return jsonResponse({ error: 'projectPath and jobId are required' }, 400);
      }
      const projectPath = resolveUserPath(rawProjectPath);
      const status = new AgentEvalQueue(projectPath).getStatus(jobId);
      return status
        ? jsonResponse(status)
        : jsonResponse({ error: 'Agent evaluation job not found' }, 404);
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // 模式 A: Diff E2E 跑測與變異打分
  if (pathname === '/api/run/diff-e2e' && req.method === 'POST') {
    return readJsonBody(async (err, body) => {
      if (err) return jsonResponse({ error: 'Invalid JSON' }, 400);
      try {
        const projectPath = resolveUserPath(body.projectPath);
        const onProgress = progress => sendSse('evaluation_progress', {
          evaluationId: body.evaluationId || null,
          mode: 'diff-e2e',
          ...progress
        });
        const suppliedMutations = Array.isArray(body.mutations)
          ? body.mutations.filter(mutation => mutation.filePath && mutation.originalLine && mutation.mutatedLine)
          : [];
        const mutations = suppliedMutations.length > 0
          ? suppliedMutations
          : new DiffAnalyzer(projectPath).getDiff(body.scope || 'all').files.flatMap(file => file.mutationCandidates);
        const result = await runEvaluationWorker('diff-e2e', projectPath, {
          ...body,
          projectPath,
          mutations
        }, onProgress);

        // 結合評分器
        const scorecard = QualityScorer.computeScorecard({
          diffSummary: body.diffSummary,
          impactData: body.impactData,
          e2eResult: result,
          mockData: body.mockData
        });

        // 儲存至歷史紀錄並計算基準差異
        const historyMgr = new HistoryManager(projectPath || process.cwd());
        const targetName = body.targetFile ? path.basename(body.targetFile) : 'all-diffs';
        const baseline = historyMgr.getLatestBaseline('diff-e2e', targetName);
        const saved = historyMgr.saveReport('diff-e2e', targetName, { result, scorecard });
        const diff = historyMgr.computeDiff({ result, scorecard }, baseline);

        return jsonResponse({ result, scorecard, saved, diff, hasBaseline: !!baseline });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    });
  }

  // 模式 B: Skill 效益評測
  if (pathname === '/api/run/skill-eval' && req.method === 'POST') {
    return readJsonBody((err, body) => {
      try {
        const projectPath = resolveUserPath(body.projectPath);
        const cases = Array.isArray(body.cases) ? body.cases : [];
        const hasRouterObservations = cases.length > 0
          && cases.every(testCase => typeof testCase.triggered === 'boolean');
        if (!hasRouterObservations && body.agentEvaluation !== false) {
          const queue = new AgentEvalQueue(projectPath);
          const job = queue.createSkillJob({
            skillPath: body.skillPath,
            skillName: body.skillName,
            cases
          });
          sendSse('agent_eval_requested', {
            projectPath: projectPath,
            jobId: job.jobId,
            mode: job.mode
          });
          return jsonResponse({
            status: 'PENDING_AGENT',
            jobId: job.jobId,
            requestPath: queue.requestPath(job.jobId),
            message: '等待 Agent 實際執行並回寫觀測結果。'
          }, 202);
        }

        const evaluator = new SkillEvaluator(projectPath);
        const report = evaluator.evaluateSkill(body.skillPath, cases);

        // 儲存至歷史紀錄並計算基準差異
        const historyMgr = new HistoryManager(projectPath || process.cwd());
        let targetName = body.skillName;
        if (!targetName && body.skillPath) {
          const bName = path.basename(body.skillPath);
          if (bName.toLowerCase() === 'skill.md') {
            targetName = path.basename(path.dirname(body.skillPath));
          } else {
            targetName = bName.replace(/\.md$/i, '');
          }
        }
        targetName = targetName || 'skill';

        const baseline = historyMgr.getLatestBaseline('skill-eval', targetName);
        const saved = historyMgr.saveReport('skill-eval', targetName, report);
        const diff = historyMgr.computeDiff(report, baseline);

        return jsonResponse({ ...report, saved, diff, hasBaseline: !!baseline, targetName });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    });
  }

  // 模式 C: Harness 健檢
  if (pathname === '/api/run/harness-eval' && req.method === 'POST') {
    return readJsonBody(async (err, body) => {
      if (err) return jsonResponse({ error: 'Invalid JSON' }, 400);
      try {
        const projectPath = resolveUserPath(body.projectPath);
        const onProgress = progress => sendSse('evaluation_progress', {
          evaluationId: body.evaluationId || null,
          mode: 'harness-eval',
          ...progress
        });
        const report = await runEvaluationWorker('harness-eval', projectPath, {
          customCommand: body.harnessScript || null,
          faultTarget: body.faultTarget || null,
        }, onProgress);

        // 儲存至歷史紀錄並計算基準差異
        const historyMgr = new HistoryManager(projectPath || process.cwd());
        const targetName = (report.harnessScript || 'default_harness').replace(/[^a-zA-Z0-9_-]/g, '_');
        const baseline = historyMgr.getLatestBaseline('harness-eval', targetName);
        const saved = historyMgr.saveReport('harness-eval', targetName, report);
        const diff = historyMgr.computeDiff(report, baseline);

        return jsonResponse({ ...report, saved, diff, hasBaseline: !!baseline });
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

  // 防禦：若 Headers 已發送或 Response 已結束，直接返回
  if (res.headersSent || res.writableEnded) {
    return;
  }

  // 若以 /api/ 開頭但未被匹配，回傳 JSON 404，不得落入靜態檔案伺服器
  if (pathname.startsWith('/api/')) {
    return jsonResponse({ error: `API endpoint not found: ${pathname}` }, 404);
  }

  if (pathname === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
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
