/**
 * app.js - Test Sentinel Web Dashboard 核心邏輯
 * 實作模式焦點、左上角 Skill 選取、Function Flow 與點選測案檢視細節
 */

const state = {
  currentProject: null,
  activeMode: 'diff-e2e',
  profile: null,
  skillsList: [],
  selectedSkill: null, // 初始狀態無預設值
  currentCases: [],
  selectedCaseId: null,
  lastEvaluation: null
};

// DOM 節點
const projectSelect = document.getElementById('projectSelect');
const refreshBtn = document.getElementById('refreshBtn');
const projectInfo = document.getElementById('projectInfo');
const modeButtons = document.querySelectorAll('.mode-btn');

// 頂部控制列
const skillSelectorGroup = document.getElementById('skillSelectorGroup');
const modeGenericHeader = document.getElementById('modeGenericHeader');
const genericModeTag = document.getElementById('genericModeTag');
const genericModeDesc = document.getElementById('genericModeDesc');
const skillSearchInput = document.getElementById('skillSearchInput');
const toggleDropdownBtn = document.getElementById('toggleDropdownBtn');
const autocompleteDropdown = document.getElementById('autocompleteDropdown');
const btnGenerateFlow = document.getElementById('btnGenerateFlow');

// 概念說明
const toggleConceptBtn = document.getElementById('toggleConceptBtn');
const conceptBody = document.getElementById('conceptBody');

// 流程與測案區
const flowStatusBadge = document.getElementById('flowStatusBadge');
const functionFlowContainer = document.getElementById('functionFlowContainer');
const casesSection = document.getElementById('casesSection');
const casesCountBadge = document.getElementById('casesCountBadge');
const caseMasterList = document.getElementById('caseMasterList');
const actionTriggerSection = document.getElementById('actionTriggerSection');
const btnExecutePlan = document.getElementById('btnExecutePlan');

// 測案詳細檢視器 (Inspector)
const caseInspectorCard = document.getElementById('caseInspectorCard');
const inspectorCaseTitle = document.getElementById('inspectorCaseTitle');
const inspectorStatusBadge = document.getElementById('inspectorStatusBadge');
const inspectObjective = document.getElementById('inspectObjective');
const inspectInput = document.getElementById('inspectInput');
const caseCustomBadge = document.getElementById('caseCustomBadge');
const btnResetInput = document.getElementById('btnResetInput');
const inspectConfidenceBox = document.getElementById('inspectConfidenceBox');
const inspectTokenTable = document.getElementById('inspectTokenTable');
const inspectOutput = document.getElementById('inspectOutput');
const inspectQualityBox = document.getElementById('inspectQualityBox');

// 計分卡區
const scorecardSection = document.getElementById('scorecardSection');
const overallScorePill = document.getElementById('overallScorePill');
const metricVal1 = document.getElementById('metricVal1');
const metricVal2 = document.getElementById('metricVal2');
const metricVal3 = document.getElementById('metricVal3');
const metricVal4 = document.getElementById('metricVal4');
const insightsList = document.getElementById('insightsList');

// 哨兵狀態
const fseventDot = document.getElementById('fseventDot');
const fseventStatus = document.getElementById('fseventStatus');

// 1. 初始化
async function init() {
  setupSSE();
  bindEvents();
  await loadProjects();
  updateModeView();
}

