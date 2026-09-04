/**
 * app.js - Test Sentinel Web Dashboard 核心邏輯
 * 實作模式焦點、左上角 Skill 選取、Function Flow 與點選測案檢視細節
 */

const state = {
  currentProject: null,
  activeMode: 'diff-e2e',
  activeView: 'workspace', // 'workspace' | 'history'
  profile: null,
  skillsList: [],
  selectedSkill: null, // 初始狀態無預設值
  currentCases: [],
  selectedCaseId: null,
  lastEvaluation: null,
  projectsList: [], // 全域專案清單
  // 獨立歷史紀錄中心篩選與暫存狀態
  history: {
    project: null,
    mode: 'all',
    target: 'all',
    allRecords: [],
    selectedRecordId: null
  }
};

// DOM 節點
// 視圖切換與導航
const tabNavWorkspace = document.getElementById('tabNavWorkspace');
const tabNavHistory = document.getElementById('tabNavHistory');
const navHistoryBadge = document.getElementById('navHistoryBadge');
const workspaceView = document.getElementById('workspaceView');
const historyView = document.getElementById('historyView');

// 工作區專案與模式
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

// 歷史存檔確認橫幅
const scorecardHistoryArchiveBanner = document.getElementById('scorecardHistoryArchiveBanner');
const archiveRecordMeta = document.getElementById('archiveRecordMeta');
const btnJumpToHistory = document.getElementById('btnJumpToHistory');

// 獨立歷史中心節點
const histProjectSelect = document.getElementById('histProjectSelect');
const histModeTabs = document.getElementById('histModeTabs');
const histTargetSelect = document.getElementById('histTargetSelect');
const btnHistReload = document.getElementById('btnHistReload');
const histTotalCountBadge = document.getElementById('histTotalCountBadge');
const histListCountBadge = document.getElementById('histListCountBadge');
const histRecordList = document.getElementById('histRecordList');
const histDetailEmpty = document.getElementById('histDetailEmpty');
const histDetailContent = document.getElementById('histDetailContent');
const histDetailTitle = document.getElementById('histDetailTitle');
const histDetailTime = document.getElementById('histDetailTime');
const histDetailScorePill = document.getElementById('histDetailScorePill');
const histDetailDiffBar = document.getElementById('histDetailDiffBar');
const histMetricVal1 = document.getElementById('histMetricVal1');
const histMetricVal2 = document.getElementById('histMetricVal2');
const histMetricVal3 = document.getElementById('histMetricVal3');
const histMetricVal4 = document.getElementById('histMetricVal4');
const histMetricLbl1 = document.getElementById('histMetricLbl1');
const histMetricLbl2 = document.getElementById('histMetricLbl2');
const histMetricLbl3 = document.getElementById('histMetricLbl3');
const histMetricLbl4 = document.getElementById('histMetricLbl4');
const histDetailCasesList = document.getElementById('histDetailCasesList');
const histInsightsList = document.getElementById('histInsightsList');

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
const desktopAgentPromptPanel = document.getElementById('desktopAgentPromptPanel');
const desktopAgentPromptText = document.getElementById('desktopAgentPromptText');
const btnCopyAgentPrompt = document.getElementById('btnCopyAgentPrompt');
const copyAgentPromptLabel = document.getElementById('copyAgentPromptLabel');

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
  // 頂部視圖切換 (工作區 vs 獨立歷史中心)
  if (tabNavWorkspace) {
    tabNavWorkspace.addEventListener('click', () => switchView('workspace'));
  }
  if (tabNavHistory) {
    tabNavHistory.addEventListener('click', () => switchView('history'));
  }
  if (btnJumpToHistory) {
    btnJumpToHistory.addEventListener('click', () => switchView('history'));
  }

  // 工作區專案選取與重新整理
  projectSelect.addEventListener('change', () => selectProject(projectSelect.value));
  refreshBtn.addEventListener('click', () => selectProject(projectSelect.value));

  // 獨立歷史中心：專案切換
  if (histProjectSelect) {
    histProjectSelect.addEventListener('change', () => {
      state.history.project = histProjectSelect.value;
      state.history.target = 'all';
      loadHistoryData();
    });
  }

  // 獨立歷史中心：模式篩選切換
  if (histModeTabs) {
    histModeTabs.querySelectorAll('.hist-mode-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        histModeTabs.querySelectorAll('.hist-mode-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        state.history.mode = pill.dataset.mode;
        updateHistoryTargetOptions();
        filterAndRenderHistoryRecords();
      });
    });
  }

  // 獨立歷史中心：目標/檔案篩選切換
  if (histTargetSelect) {
    histTargetSelect.addEventListener('change', () => {
      state.history.target = histTargetSelect.value;
      filterAndRenderHistoryRecords();
    });
  }

  // 獨立歷史中心：重新整理按鈕
  if (btnHistReload) {
    btnHistReload.addEventListener('click', () => loadHistoryData());
  }

  // 工作區評測模式切換
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
    toggleConceptBtn.textContent = isHidden ? '[ + 展開 ]' : '[ - 收合 ]';
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
  btnCopyAgentPrompt.addEventListener('click', copyDesktopAgentPrompt);

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
  desktopAgentPromptPanel.classList.toggle('hidden', !isSkillMode);
  updateDesktopAgentPrompt();

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
  updateNavHistoryBadge();
}

