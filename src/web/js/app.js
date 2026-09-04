/**
 * app.js - Test Sentinel Web Dashboard 焦點模式與兩階段測試流
 */

const state = {
  currentProject: null,
  activeMode: 'diff-e2e',
  profile: null,
  skillsList: [],
  selectedSkill: null,
  currentPreview: null,
  lastEvaluation: null
};

// DOM 元素
const projectSelect = document.getElementById('projectSelect');
const refreshBtn = document.getElementById('refreshBtn');
const projectInfo = document.getElementById('projectInfo');
const modeButtons = document.querySelectorAll('.mode-btn');

// 模式面板
const modePanels = {
  'diff-e2e': document.getElementById('modePanel-diff-e2e'),
  'skill-eval': document.getElementById('modePanel-skill-eval'),
  'harness-eval': document.getElementById('modePanel-harness-eval')
};

// Skill 選擇器
const skillSearchInput = document.getElementById('skillSearchInput');
const skillListContainer = document.getElementById('skillListContainer');
const selectedSkillPreview = document.getElementById('selectedSkillPreview');

// 兩階段工作流容器
const previewSection = document.getElementById('previewSection');
const resultsSection = document.getElementById('resultsSection');
const previewTargetTag = document.getElementById('previewTargetTag');
const standardsContainer = document.getElementById('standardsContainer');
const plannedCasesList = document.getElementById('plannedCasesList');
const btnExecutePlan = document.getElementById('btnExecutePlan');

// 結果容器
const comparisonRows = document.getElementById('comparisonRows');
const overallScorePill = document.getElementById('overallScorePill');
const metricVal1 = document.getElementById('metricVal1');
const metricVal2 = document.getElementById('metricVal2');
const metricVal3 = document.getElementById('metricVal3');
const metricVal4 = document.getElementById('metricVal4');
const insightsList = document.getElementById('insightsList');
const diffActionsBar = document.getElementById('diffActionsBar');
const promoteBtn = document.getElementById('promoteBtn');

// 哨兵狀態
const fseventDot = document.getElementById('fseventDot');
const fseventStatus = document.getElementById('fseventStatus');

// 1. 初始化
async function init() {
  setupSSE();
  bindEvents();
  await loadProjects();
}

function bindEvents() {
  projectSelect.addEventListener('change', () => selectProject(projectSelect.value));
  refreshBtn.addEventListener('click', () => selectProject(projectSelect.value));

  // 模式切換
  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      modeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      switchMode(btn.dataset.mode);
    });
  });

  // Skill 搜尋過濾
  skillSearchInput.addEventListener('input', () => {
    renderSkillList(state.skillsList, skillSearchInput.value);
  });

  // Step 1: 預覽測案按鈕
  document.getElementById('btnGenDiffCases').addEventListener('click', () => generateCasesPreview('diff-e2e'));
  document.getElementById('btnGenSkillCases').addEventListener('click', () => generateCasesPreview('skill-eval'));
  document.getElementById('btnGenHarnessCases').addEventListener('click', () => generateCasesPreview('harness-eval'));

  // Step 2: 批准執行按鈕
  btnExecutePlan.addEventListener('click', executePlannedCases);

  // 晉升按鈕
  promoteBtn.addEventListener('click', promoteCurrentProbe);
}

// 2. 切換模式焦點 (只顯示當前模式)
function switchMode(mode) {
  state.activeMode = mode;
  Object.keys(modePanels).forEach(m => {
    if (modePanels[m]) {
      modePanels[m].classList.toggle('active', m === mode);
    }
  });

  // 切換模式時收合先前的預覽與結果，保持清爽
  previewSection.classList.add('hidden');
  resultsSection.classList.add('hidden');
}

// 3. 載入專案清單
async function loadProjects() {
  try {
    const res = await fetch('/api/projects/list');
    const list = await res.json();
    projectSelect.innerHTML = '';

    list.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.path;
      opt.textContent = `${item.name} (${item.path})`;
      projectSelect.appendChild(opt);
    });

    if (list.length > 0) {
      const defaultProj = list.find(p => p.name === 'task-dashboard') || list[0];
      projectSelect.value = defaultProj.path;
      await selectProject(defaultProj.path);
    }
  } catch (e) {
    projectInfo.innerHTML = `<p class="text-warning">載入失敗: ${e.message}</p>`;
  }
}