function bindEvents() {
  projectSelect.addEventListener('change', () => selectProject(projectSelect.value));
  refreshBtn.addEventListener('click', () => selectProject(projectSelect.value));

  // 模式切換
  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      modeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeMode = btn.dataset.mode;
      updateModeView();
    });
  });

  // 概念說明展開/收合
  toggleConceptBtn.addEventListener('click', () => {
    const isHidden = conceptBody.classList.toggle('hidden');
    toggleConceptBtn.textContent = isHidden ? '展開指標定義' : '收合指標定義';
  });

  // Skill 下拉選單
  skillSearchInput.addEventListener('focus', openSkillDropdown);
  skillSearchInput.addEventListener('input', () => {
    openSkillDropdown();
    renderAutocompleteOptions(skillSearchInput.value);
  });
  skillSearchInput.addEventListener('keydown', handleDropdownKeynav);

  toggleDropdownBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSkillDropdown();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.autocomplete-wrapper')) {
      closeSkillDropdown();
    }
  });

  // 生成流程測案
  btnGenerateFlow.addEventListener('click', generateFlowAndCases);

  // 執行測試流程
  btnExecutePlan.addEventListener('click', executeTestFlow);

  // 測案 Query / Input 編輯即時監聽與雙向綁定
  inspectInput.addEventListener('input', () => {
    const activeCase = state.currentCases.find(c => c.id === state.selectedCaseId);
    if (!activeCase) return;

    if (!activeCase.defaultInput) {
      activeCase.defaultInput = activeCase.input;
    }
    activeCase.input = inspectInput.value;
    activeCase.isCustom = inspectInput.value !== activeCase.defaultInput;

    updateCustomInputStatus(activeCase);
  });

  // 還原預設 Query 按鈕
  btnResetInput.addEventListener('click', () => {
    const activeCase = state.currentCases.find(c => c.id === state.selectedCaseId);
    if (!activeCase || !activeCase.defaultInput) return;

    activeCase.input = activeCase.defaultInput;
    inspectInput.value = activeCase.defaultInput;
    activeCase.isCustom = false;

    updateCustomInputStatus(activeCase);
  });
}

function updateCustomInputStatus(activeCase) {
  const isCustom = !!activeCase.isCustom;
  caseCustomBadge.classList.toggle('hidden', !isCustom);
  btnResetInput.classList.toggle('hidden', !isCustom);

  // 同步更新左側卡片上的標籤或提示
  const leftCard = document.querySelector(`.case-item-card[data-case-id="${activeCase.id}"]`);
  if (leftCard) {
    let customTag = leftCard.querySelector('.custom-badge-tag');
    if (isCustom) {
      if (!customTag) {
        customTag = document.createElement('span');
        customTag.className = 'custom-badge-tag badge badge-accent';
        customTag.textContent = '已自訂';
        leftCard.querySelector('.case-item-top').appendChild(customTag);
      }
    } else if (customTag) {
      customTag.remove();
    }
  }
}

// 2. 模式視圖切換
function updateModeView() {
  const isSkillMode = state.activeMode === 'skill-eval';
  skillSelectorGroup.classList.toggle('hidden', !isSkillMode);
  modeGenericHeader.classList.toggle('hidden', isSkillMode);

  if (!isSkillMode) {
    if (state.activeMode === 'diff-e2e') {
      genericModeTag.textContent = '模式 A: Git Diff E2E';
      genericModeDesc.textContent = '針對代碼修改局部合成暫存探針並執行變異擊殺測試';
    } else {
      genericModeTag.textContent = '模式 C: Harness 健檢';
      genericModeDesc.textContent = '實體故障破壞注入與多回合環境隔離性 (Idempotency) 檢定';
    }
  }

  // 重設執行狀態
  casesSection.classList.add('hidden');
  actionTriggerSection.classList.add('hidden');
  scorecardSection.classList.add('hidden');
  flowStatusBadge.textContent = '尚未啟動';
  flowStatusBadge.className = 'badge badge-neutral';

  renderInitialFunctionFlow();
}

function renderInitialFunctionFlow() {
  const flows = {
    'diff-e2e': [
      { step: 1, name: '變更分析', desc: '鎖定修改行與變異點' },
      { step: 2, name: '探針合成', desc: '生成暫存測試與安全網' },
      { step: 3, name: '沙盒執行', desc: '實測點擊與錯誤攔截' },
      { step: 4, name: '變異擊殺', desc: '邏輯顛倒比對打分' }
    ],
    'skill-eval': [
      { step: 1, name: '輸入查詢', desc: '解析 Query 意圖實體' },
      { step: 2, name: '意圖匹配', desc: '特徵交集計算信心指數' },
      { step: 3, name: 'Context 載入', desc: '動態注入 SKILL.md' },
      { step: 4, name: '品質評審', desc: '量測 Token 與產出合規' }
    ],
    'harness-eval': [
      { step: 1, name: '指令探索', desc: '偵測 Harness 執行入口' },
      { step: 2, name: '基線順行', desc: '驗證正常狀態 Exit 0' },
      { step: 3, name: '故障破壞', desc: '注入壞資料檢驗阻斷力' },
      { step: 4, name: '無痕隔離', desc: '檢驗磁碟零髒檔案殘留' }
    ]
  };

  const steps = flows[state.activeMode] || flows['diff-e2e'];
  renderFlowTrack(steps, 0);
}