function updateDesktopAgentPrompt() {
  if (!desktopAgentPromptText) return;
  const targetProject = state.currentProject || '<TARGET_PROJECT>';
  desktopAgentPromptText.value = `請啟動 Test Sentinel 的 Desktop Agent 實測哨兵。

Test Sentinel 專案：
~/projects/test-sentinel

目標專案：
${targetProject}

請依序執行：
1. 在 async/background terminal 執行：
   cd ~/projects/test-sentinel
   npm run agent:watch -- "${targetProject}"
2. 保持 watcher 運行，不要輪詢或提前結束。
3. 收到 AGENT_EVAL_WAKEUP_TRIGGERED 或 AGENT_EVAL_WAKEUP_IMMEDIATE 後，執行：
   npm run agent:next -- "${targetProject}"
4. 絕對不可讀取任何 *.labels.json。
5. 對每個 query 使用新的獨立 Agent context 實際執行。只有目標 Skill 真正載入並影響結果時，triggered 才填 true。
6. 記錄實際 output；token 只有 runtime 真正提供時才填。若無法取得，必須填 tokenMeasurementReason 說明宿主限制；latency 可用外部 wall-clock 實測。qualityChecks 必須附可驗證 evidence。
7. 將每個 case ID 恰好寫入一次結果 JSON，執行：
   npm run agent:complete -- "${targetProject}" <jobId> <result.json>
8. 完成後再次執行 agent:watch，等待下一筆工作。

請持續處理，直到我要求停止。`;
}

async function copyDesktopAgentPrompt() {
  updateDesktopAgentPrompt();
  try {
    await navigator.clipboard.writeText(desktopAgentPromptText.value);
    copyAgentPromptLabel.textContent = '已複製';
  } catch (error) {
    desktopAgentPromptText.select();
    document.execCommand('copy');
    copyAgentPromptLabel.textContent = '已複製';
  }
  setTimeout(() => {
    copyAgentPromptLabel.textContent = '複製 Prompt';
  }, 1800);
}

function getCurrentTargetName() {
  if (state.activeMode === 'skill-eval') {
    return state.selectedSkill?.name || 'skill';
  } else if (state.activeMode === 'harness-eval') {
    return 'default-harness';
  }
  return 'all-diffs';
}

// 更新頂部導航歷史紀錄筆數 Badge
async function updateNavHistoryBadge() {
  if (!state.currentProject) return;

  try {
    const url = `/api/history/all?project=${encodeURIComponent(state.currentProject)}`;
    const res = await fetch(url);
    const data = await res.json();
    const count = data.history?.length || 0;
    if (navHistoryBadge) {
      navHistoryBadge.textContent = count;
      navHistoryBadge.className = count > 0 ? 'badge badge-accent' : 'badge badge-neutral';
    }
  } catch (e) {
    if (navHistoryBadge) navHistoryBadge.textContent = '0';
  }
}