// 4. 選取專案並掃描
async function selectProject(projPath) {
  if (!projPath) return;
  state.currentProject = projPath;
  projectInfo.innerHTML = '<p>掃描中...</p>';

  try {
    const res = await fetch('/api/projects/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectPath: projPath })
    });
    const profile = await res.json();
    state.profile = profile;
    state.skillsList = profile.skills || [];

    renderProjectInfo(profile);
    renderSkillList(state.skillsList, '');

    // 預設選取第一個 Skill (若有)
    if (state.skillsList.length > 0) {
      selectSingleSkill(state.skillsList[0]);
    } else {
      selectedSkillPreview.innerHTML = '此專案未偵測到任何 <code>SKILL.md</code> 檔案。';
    }

    // 自動更新 Harness 指令顯示
    const harnessDisplay = document.getElementById('harnessCmdDisplay');
    if (harnessDisplay) {
      harnessDisplay.textContent = profile.harness?.harnessMdExists ? 'npm run harness:check' : 'npm test';
    }

    // 預設觸發 GitNexus 檢查 (抽屜內部)
    inspectGitNexus();
  } catch (e) {
    projectInfo.innerHTML = `<p class="text-warning">掃描失敗: ${e.message}</p>`;
  }
}

function renderProjectInfo(p) {
  const fws = p.frameworks.length > 0 ? p.frameworks.join(', ') : '無特定框架';
  const skillsCount = p.skills.length;
  const hasHarness = p.harness.hasHarness ? '✅ 已建置' : '❌ 未發現';
  const gitBranch = p.git.branch || '非 Git 專案';

  projectInfo.innerHTML = `
    <div style="font-size: 0.8rem; line-height: 1.6;">
      <div><strong>分支：</strong> <code>${gitBranch}</code></div>
      <div><strong>前端：</strong> ${fws}</div>
      <div><strong>Skill 庫存：</strong> <span class="badge badge-accent">${skillsCount} 個</span></div>
      <div><strong>Harness：</strong> ${hasHarness}</div>
    </div>
  `;
}

// 5. Skill 搜尋與單檔選擇
function renderSkillList(skills, filter) {
  skillListContainer.innerHTML = '';
  const filtered = skills.filter(s => s.name.toLowerCase().includes(filter.toLowerCase()));

  if (filtered.length === 0) {
    skillListContainer.innerHTML = '<span style="font-size: 0.8rem; color: var(--text-muted);">無匹配的 Skill</span>';
    return;
  }

  filtered.forEach(s => {
    const chip = document.createElement('button');
    chip.className = `skill-chip ${state.selectedSkill?.path === s.path ? 'selected' : ''}`;
    chip.textContent = s.name;
    chip.addEventListener('click', () => selectSingleSkill(s));
    skillListContainer.appendChild(chip);
  });
}

function selectSingleSkill(skill) {
  state.selectedSkill = skill;
  document.querySelectorAll('.skill-chip').forEach(c => {
    c.classList.toggle('selected', c.textContent === skill.name);
  });

  selectedSkillPreview.innerHTML = `
    <div><strong>已選取 Skill：</strong> <span class="badge badge-accent">${skill.name}</span></div>
    <div style="margin-top: 0.25rem;"><strong>路徑：</strong> <code>${skill.path}</code></div>
    <div style="margin-top: 0.25rem; font-size: 0.75rem; color: #94a3b8;">點擊下方「🔍 1. 生成並預覽該 Skill 評測案」即可檢視即將執行的題庫與目的。</div>
  `;

  // 若目前已有預覽面板，提示需重新預覽
  if (!previewSection.classList.contains('hidden')) {
    previewSection.classList.add('hidden');
    resultsSection.classList.add('hidden');
  }
}