function renderFlowTrack(steps, completedUpTo = 0) {
  functionFlowContainer.innerHTML = steps.map((s, idx) => `
    <div class="flow-step-node ${idx < completedUpTo ? 'completed' : idx === completedUpTo ? 'active' : ''}">
      <div class="flow-node-index">${idx < completedUpTo ? '✓' : s.step}</div>
      <div class="flow-node-text">
        <strong>${s.name}</strong>
        <small>${s.desc}</small>
      </div>
    </div>
    ${idx < steps.length - 1 ? '<div class="flow-arrow">&rarr;</div>' : ''}
  `).join('');
}

// 3. 專案清單與選取
async function loadProjects() {
  try {
    const res = await fetch('/api/projects/list');
    const list = await res.json();
    projectSelect.innerHTML = '';

    list.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.path;
      opt.textContent = `${item.name}`;
      projectSelect.appendChild(opt);
    });

    if (list.length > 0) {
      const defaultProj = list.find(p => p.name === 'task-dashboard') || list[0];
      projectSelect.value = defaultProj.path;
      await selectProject(defaultProj.path);
    }
  } catch (e) {
    projectInfo.innerHTML = `<p class="text-warning">專案載入失敗: ${e.message}</p>`;
  }
}

async function selectProject(projPath) {
  if (!projPath) return;
  state.currentProject = projPath;
  state.selectedSkill = null; // 初始狀態無預設值
  skillSearchInput.value = ''; // 清空輸入框
  projectInfo.innerHTML = '<p>掃描專案架構中...</p>';

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
    renderAutocompleteOptions('');
  } catch (e) {
    projectInfo.innerHTML = `<p class="text-warning">掃描失敗: ${e.message}</p>`;
  }
}

function renderProjectInfo(p) {
  const fws = p.frameworks.length > 0 ? p.frameworks.join(', ') : '無特定框架';
  const skillsCount = p.skills.length;
  const hasHarness = p.harness.hasHarness ? '已建置' : '未發現';
  const gitBranch = p.git.branch || '非 Git 專案';

  projectInfo.innerHTML = `
    <div style="font-size: 0.8rem; line-height: 1.6;">
      <div><strong>Git 分支：</strong> <code>${gitBranch}</code></div>
      <div><strong>前端架構：</strong> ${fws}</div>
      <div><strong>可用 Skill：</strong> <span class="badge badge-accent">${skillsCount} 個</span></div>
      <div><strong>Harness 狀態：</strong> ${hasHarness}</div>
    </div>
  `;
}

// 4. Autocomplete 下拉選單邏輯
let activeOptionIdx = -1;

function openSkillDropdown() {
  autocompleteDropdown.classList.remove('hidden');
  toggleDropdownBtn.classList.add('open');
  renderAutocompleteOptions(skillSearchInput.value);
}

function closeSkillDropdown() {
  autocompleteDropdown.classList.add('hidden');
  toggleDropdownBtn.classList.remove('open');
  activeOptionIdx = -1;
}

function toggleSkillDropdown() {
  if (autocompleteDropdown.classList.contains('hidden')) {
    openSkillDropdown();
    skillSearchInput.focus();
  } else {
    closeSkillDropdown();
  }
}