// 頂部視圖切換 (工作區 vs 獨立歷史中心)
function switchView(viewName) {
  state.activeView = viewName;
  const isWorkspace = viewName === 'workspace';

  if (tabNavWorkspace) tabNavWorkspace.classList.toggle('active', isWorkspace);
  if (tabNavHistory) tabNavHistory.classList.toggle('active', !isWorkspace);

  if (workspaceView) workspaceView.classList.toggle('hidden', !isWorkspace);
  if (historyView) historyView.classList.toggle('hidden', isWorkspace);

  if (!isWorkspace) {
    initHistoryCenterView();
  }
}

// 獨立歷史紀錄中心初始化與資料載入
async function initHistoryCenterView() {
  populateHistoryProjectOptions();

  if (!state.history.project) {
    state.history.project = state.currentProject || (state.projectsList[0] && state.projectsList[0].path);
  }
  if (histProjectSelect && state.history.project) {
    histProjectSelect.value = state.history.project;
  }

  // 同步模式按鈕的高亮狀態
  if (histModeTabs) {
    histModeTabs.querySelectorAll('.hist-mode-pill').forEach(pill => {
      pill.classList.toggle('active', pill.dataset.mode === (state.history.mode || 'all'));
    });
  }

  await loadHistoryData();
}

async function loadHistoryData() {
  if (!state.history.project) return;

  if (histRecordList) {
    histRecordList.innerHTML = '<div class="text-muted text-xs p-3">載入歷次評測存檔中...</div>';
  }

  try {
    const url = `/api/history/all?project=${encodeURIComponent(state.history.project)}`;
    const res = await fetch(url);
    const data = await res.json();
    state.history.allRecords = data.history || [];

    if (navHistoryBadge && state.history.project === state.currentProject) {
      navHistoryBadge.textContent = state.history.allRecords.length;
    }

    // 更新目標/檔案選項
    updateHistoryTargetOptions();

    // 過濾並渲染列表
    filterAndRenderHistoryRecords();
  } catch (e) {
    if (histRecordList) {
      histRecordList.innerHTML = `<div class="text-warning text-xs p-3">載入失敗: ${e.message}</div>`;
    }
  }
}

function populateHistoryProjectOptions() {
  if (!histProjectSelect) return;
  const currentVal = histProjectSelect.value || state.history.project || state.currentProject;
  histProjectSelect.innerHTML = '';
  state.projectsList.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.path;
    opt.textContent = p.name;
    histProjectSelect.appendChild(opt);
  });
  if (currentVal && Array.from(histProjectSelect.options).some(o => o.value === currentVal)) {
    histProjectSelect.value = currentVal;
  }
}

function updateHistoryTargetOptions() {
  if (!histTargetSelect) return;
  const mode = state.history.mode;
  const targets = new Set();
  state.history.allRecords.forEach(r => {
    if (mode === 'all' || r.mode === mode) {
      if (r.target) targets.add(r.target);
    }
  });

  const previousTarget = state.history.target;
  histTargetSelect.innerHTML = '<option value="all">全部檔案與目標</option>';
  Array.from(targets).sort().forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    histTargetSelect.appendChild(opt);
  });

  if (targets.has(previousTarget)) {
    histTargetSelect.value = previousTarget;
  } else {
    state.history.target = 'all';
    histTargetSelect.value = 'all';
  }
}