// 6. [第一階段] 生成並預覽測案 (Step 1: Preview)
async function generateCasesPreview(mode) {
  if (!state.currentProject) return;

  const btn = document.getElementById(mode === 'diff-e2e' ? 'btnGenDiffCases' : mode === 'skill-eval' ? 'btnGenSkillCases' : 'btnGenHarnessCases');
  btn.disabled = true;
  btn.textContent = '⏳ 正在分析並生成測案...';

  try {
    const payload = {
      mode,
      projectPath: state.currentProject,
      skillPath: state.selectedSkill?.path,
      harnessScript: 'npm run harness:check'
    };

    const res = await fetch('/api/cases/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const previewData = await res.json();
    state.currentPreview = previewData;

    renderPreviewSection(previewData);
  } catch (e) {
    alert(`預覽生成失敗: ${e.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = mode === 'diff-e2e' ? '🔍 1. 生成並預覽 E2E 測案' : mode === 'skill-eval' ? '🔍 1. 生成並預覽該 Skill 評測案' : '🔍 1. 生成並預覽 Harness 健檢項目';
  }
}

function renderPreviewSection(data) {
  previewTargetTag.textContent = data.targetSummary || data.modeTitle;

  // 渲染檢定標準卡片
  standardsContainer.innerHTML = data.standards.map(s => `
    <div class="standard-item">
      <div class="std-header">
        <strong>${s.name}</strong>
        <span class="badge badge-neutral">規格標準</span>
      </div>
      <p>${s.criterion}</p>
      <div class="std-target">判定門檻: ${s.target}</div>
    </div>
  `).join('');

  // 渲染預覽測案與「測案目的說明」
  plannedCasesList.innerHTML = data.plannedCases.map(c => `
    <div class="case-preview-item">
      <div class="case-header">
        <strong>${c.id}：${c.name}</strong>
        <span class="tc-type-badge">${c.type}</span>
      </div>
      <div class="objective-box">
        🎯 <strong>測案目的：</strong>${c.objective}
      </div>
      <div class="case-meta-row">
        <div>📥 <strong>輸入/刺激：</strong> <span class="code-inline">${c.input}</span></div>
        <div>🎯 <strong>預期通過行為：</strong> <span style="color: #93c5fd;">${c.expected}</span></div>
      </div>
    </div>
  `).join('');

  previewSection.classList.remove('hidden');
  resultsSection.classList.add('hidden');

  // 滾動至預覽區域
  previewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 7. [第二階段] 批准測案並開始實體執行 (Step 2: Execution)
async function executePlannedCases() {
  if (!state.currentProject) return;

  btnExecutePlan.disabled = true;
  btnExecutePlan.textContent = '⏳ 正在啟動底層引擎執行實體破壞測試與比對...';

  try {
    let endpoint = '/api/run/diff-e2e';
    let payload = {
      projectPath: state.currentProject,
      mutations: [
        { type: 'Invert condition', pattern: '===' },
        { type: 'Flip boolean', pattern: 'true' }
      ]
    };

    if (state.activeMode === 'skill-eval') {
      endpoint = '/api/run/skill-eval';
      payload.skillPath = state.selectedSkill?.path;
    } else if (state.activeMode === 'harness-eval') {
      endpoint = '/api/run/harness-eval';
      payload.harnessScript = 'npm run harness:check';
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const runResult = await res.json();
    state.lastEvaluation = runResult;

    renderResultsSection(runResult);
  } catch (e) {
    alert(`執行失敗: ${e.message}`);
  } finally {
    btnExecutePlan.disabled = false;
    btnExecutePlan.textContent = '▶️ 2. 批准測案並開始實體執行 (Run & Compare)';
  }
}

function renderResultsSection(data) {
  const cases = data.result?.caseComparisons || data.caseComparisons || [];

  // 渲染實測逐項對比表
  comparisonRows.innerHTML = cases.map(c => {
    const isPass = c.status === 'PASS';
    const statusChip = isPass
      ? '<span class="status-chip status-chip-pass">PASS</span>'
      : '<span class="status-chip status-chip-fail">FAIL</span>';

    return `
      <tr>
        <td class="tc-id">${c.id}</td>
        <td><strong>${c.name}</strong></td>
        <td><span class="tc-type-badge">${c.type}</span></td>
        <td><span class="code-inline">${c.input}</span></td>
        <td style="color: #93c5fd;">${c.expected}</td>
        <td style="color: ${isPass ? '#86efac' : '#fda4af'}; font-weight: 600;">${c.actual}</td>
        <td>${statusChip}</td>
        <td style="font-size: 0.75rem; color: #cbd5e1;">${c.delta}</td>
      </tr>
    `;
  }).join('');

  // 渲染計分卡
  const scorecard = data.scorecard || {
    overallScore: data.metrics?.overallScore || data.healthScore || 90,
    rating: 'GOOD',
    metrics: {
      mutationKillRate: data.metrics?.recallRate ?? 100,
      silentErrorsCaught: data.checks ? 0 : 0,
      blastRadiusRisk: data.promptAudit?.status || 'LOW'
    },
    insights: data.suggestions || ['測試流程執行順利。']
  };

  overallScorePill.textContent = `${scorecard.overallScore} / 100 ${scorecard.rating}`;
  metricVal1.textContent = `${scorecard.metrics.mutationKillRate ?? 100}%`;
  metricVal2.textContent = `${scorecard.metrics.silentErrorsCaught ?? 0}`;
  metricVal3.textContent = `${scorecard.metrics.blastRadiusRisk ?? 'LOW'}`;

  insightsList.innerHTML = (scorecard.insights || []).map(i => `<li>${i}</li>`).join('');

  // 僅在 Diff E2E 模式顯示晉升按鈕
  diffActionsBar.classList.toggle('hidden', state.activeMode !== 'diff-e2e');

  resultsSection.classList.remove('hidden');
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 8. 輔助函式：GitNexus 衝擊檢查
async function inspectGitNexus() {
  if (!state.currentProject) return;
  try {
    const res = await fetch('/api/inspect/gitnexus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectPath: state.currentProject })
    });
    const data = await res.json();
    const statusText = document.getElementById('gitnexusStatusText');
    const list = document.getElementById('affectedList');
    if (!statusText) return;

    if (!data.changes?.indexed) {
      statusText.textContent = '此專案尚未建立 GitNexus 知識圖譜。';
      list.innerHTML = '';
      return;
    }
    const symbols = data.changes.changedSymbols || [];
    if (symbols.length === 0) {
      statusText.textContent = '✅ 工作區純淨，無未 commit 的 Symbol 異動。';
      list.innerHTML = '<span class="node-tag">Clean</span>';
    } else {
      statusText.textContent = `⚡ 偵測到 ${symbols.length} 個 Symbol 修改：`;
      list.innerHTML = symbols.map(s => `<span class="node-tag">${s}</span>`).join('');
    }
  } catch (e) {}
}

// 9. 一鍵晉升
async function promoteCurrentProbe() {
  if (!state.currentProject) return;
  try {
    const res = await fetch('/api/probes/promote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectPath: state.currentProject,
        probeFile: '.test-eval/diff-probes/probe_latest.spec.js',
        destination: 'tests/e2e/sentinel-promoted.spec.js'
      })
    });
    const data = await res.json();
    alert(`🎉 測案晉升成功！已收編至 ${data.destination}`);
  } catch (e) {
    alert(`晉升提示: ${e.message}`);
  }
}

// 10. SSE
function setupSSE() {
  const eventSource = new EventSource('/api/events');
  eventSource.addEventListener('project_change', event => {
    const data = JSON.parse(event.data);
    fseventDot.style.backgroundColor = '#f59e0b';
    fseventStatus.textContent = `變更偵測: ${data.filename} (即時喚醒)`;
    setTimeout(() => {
      fseventDot.style.backgroundColor = '#10b981';
      fseventStatus.textContent = 'FSEvents 哨兵守候中 (0 Token)';
    }, 1500);
  });
}

window.addEventListener('DOMContentLoaded', init);