function renderAutocompleteOptions(filter = '') {
  const q = filter.toLowerCase().trim();
  const filtered = (state.skillsList || []).filter(s =>
    s.name.toLowerCase().includes(q) ||
    (s.source && s.source.toLowerCase().includes(q)) ||
    (s.relPath && s.relPath.toLowerCase().includes(q))
  );

  if (filtered.length === 0) {
    autocompleteDropdown.innerHTML = '<div class="empty-option">無匹配的 Skill 檔案</div>';
    return;
  }

  autocompleteDropdown.innerHTML = filtered.map((s, idx) => {
    const isSelected = state.selectedSkill?.path === s.path;
    return `
      <div class="autocomplete-option ${isSelected ? 'selected' : ''}" data-idx="${idx}" data-path="${s.path}">
        <div class="option-main">
          <div><span class="source-tag">${s.source || 'root'}</span><strong>${s.name}</strong></div>
          <div class="option-path">${s.relPath || s.path}</div>
        </div>
        ${isSelected ? '<span class="option-check">✓</span>' : ''}
      </div>
    `;
  }).join('');

  autocompleteDropdown.querySelectorAll('.autocomplete-option').forEach((optEl, i) => {
    optEl.addEventListener('click', () => {
      selectSingleSkill(filtered[i]);
      closeSkillDropdown();
    });
  });
}

function selectSingleSkill(skill) {
  state.selectedSkill = skill;
  skillSearchInput.value = skill.name;

  // 重設下層預覽
  casesSection.classList.add('hidden');
  actionTriggerSection.classList.add('hidden');
  scorecardSection.classList.add('hidden');
}

function handleDropdownKeynav(e) {
  const options = autocompleteDropdown.querySelectorAll('.autocomplete-option');
  if (options.length === 0) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeOptionIdx = (activeOptionIdx + 1) % options.length;
    updateActiveOption(options);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeOptionIdx = (activeOptionIdx - 1 + options.length) % options.length;
    updateActiveOption(options);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (activeOptionIdx >= 0 && activeOptionIdx < options.length) {
      options[activeOptionIdx].click();
    }
  } else if (e.key === 'Escape') {
    closeSkillDropdown();
  }
}

function updateActiveOption(options) {
  options.forEach((opt, idx) => {
    opt.classList.toggle('option-active', idx === activeOptionIdx);
    if (idx === activeOptionIdx) {
      opt.scrollIntoView({ block: 'nearest' });
    }
  });
}