function filterAndRenderHistoryRecords() {
  const mode = state.history.mode || 'all';
  const target = state.history.target || 'all';

  const filtered = state.history.allRecords.filter(r => {
    const modeMatch = mode === 'all' || r.mode === mode;
    const targetMatch = target === 'all' || r.target === target || r.targetSlug === target;
    return modeMatch && targetMatch;
  });

  if (histTotalCountBadge) {
    histTotalCountBadge.textContent = `共 ${state.history.allRecords.length} 筆紀錄`;
  }
  if (histListCountBadge) {
    histListCountBadge.textContent = `${filtered.length} 筆`;
  }

  if (filtered.length === 0) {
    histRecordList.innerHTML = `
      <div class="empty-option p-3 text-xs" style="color: var(--text-muted); line-height: 1.6;">
        無符合篩選條件的評測存檔紀錄。<br/>
        專案：<code>${pathBasename(state.history.project)}</code><br/>
        模式：<code>${mode}</code> | 目標：<code>${target}</code><br/>
        請切換篩選條件，或前往即時評測工作區執行測案。
      </div>
    `;
    if (histDetailEmpty) histDetailEmpty.classList.remove('hidden');
    if (histDetailContent) histDetailContent.classList.add('hidden');
    return;
  }

  let activeId = state.history.selectedRecordId;
  if (!activeId || !filtered.some(r => r.recordId === activeId)) {
    activeId = filtered[0].recordId;
    state.history.selectedRecordId = activeId;
  }

  histRecordList.innerHTML = filtered.map(item => `
    <div class="history-record-item ${item.recordId === activeId ? 'active' : ''}" data-id="${item.recordId}" data-mode="${item.mode}" data-target="${item.target}">
      <div class="record-top">
        <span class="record-time">${item.time ? item.time.substring(0, 19).replace('T', ' ') : item.recordId}</span>
        <span class="badge ${item.status === 'PASSED' ? 'badge-success' : 'badge-neutral'}">${item.status || 'DONE'}</span>
      </div>
      <div class="record-meta">
        <span class="record-target"><small style="color: var(--border-bright); font-weight: normal;">[${item.mode}]</small> ${item.target}</span>
        <span class="record-score score-pill">${item.overallScore} 分</span>
      </div>
      <div class="record-action-bar mt-2">
        <span class="hist-item-action-pill">[ 點選切換檢視 ➔ ]</span>
      </div>
    </div>
  `).join('');

  histRecordList.querySelectorAll('.history-record-item').forEach(card => {
    card.addEventListener('click', () => {
      histRecordList.querySelectorAll('.history-record-item').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      state.history.selectedRecordId = card.dataset.id;
      loadHistoryRecordDetail(card.dataset.id, card.dataset.mode, card.dataset.target);
    });
  });

  const currentItem = filtered.find(r => r.recordId === activeId) || filtered[0];
  if (currentItem) {
    loadHistoryRecordDetail(currentItem.recordId, currentItem.mode, currentItem.target);
  }
}

async function loadHistoryRecordDetail(recordId, mode, target) {
  try {
    const res = await fetch(`/api/history/detail?project=${encodeURIComponent(state.history.project)}&mode=${encodeURIComponent(mode)}&target=${encodeURIComponent(target)}&id=${encodeURIComponent(recordId)}`);
    const report = await res.json();
    if (report.error) return;

    if (histDetailEmpty) histDetailEmpty.classList.add('hidden');
    if (histDetailContent) histDetailContent.classList.remove('hidden');

    const score = report.overallScore ?? report.scorecard?.overallScore ?? report.metrics?.overallScore ?? report.healthScore ?? 0;
    const rating = report.scorecard?.rating || (score >= 90 ? 'EXCELLENT' : score >= 80 ? 'GOOD' : 'NEEDS_ATTENTION');

    if (histDetailTitle) histDetailTitle.textContent = `[${mode}] ${target} 評測歷史存檔`;
    if (histDetailTime) histDetailTime.textContent = `存檔編號: ${recordId} | 時間: ${report.savedAt ? report.savedAt.substring(0, 19).replace('T', ' ') : 'N/A'}`;
    if (histDetailScorePill) histDetailScorePill.textContent = `${score} / 100 [${rating}]`;

    // 差異標籤計算
    const diffRes = await fetch(`/api/history/diff?project=${encodeURIComponent(state.history.project)}&mode=${encodeURIComponent(mode)}&target=${encodeURIComponent(target)}&id=${encodeURIComponent(recordId)}`);
    const diffData = await diffRes.json();
    if (diffData.diff && diffData.hasBaseline) {
      const d = diffData.diff;
      histDetailDiffBar.innerHTML = `
        <span class="text-xs" style="color: #94a3b8;">基準差異 (相較 Baseline)：</span>
        <span class="diff-tag ${d.scoreDelta >= 0 ? 'positive' : 'negative'}">總分 ${d.scoreDelta >= 0 ? '+' : ''}${d.scoreDelta}</span>
        <span class="diff-tag ${d.tokensSaved ? 'positive' : d.tokensDelta === 0 ? 'neutral' : 'negative'}">Token ${d.tokensDelta < 0 ? '節省 ' : d.tokensDelta > 0 ? '+' : '持平 '}${Math.abs(d.tokensDelta)}</span>
        <span class="diff-tag ${d.recallDelta >= 0 ? 'positive' : 'negative'}">召回率 ${d.recallDelta >= 0 ? '+' : ''}${d.recallDelta}%</span>
      `;
      histDetailDiffBar.classList.remove('hidden');
    } else {
      histDetailDiffBar.innerHTML = '<span class="text-muted text-xs">📌 此版本為當前項目與目標之初始基準快照 (Baseline)</span>';
    }

    // 指標群
    if (mode === 'skill-eval') {
      histMetricLbl1.textContent = '領域召回率';
      const recall = report.discriminationResult?.recallRate ?? report.metrics?.recallRate ?? null;
      histMetricVal1.textContent = recall === null ? 'N/A' : `${recall}%`;
      histMetricLbl2.textContent = '抗干擾精確度';
      const precision = report.discriminationResult?.precisionRate ?? null;
      histMetricVal2.textContent = precision === null ? 'N/A' : `${precision}%`;
      histMetricLbl3.textContent = 'Token 消耗總計';
      histMetricVal3.textContent = `${report.metrics?.totalTokens ?? 0} tokens`;
      histMetricLbl4.textContent = '合規狀態';
      histMetricVal4.textContent = score >= 80 ? 'PASSED' : 'WARNING';
    } else {
      histMetricLbl1.textContent = '擊殺率 / 健康度';
      const killRate = report.scorecard?.metrics?.mutationKillRate ?? report.healthScore ?? null;
      histMetricVal1.textContent = killRate === null ? 'N/A' : `${killRate}%`;
      histMetricLbl2.textContent = '品質平均分';
      const qualityScore = report.scorecard?.metrics?.qualityScore ?? null;
      histMetricVal2.textContent = qualityScore === null ? 'N/A' : `${qualityScore} 分`;
      histMetricLbl3.textContent = 'Token 消耗';
      histMetricVal3.textContent = report.scorecard?.metrics?.totalTokens || 'N/A';
      histMetricLbl4.textContent = '驗證狀態';
      histMetricVal4.textContent = score >= 80 ? 'PASSED' : 'WARNING';
    }

    // 各測案明細
    const cases = report.caseComparisons || report.result?.caseComparisons || [];
    if (cases.length > 0) {
      histDetailCasesList.innerHTML = cases.map(c => `
        <div class="hist-case-card">
          <div class="hist-case-card-header">
            <span>${c.id}：${c.name}</span>
            <span class="badge ${c.status === 'PASS' ? 'badge-success' : c.status === 'FAIL' ? 'badge-danger' : 'badge-neutral'}">${c.status || 'PASS'}</span>
          </div>
          <div class="hist-case-io">
            <div><strong>輸入：</strong>${c.input || 'N/A'}</div>
            <div><strong>預期：</strong>${c.expected || 'N/A'}</div>
            ${c.actual ? `<div><strong>實測：</strong>${c.actual}</div>` : ''}
          </div>
        </div>
      `).join('');
    } else {
      histDetailCasesList.innerHTML = '<div class="text-muted text-xs">無個別測案明細數據</div>';
    }

    // 專家建議
    const insights = report.suggestions || report.scorecard?.insights || report.insights || [];
    histInsightsList.innerHTML = insights.map(i => `<li>${i}</li>`).join('') || '<li>無特殊建議</li>';
  } catch (e) {}
}