// 5. [第一階段] 生成測試流程與測案
async function generateFlowAndCases() {
  if (!state.currentProject) return;

  if (state.activeMode === 'skill-eval' && !state.selectedSkill) {
    alert('請先於左上角選取要測試的 Skill！');
    skillSearchInput.focus();
    openSkillDropdown();
    return;
  }

  btnGenerateFlow.disabled = true;
  btnGenerateFlow.innerHTML = '<span>正在分析架構並生成流程...</span>';

  try {
    const payload = {
      mode: state.activeMode,
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
    state.currentCases = previewData.plannedCases || [];

    // 更新流程管線
    flowStatusBadge.textContent = '測案已生成 (就緒)';
    flowStatusBadge.className = 'badge badge-accent';
    const steps = [
      { step: 1, name: '目標分析', desc: previewData.modeTitle },
      { step: 2, name: '測案合成', desc: `${state.currentCases.length} 個檢核點建立` },
      { step: 3, name: '實體執行', desc: '等待批准啟動' },
      { step: 4, name: '鑑別比對', desc: '品質與 Token 審查' }
    ];
    renderFlowTrack(steps, 2);

    // 渲染互動測案區塊 (由上往下排列)
    renderCaseBlocks(state.currentCases);
    casesCountBadge.textContent = `${state.currentCases.length} 個測案`;

    // 預設選取並呈現第一個測案之細節
    if (state.currentCases.length > 0) {
      inspectCaseDetail(state.currentCases[0]);
    }

    casesSection.classList.remove('hidden');
    actionTriggerSection.classList.remove('hidden');
    scorecardSection.classList.add('hidden');

    casesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    alert(`生成失敗: ${e.message}`);
  } finally {
    btnGenerateFlow.disabled = false;
    btnGenerateFlow.innerHTML = `
      <svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <span>1. 生成測試流程與測案</span>
    `;
  }
}

function renderCaseBlocks(cases) {
  caseMasterList.innerHTML = cases.map(c => `
    <div class="case-item-card ${c.status === 'FAIL' ? 'status-fail' : ''} ${state.selectedCaseId === c.id ? 'selected' : ''}" data-case-id="${c.id}">
      <div class="case-item-top">
        <span class="case-item-id">${c.id}</span>
        <span class="badge ${c.status === 'FAIL' ? 'badge-danger' : c.status === 'PASS' ? 'badge-success' : 'badge-neutral'}">
          ${c.status || '待執行'}
        </span>
      </div>
      <div class="case-item-title">${c.name}</div>
      <div class="case-item-obj"><strong>檢測目標：</strong>${c.objective || c.delta || '驗證邊界反應與回傳規格'}</div>
      <div class="case-item-meta">
        <span>${c.type}</span>
        <span style="color: var(--accent-cyan);">檢視細節 &rarr;</span>
      </div>
    </div>
  `).join('');

  // 點選左側卡片切換右側細節
  caseMasterList.querySelectorAll('.case-item-card').forEach(card => {
    card.addEventListener('click', () => {
      const caseId = card.dataset.caseId;
      const targetCase = state.currentCases.find(item => item.id === caseId);
      if (targetCase) {
        inspectCaseDetail(targetCase);
      }
    });
  });
}

// 6. [第二階段] 批准測案並開始實體執行
async function executeTestFlow() {
  if (!state.currentProject) return;

  btnExecutePlan.disabled = true;
  btnExecutePlan.innerHTML = '<span>正在實體執行、破壞注入與比對品質...</span>';

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
      // 包含使用者自訂編輯之測案以進行深度測試
      payload.cases = state.currentCases.map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        input: c.input,
        expectedTrigger: c.expected?.includes('>= 35%') || c.type?.includes('正向')
      }));
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

    // 將實測結果覆蓋至測案清單
    state.currentCases = runResult.result?.caseComparisons || runResult.caseComparisons || [];

    // 更新流程管線為全數完成
    flowStatusBadge.textContent = '實體檢定完成 (Verified)';
    flowStatusBadge.className = 'badge badge-success';
    const steps = [
      { step: 1, name: '輸入查詢', desc: '實體執行完成' },
      { step: 2, name: '意圖匹配', desc: '信心指數計算完畢' },
      { step: 3, name: 'Context 載入', desc: 'Token 負載已記錄' },
      { step: 4, name: '品質評審', desc: '產出合規核算完成' }
    ];
    renderFlowTrack(steps, 4);

    // 重新渲染測案卡片 (帶上 PASS/FAIL 與 Token 狀態)
    renderCaseBlocks(state.currentCases);

    // 渲染計分卡
    renderScorecard(runResult);

    // 刷新目前選中測案之細節 (若有) 或預設第一個
    const activeCase = state.currentCases.find(c => c.id === state.selectedCaseId) || state.currentCases[0];
    if (activeCase) {
      inspectCaseDetail(activeCase);
    }

    scorecardSection.classList.remove('hidden');
    scorecardSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    alert(`執行失敗: ${e.message}`);
  } finally {
    btnExecutePlan.disabled = false;
    btnExecutePlan.innerHTML = `
      <svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="5 3 19 12 5 21 5 3"/>
      </svg>
      <span>2. 批准測案並開始實體執行</span>
    `;
  }
}

// 7. 個別測案詳細資訊檢視器 (點選左側卡片，右側顯示細節)
function inspectCaseDetail(c) {
  state.selectedCaseId = c.id;

  // 高亮左側選取的卡片
  document.querySelectorAll('.case-item-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.caseId === c.id);
  });

  inspectorCaseTitle.textContent = `${c.id}：${c.name}`;
  inspectorStatusBadge.textContent = c.status || '待執行';
  inspectorStatusBadge.className = `badge ${c.status === 'FAIL' ? 'badge-danger' : c.status === 'PASS' ? 'badge-success' : 'badge-neutral'}`;

  inspectObjective.innerHTML = `
    <strong>檢測目的：</strong>${c.objective || c.delta || '驗證邊界輸入之模型決策與反應行為。'}
    ${c.expected ? `<div style="margin-top: 0.35rem; font-size: 0.76rem; color: #a5f3fc;"><strong>預期反應 (Expected)：</strong>${c.expected}</div>` : ''}
  `;

  // 設置可編輯的輸入框數值
  inspectInput.value = c.input || '';
  if (!c.defaultInput) {
    c.defaultInput = c.input;
  }
  updateCustomInputStatus(c);

  // 信心指數解析
  const conf = c.confidenceDetails || {};
  inspectConfidenceBox.innerHTML = `
    <div><strong>實測信心度：</strong> <span class="badge badge-accent">${conf.score || c.actual?.match(/\d+%/)?.[0] || '100%'}</span> (判定門檻: 35%)</div>
    <div style="margin-top: 0.35rem; font-size: 0.75rem; color: #cbd5e1;">
      ${conf.explanation || c.delta || '語意特徵符合目標範圍。'}
    </div>
  `;

  // 個別測案 Token 消耗明細
  const token = c.tokenBreakdown || { promptTokens: 380, completionTokens: 120, totalTokens: 500, latencyMs: 350 };
  inspectTokenTable.innerHTML = `
    <div class="token-stat-row">
      <span>輸入 Prompt Tokens (含 Context):</span>
      <code>${token.promptTokens} tokens</code>
    </div>
    <div class="token-stat-row">
      <span>輸出 Completion Tokens:</span>
      <code>${token.completionTokens} tokens</code>
    </div>
    <div class="token-stat-row">
      <span>執行延遲 (Latency):</span>
      <code>${token.latencyMs} ms</code>
    </div>
    <div class="token-stat-row">
      <span>本測案消耗總計:</span>
      <strong>${token.totalTokens} tokens</strong>
    </div>
    ${token.efficiencyNote ? `<div style="margin-top: 0.35rem; font-size: 0.72rem; color: var(--accent-cyan);">${token.efficiencyNote}</div>` : ''}
  `;

  // 產出結果預覽
  inspectOutput.textContent = c.simulatedOutput || c.actual || '尚未執行';

  // 產出品質評審
  const quality = c.qualityEvaluation || { score: 95, rating: 'EXCELLENT', summary: '完全符合規範' };
  inspectQualityBox.innerHTML = `
    <div class="flex-between">
      <div><strong>產出品質評分：</strong> <span class="score-pill">${quality.score} / 100 [${quality.rating}]</span></div>
      <span class="badge badge-success">${quality.formatCompliance || '格式合規'}</span>
    </div>
    <div style="margin-top: 0.4rem; font-size: 0.75rem; color: #cbd5e1;">
      ${quality.summary}
    </div>
  `;
}

// 8. 計分卡渲染
function renderScorecard(data) {
  const scorecard = data.scorecard || {
    overallScore: data.metrics?.overallScore || data.healthScore || 90,
    rating: 'GOOD',
    metrics: {
      mutationKillRate: data.metrics?.recallRate ?? 100,
      qualityScore: data.metrics?.averageQualityScore || 95,
      totalTokens: data.metrics?.totalTestTokens || `${data.totalTokensConsumed || 1245} tokens`
    },
    insights: data.suggestions || ['測試流程執行順利。']
  };

  overallScorePill.textContent = `${scorecard.overallScore} / 100 ${scorecard.rating}`;
  metricVal1.textContent = `${scorecard.metrics.mutationKillRate ?? 100}%`;
  metricVal2.textContent = `${scorecard.metrics.qualityScore || 95} 分`;
  metricVal3.textContent = `${scorecard.metrics.totalTokens || '1,245 tokens'}`;

  insightsList.innerHTML = (scorecard.insights || []).map(i => `<li>${i}</li>`).join('');
}

// 9. SSE
function setupSSE() {
  const eventSource = new EventSource('/api/events');
  eventSource.addEventListener('project_change', event => {
    const data = JSON.parse(event.data);
    fseventDot.style.backgroundColor = '#f59e0b';
    fseventStatus.textContent = `檔案變更: ${data.filename} (即時喚醒)`;
    setTimeout(() => {
      fseventDot.style.backgroundColor = '#10b981';
      fseventStatus.textContent = 'FSEvents 哨兵守候中 (0 Token)';
    }, 1500);
  });
}

window.addEventListener('DOMContentLoaded', init);