function pathBasename(p) {
  if (!p) return '';
  return p.split(/[\\/]/).filter(Boolean).pop() || p;
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
    state.projectsList = list;
    projectSelect.innerHTML = '';

    list.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.path;
      opt.textContent = `${item.name}`;
      projectSelect.appendChild(opt);
    });

    populateHistoryProjectOptions();

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
  updateDesktopAgentPrompt();
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
    updateNavHistoryBadge();
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

  updateNavHistoryBadge();
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
        <span class="case-type-badge">${c.type}</span>
        <span class="case-item-action-pill">[ 點選檢視細節 ➔ ]</span>
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
      payload.projectPath = state.currentProject;
      payload.skillPath = state.selectedSkill?.path;
      payload.skillName = state.selectedSkill?.name;
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
      payload.projectPath = state.currentProject;
      payload.harnessScript = 'npm run harness:check';
    }

    let res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    let runResult = await res.json();
    if (runResult.status === 'PENDING_AGENT') {
      flowStatusBadge.textContent = '等待 Agent 實際執行';
      flowStatusBadge.className = 'badge badge-warning';
      fseventStatus.textContent = `Agent 評測已排入佇列: ${runResult.jobId}`;
      const completed = await waitForAgentEvaluation(runResult.jobId, state.currentProject);
      const observations = new Map(completed.result.observations.map(item => [String(item.id), item]));
      payload.cases = completed.evaluationCases.map(testCase => {
        const observation = observations.get(String(testCase.id));
        return {
          ...testCase,
          input: testCase.query,
          triggered: observation.triggered,
          actualOutput: observation.output,
          promptTokens: observation.promptTokens,
          completionTokens: observation.completionTokens,
          tokenMeasurementStatus: observation.tokenMeasurementStatus,
          tokenMeasurementReason: observation.tokenMeasurementReason,
          latencyMs: observation.latencyMs,
          qualityChecks: observation.qualityChecks
        };
      });
      payload.agentEvaluation = false;
      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      runResult = await res.json();
    }
    if (!res.ok || runResult.error) {
      throw new Error(runResult.error || `HTTP ${res.status}`);
    }
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

    // 歷史存檔自動建檔反饋與跳轉按鈕設定
    const savedMeta = runResult.saved || (runResult.result && runResult.result.saved);
    const targetName = runResult.targetName || (state.activeMode === 'skill-eval' ? (state.selectedSkill?.name || 'skill') : getCurrentTargetName());
    if (savedMeta && scorecardHistoryArchiveBanner) {
      scorecardHistoryArchiveBanner.classList.remove('hidden');
      if (archiveRecordMeta) {
        archiveRecordMeta.textContent = `存檔編號：${savedMeta.recordId} | 模式：${state.activeMode} | 目標：${targetName}`;
      }
      if (btnJumpToHistory) {
        btnJumpToHistory.onclick = () => {
          state.history.project = state.currentProject;
          state.history.mode = state.activeMode;
          state.history.target = targetName;
          state.history.selectedRecordId = savedMeta.recordId;
          switchView('history');
        };
      }
    }
    updateNavHistoryBadge();

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

async function waitForAgentEvaluation(jobId, projectPath) {
  const deadline = Date.now() + (10 * 60 * 1000);
  while (Date.now() < deadline) {
    const url = `/api/agent-eval/status?projectPath=${encodeURIComponent(projectPath)}&jobId=${encodeURIComponent(jobId)}`;
    const response = await fetch(url);
    const status = await response.json();
    if (!response.ok || status.error) {
      throw new Error(status.error || `Agent 評測狀態查詢失敗: HTTP ${response.status}`);
    }
    if (status.status === 'COMPLETED') return status;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('等待 Agent 評測逾時（10 分鐘）');
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
    ${c.inputDesign ? `<div style="margin-top: 0.35rem; font-size: 0.76rem; color: var(--text-muted);"><strong>輸入設計：</strong>${c.inputDesign}</div>` : ''}
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
  const confidence = conf.score || c.actual?.match(/\d+%/)?.[0] || 'N/A';
  inspectConfidenceBox.innerHTML = `
    <div><strong>${c.evidenceType === 'ROUTER_OBSERVATION' ? '路由觀測：' : '啟發式信心度：'}</strong> <span class="badge badge-accent">${c.evidenceType === 'ROUTER_OBSERVATION' ? conf.verdict : confidence}</span>${c.evidenceType === 'ROUTER_OBSERVATION' || confidence === 'N/A' ? '' : ' (判定門檻: 35%)'}</div>
    <div style="margin-top: 0.35rem; font-size: 0.75rem; color: #cbd5e1;">
      ${conf.explanation || c.delta || '語意特徵符合目標範圍。'}
    </div>
  `;

  // 個別測案 Token 消耗明細
  const token = c.tokenBreakdown;
  const tokenMeasurement = c.tokenMeasurement || { status: 'UNAVAILABLE', reason: 'Agent runtime 未提供 Token 使用量。', latencyMs: null };
  inspectTokenTable.innerHTML = token ? `
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
  ` : `
    <div class="token-stat-row">
      <span>Token 計量狀態：</span>
      <code>${tokenMeasurement.status}</code>
    </div>
    <div class="token-stat-row">
      <span>原因：</span>
      <strong>${tokenMeasurement.reason}</strong>
    </div>
    <div class="token-stat-row">
      <span>執行延遲：</span>
      <code>${Number.isFinite(tokenMeasurement.latencyMs) ? tokenMeasurement.latencyMs + ' ms' : 'N/A'}</code>
    </div>
  `;

  // 產出結果預覽
  inspectOutput.textContent = c.simulatedOutput || c.actual || '尚未執行';

  // 產出品質評審
  const quality = c.qualityEvaluation || { score: 'N/A', rating: 'NOT_EVALUATED', summary: '未取得可驗證的 Agent 產出證據。' };
  inspectQualityBox.innerHTML = `
    <div class="flex-between">
      <div><strong>產出品質評分：</strong> <span class="score-pill">${quality.score} / 100 [${quality.rating}]</span></div>
      <span class="badge ${quality.score === 'N/A' ? 'badge-neutral' : 'badge-success'}">${quality.formatCompliance || quality.rating}</span>
    </div>
    <div style="margin-top: 0.4rem; font-size: 0.75rem; color: #cbd5e1;">
      ${quality.summary}
    </div>
  `;
}

// 8. 計分卡渲染
function renderScorecard(data) {
  const scorecard = data.scorecard || {
    overallScore: data.metrics?.overallScore ?? data.healthScore ?? null,
    rating: data.status || 'INCONCLUSIVE',
    metrics: {
      mutationKillRate: data.metrics?.recallRate ?? null,
      qualityScore: data.metrics?.averageQualityScore ?? null,
      totalTokens: data.metrics?.totalTestTokens ?? null
    },
    insights: data.suggestions || ['缺少可驗證證據，未產生評分。']
  };

  overallScorePill.textContent = `${scorecard.overallScore === null ? 'N/A' : scorecard.overallScore + ' / 100'} ${scorecard.rating}`;
  metricVal1.textContent = scorecard.metrics.mutationKillRate === null ? 'N/A' : `${scorecard.metrics.mutationKillRate}%`;
  metricVal2.textContent = scorecard.metrics.qualityScore === null ? 'N/A' : `${scorecard.metrics.qualityScore} 分`;
  const tokenMeasurement = data.metrics?.tokenMeasurement;
  metricVal3.textContent = scorecard.metrics.totalTokens || (tokenMeasurement?.status === 'UNAVAILABLE' ? 'N/A (Runtime 未提供)' : 'N/A');
  metricVal3.title = tokenMeasurement?.reasons?.join('\n') || '';
  metricVal4.textContent = data.status || scorecard.status || scorecard.rating || 'INCONCLUSIVE';

  if (state.activeMode === 'skill-eval') {
    metricLbl1.textContent = data.status === 'MEASURED' ? '實測召回率' : '啟發式命中率';
    metricLbl2.textContent = '產出品質平均分';
    metricLbl3.textContent = '本次實測總消耗';
    metricLbl4.textContent = '證據狀態';
  }

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
