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
  activeEvaluationId: null,
  evaluationStartedAt: null,
  evaluationProgress: null,
  caseView: {
    query: '',
    status: 'all',
    page: 1,
    pageSize: 25
  },
  projectsList: [], // 全域專案清單
  // 獨立歷史紀錄中心篩選與暫存狀態
  history: {
    project: null,
    mode: 'all',
    target: 'all',
    allRecords: [],
    selectedRecordId: null
  },
  // 模式 A 路徑範圍選測狀態
  diffPathScope: {
    sourceMode: 'project', // 'project' (專案檔案) | 'diff' (Git Diff)
    isCustom: false, // true 時表示勾選自訂範圍
    rawFiles: [],
    appliedSelectedPaths: new Set(),
    appliedGlobText: '',
    draftSelectedPaths: new Set(),
    draftGlobText: '',
    hideNonE2E: true, // 預設隱藏非 E2E 測試目錄與檔案 (.github, .claude, env...)
    lastLoadRequestId: 0
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
const projectPathInput = document.getElementById('projectPathInput');
const browseFolderBtn = document.getElementById('browseFolderBtn');
const btnLoadProject = document.getElementById('btnLoadProject');
const projectSuggestions = document.getElementById('projectSuggestions');
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
const clearSkillBtn = document.getElementById('clearSkillBtn');
const toggleDropdownBtn = document.getElementById('toggleDropdownBtn');
const autocompleteDropdown = document.getElementById('autocompleteDropdown');
const btnGenerateFlow = document.getElementById('btnGenerateFlow');

// 模式 A 路徑範圍選測節點
const diffScopeControlGroup = document.getElementById('diffScopeControlGroup');
const diffSegmentedControl = document.getElementById('diffSegmentedControl');
const btnScopeModeProject = document.getElementById('btnScopeModeProject');
const btnScopeModeDiff = document.getElementById('btnScopeModeDiff');
const btnScopeModeCustom = document.getElementById('btnScopeModeCustom');
const diffScopeSummaryBar = document.getElementById('diffScopeSummaryBar');
const diffScopeSummaryText = document.getElementById('diffScopeSummaryText');
const btnOpenScopeModal = document.getElementById('btnOpenScopeModal');

// 模式 A Scope Modal 節點
const scopeModalOverlay = document.getElementById('scopeModalOverlay');
const scopeModalDialog = document.getElementById('scopeModalDialog');
const btnCloseScopeModal = document.getElementById('btnCloseScopeModal');
const modalSelectedCountBadge = document.getElementById('modalSelectedCountBadge');
const chkHideNonE2E = document.getElementById('chkHideNonE2E');
const btnModalSelectAll = document.getElementById('btnModalSelectAll');
const btnModalClear = document.getElementById('btnModalClear');
const modalDiffTreeContainer = document.getElementById('modalDiffTreeContainer');
const btnToggleGlobAccordion = document.getElementById('btnToggleGlobAccordion');
const modalGlobContent = document.getElementById('modalGlobContent');
const modalGlobInput = document.getElementById('modalGlobInput');
const modalScopeAlert = document.getElementById('modalScopeAlert');
const modalScopeAlertText = document.getElementById('modalScopeAlertText');
const btnCancelScopeModal = document.getElementById('btnCancelScopeModal');
const btnApplyScopeModal = document.getElementById('btnApplyScopeModal');

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
const flowColPipeline = document.getElementById('flowColPipeline');
const flowStatusBadge = document.getElementById('flowStatusBadge');
const functionFlowContainer = document.getElementById('functionFlowContainer');
const casesSection = document.getElementById('casesSection');
const casesCountBadge = document.getElementById('casesCountBadge');
const caseMasterList = document.getElementById('caseMasterList');
const caseResultsToolbar = document.getElementById('caseResultsToolbar');
const caseResultStats = document.getElementById('caseResultStats');
const caseSearchInput = document.getElementById('caseSearchInput');
const caseStatusFilter = document.getElementById('caseStatusFilter');
const casePrevPage = document.getElementById('casePrevPage');
const caseNextPage = document.getElementById('caseNextPage');
const casePageInfo = document.getElementById('casePageInfo');
const actionTriggerSection = document.getElementById('actionTriggerSection');
const btnExecutePlan = document.getElementById('btnExecutePlan');
const desktopAgentPromptPanel = document.getElementById('desktopAgentPromptPanel');
const desktopAgentPromptText = document.getElementById('desktopAgentPromptText');
const btnCopyAgentPrompt = document.getElementById('btnCopyAgentPrompt');
const copyAgentPromptLabel = document.getElementById('copyAgentPromptLabel');

// 測案詳細檢視器 (Inspector Popover)
const caseInspectorPopover = document.getElementById('caseInspectorPopover');
const btnCloseInspectorPopover = document.getElementById('btnCloseInspectorPopover');
const caseInspectorBackdrop = document.getElementById('caseInspectorBackdrop');
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
const remediationBox = document.getElementById('remediationBox');
const remediationActions = document.getElementById('remediationActions');
const remediationPromptText = document.getElementById('remediationPromptText');
const btnCopyRemediationPrompt = document.getElementById('btnCopyRemediationPrompt');
const copyRemediationPromptLabel = document.getElementById('copyRemediationPromptLabel');

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

  // 工作區專案路徑選取、輸入與瀏覽
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      const p = state.currentProject || getProjectPathInputValue();
      if (p) selectProject(p);
    });
  }
  if (btnLoadProject) {
    btnLoadProject.addEventListener('click', () => {
      const p = getProjectPathInputValue();
      if (p) selectProject(p);
    });
  }
  if (projectPathInput) {
    projectPathInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const p = getProjectPathInputValue();
        if (p) selectProject(p);
      }
    });
  }
  if (browseFolderBtn) {
    browseFolderBtn.addEventListener('click', browseFolder);
  }
  if (caseSearchInput) {
    caseSearchInput.addEventListener('input', () => {
      state.caseView.query = caseSearchInput.value.trim().toLowerCase();
      state.caseView.page = 1;
      renderCaseBlocks(state.currentCases);
    });
  }
  if (caseStatusFilter) {
    caseStatusFilter.addEventListener('change', () => {
      state.caseView.status = caseStatusFilter.value;
      state.caseView.page = 1;
      renderCaseBlocks(state.currentCases);
    });
  }
  casePrevPage?.addEventListener('click', () => {
    state.caseView.page = Math.max(1, state.caseView.page - 1);
    renderCaseBlocks(state.currentCases);
  });
  caseNextPage?.addEventListener('click', () => {
    state.caseView.page += 1;
    renderCaseBlocks(state.currentCases);
  });

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
      const modeChanged = state.activeMode !== btn.dataset.mode;
      modeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeMode = btn.dataset.mode;
      updateModeView({ clearCases: modeChanged });
    });
  });

  // 模式 A 路徑範圍控制項與 Modal 事件
  btnScopeModeProject?.addEventListener('click', () => setScopeMode('project'));
  btnScopeModeDiff?.addEventListener('click', () => setScopeMode('diff'));
  btnScopeModeCustom?.addEventListener('click', () => setScopeMode('custom'));
  btnOpenScopeModal?.addEventListener('click', openScopeModal);

  btnCloseScopeModal?.addEventListener('click', cancelScopeModal);
  btnCancelScopeModal?.addEventListener('click', cancelScopeModal);
  btnApplyScopeModal?.addEventListener('click', applyScopeModal);
  btnModalSelectAll?.addEventListener('click', selectAllModalPaths);
  btnModalClear?.addEventListener('click', clearAllModalPaths);

  if (chkHideNonE2E) {
    chkHideNonE2E.checked = state.diffPathScope.hideNonE2E;
    chkHideNonE2E.addEventListener('change', () => {
      state.diffPathScope.hideNonE2E = chkHideNonE2E.checked;
      renderModalDiffTree();
      updateModalDraftBadge();
    });
  }

  scopeModalOverlay?.addEventListener('click', e => {
    if (e.target === scopeModalOverlay) {
      cancelScopeModal();
    }
  });

  btnToggleGlobAccordion?.addEventListener('click', () => {
    const isExpanded = btnToggleGlobAccordion.getAttribute('aria-expanded') === 'true';
    btnToggleGlobAccordion.setAttribute('aria-expanded', !isExpanded);
    modalGlobContent?.classList.toggle('hidden', isExpanded);
  });

  // 概念說明展開/收合
  toggleConceptBtn.addEventListener('click', () => {
    const isHidden = conceptBody.classList.toggle('hidden');
    toggleConceptBtn.textContent = isHidden ? '[ + 展開 ]' : '[ - 收合 ]';
  });

  // Skill 下拉選單與清除按鈕
  skillSearchInput.addEventListener('focus', openSkillDropdown);
  skillSearchInput.addEventListener('input', () => {
    updateSkillClearBtn();
    if (!skillSearchInput.value.trim()) {
      state.selectedSkill = null;
    }
    openSkillDropdown();
    renderAutocompleteOptions(skillSearchInput.value);
  });
  skillSearchInput.addEventListener('keydown', handleDropdownKeynav);

  if (clearSkillBtn) {
    clearSkillBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearSkillSelection();
      skillSearchInput.focus();
    });
  }

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
  btnCopyRemediationPrompt.addEventListener('click', copyRemediationPrompt);

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

  // 關閉浮動測案檢視視窗
  if (btnCloseInspectorPopover) {
    btnCloseInspectorPopover.addEventListener('click', () => {
      closeCaseInspector();
    });
  }

  if (caseInspectorBackdrop) {
    caseInspectorBackdrop.addEventListener('click', () => {
      closeCaseInspector();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && caseInspectorPopover && !caseInspectorPopover.classList.contains('hidden')) {
      closeCaseInspector();
    }
  });

  document.addEventListener('click', (e) => {
    if (!caseInspectorPopover || caseInspectorPopover.classList.contains('hidden')) return;
    if (caseInspectorPopover.contains(e.target)) return;
    if (e.target.closest && e.target.closest('.case-item-card')) return;
    closeCaseInspector();
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
        leftCard.querySelector('.case-item-top, .compact-case-heading')?.appendChild(customTag);
      }
    } else if (customTag) {
      customTag.remove();
    }
  }
}

// 2. 模式視圖切換
function updateSentinelStatus(message = null, isAttention = false) {
  const modeLabels = {
    'diff-e2e': '本機變異測試',
    'skill-eval': 'FSEvents 哨兵守候中 (0 Token)',
    'harness-eval': '本機 Harness 健檢'
  };
  fseventStatus.textContent = message || modeLabels[state.activeMode];
  fseventDot.style.backgroundColor = isAttention ? '#f59e0b' : '#10b981';
}

function updateModeView({ clearCases = false } = {}) {
  if (clearCases) clearCaseResults();
  const isSkillMode = state.activeMode === 'skill-eval';
  skillSelectorGroup.classList.toggle('hidden', !isSkillMode);
  modeGenericHeader.classList.toggle('hidden', isSkillMode);
  desktopAgentPromptPanel.classList.toggle('hidden', !isSkillMode);
  updateDesktopAgentPrompt();
  updateSentinelStatus();

  if (!isSkillMode) {
    if (state.activeMode === 'diff-e2e') {
      genericModeTag.textContent = 'E2E';
      genericModeDesc.textContent = '針對代碼修改局部合成暫存探針並執行變異擊殺測試';
    } else {
      genericModeTag.textContent = '模式 C: Harness 健檢';
      genericModeDesc.textContent = '實體故障破壞注入與多回合環境隔離性 (Idempotency) 檢定';
    }
  }

  const isDiffMode = state.activeMode === 'diff-e2e';
  diffSegmentedControl?.classList.toggle('hidden', !isDiffMode);
  if (diffScopeControlGroup) {
    diffScopeControlGroup.classList.toggle('hidden', !isDiffMode);
    if (isDiffMode && state.currentProject && state.diffPathScope.rawFiles.length === 0) {
      loadScopeFiles(state.currentProject);
    }
  }

  // 重設執行狀態
  casesSection.classList.add('hidden');
  if (actionTriggerSection) actionTriggerSection.classList.add('hidden');
  if (btnExecutePlan) btnExecutePlan.disabled = true;
  closeCaseInspector();
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

async function copyRemediationPrompt() {
  try {
    await navigator.clipboard.writeText(remediationPromptText.value);
  } catch (error) {
    remediationPromptText.select();
    document.execCommand('copy');
  }
  copyRemediationPromptLabel.textContent = '已複製';
  setTimeout(() => {
    copyRemediationPromptLabel.textContent = '複製 AI 修正 Prompt';
  }, 1800);
}

// 模式 A: 路徑範圍選測 (Path Scoped Selection) 輔助邏輯
function invalidateScopePreview() {
  if (state.activeMode !== 'diff-e2e') return;
  if (state.currentCases.length > 0 || !casesSection.classList.contains('hidden')) {
    clearCaseResults();
    casesSection.classList.add('hidden');
    if (actionTriggerSection) actionTriggerSection.classList.add('hidden');
    if (btnExecutePlan) btnExecutePlan.disabled = true;
    closeCaseInspector();
    scorecardSection.classList.add('hidden');
    flowStatusBadge.textContent = '範圍已變更，請重新生成測案';
    flowStatusBadge.className = 'badge badge-warning';
  }
}

function createSvgIcon(type) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.classList.add('tree-icon');

  if (type === 'chevron') {
    svg.classList.add('tree-chevron');
    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', '9 18 15 12 9 6');
    svg.appendChild(polyline);
  } else if (type === 'folder') {
    svg.classList.add('tree-folder');
    const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl.setAttribute('d', 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z');
    svg.appendChild(pathEl);
  } else if (type === 'folder-open') {
    svg.classList.add('tree-folder-open');
    const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl.setAttribute('d', 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z');
    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', '2 10 22 10');
    svg.appendChild(pathEl);
    svg.appendChild(polyline);
  } else if (type === 'file') {
    svg.classList.add('tree-file');
    const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl.setAttribute('d', 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z');
    const poly1 = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    poly1.setAttribute('points', '14 2 14 8 20 8');
    const poly2 = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    poly2.setAttribute('points', '10 13 8 15 10 17');
    const poly3 = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    poly3.setAttribute('points', '14 13 16 15 14 17');
    svg.appendChild(pathEl);
    svg.appendChild(poly1);
    svg.appendChild(poly2);
    svg.appendChild(poly3);
  }

  return svg;
}

function updateSegmentedControlUI() {
  const isCustom = state.diffPathScope.isCustom;
  const sourceMode = state.diffPathScope.sourceMode;
  btnScopeModeProject?.classList.toggle('active', !isCustom && sourceMode === 'project');
  btnScopeModeDiff?.classList.toggle('active', !isCustom && sourceMode === 'diff');
  btnScopeModeCustom?.classList.toggle('active', isCustom);
}

function updateSummaryBarUI() {
  if (!diffScopeSummaryText) return;
  const total = state.diffPathScope.rawFiles.length;
  if (!state.diffPathScope.isCustom) {
    if (state.diffPathScope.sourceMode === 'project') {
      diffScopeSummaryText.textContent = `全部 ${total} 個可測檔案`;
    } else {
      diffScopeSummaryText.textContent = `全部 ${total} 個變更檔案`;
    }
    btnOpenScopeModal?.classList.add('hidden');
  } else {
    const selected = state.diffPathScope.appliedSelectedPaths.size;
    diffScopeSummaryText.textContent = `已選 ${selected} / ${total} 個檔案`;
    btnOpenScopeModal?.classList.remove('hidden');
  }
}

async function setScopeMode(newMode) {
  if (newMode === 'project') {
    const changed = state.diffPathScope.sourceMode !== 'project' || state.diffPathScope.isCustom;
    state.diffPathScope.sourceMode = 'project';
    state.diffPathScope.isCustom = false;
    state.diffPathScope.appliedGlobText = '';
    if (state.currentProject) {
      await loadScopeFiles(state.currentProject, 'project');
    }
    state.diffPathScope.appliedSelectedPaths = new Set(state.diffPathScope.rawFiles.map(f => f.filePath));
    updateSegmentedControlUI();
    updateSummaryBarUI();
    if (changed) {
      invalidateScopePreview();
    }
  } else if (newMode === 'diff') {
    const changed = state.diffPathScope.sourceMode !== 'diff' || state.diffPathScope.isCustom;
    state.diffPathScope.sourceMode = 'diff';
    state.diffPathScope.isCustom = false;
    state.diffPathScope.appliedGlobText = '';
    if (state.currentProject) {
      await loadScopeFiles(state.currentProject, 'diff');
    }
    state.diffPathScope.appliedSelectedPaths = new Set(state.diffPathScope.rawFiles.map(f => f.filePath));
    updateSegmentedControlUI();
    updateSummaryBarUI();
    if (changed) {
      invalidateScopePreview();
    }
  } else if (newMode === 'custom') {
    openScopeModal();
  }
}

let previouslyFocusedElement = null;

function trapFocusInModal(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    cancelScopeModal();
    return;
  }
  if (e.key === 'Tab') {
    if (!scopeModalDialog) return;
    const focusable = Array.from(scopeModalDialog.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )).filter(el => !el.disabled && el.offsetParent !== null);

    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
}

function openScopeModal() {
  if (!scopeModalOverlay) return;
  previouslyFocusedElement = document.activeElement;

  state.diffPathScope.draftSelectedPaths = new Set(state.diffPathScope.appliedSelectedPaths);
  state.diffPathScope.draftGlobText = state.diffPathScope.appliedGlobText;
  if (modalGlobInput) {
    modalGlobInput.value = state.diffPathScope.draftGlobText;
  }
  if (chkHideNonE2E) {
    chkHideNonE2E.checked = state.diffPathScope.hideNonE2E;
  }

  renderModalDiffTree();
  updateModalDraftBadge();

  scopeModalOverlay.classList.remove('hidden');
  document.body.classList.add('modal-open');
  document.addEventListener('keydown', trapFocusInModal);

  requestAnimationFrame(() => {
    btnCloseScopeModal?.focus();
  });
}

function closeScopeModal() {
  if (!scopeModalOverlay) return;
  scopeModalOverlay.classList.add('hidden');
  document.body.classList.remove('modal-open');
  document.removeEventListener('keydown', trapFocusInModal);
  if (previouslyFocusedElement && typeof previouslyFocusedElement.focus === 'function') {
    previouslyFocusedElement.focus();
  }
}

function cancelScopeModal() {
  updateSegmentedControlUI();
  updateSummaryBarUI();
  closeScopeModal();
}

const NON_E2E_DIR_PARTS = new Set([
  '.github',
  '.claude',
  '.gemini',
  '.cursor',
  '.vscode',
  'env',
  'venv',
  '.venv',
  '.idea',
  '.husky'
]);

function isNonE2EPath(filePath) {
  if (!filePath) return false;
  const parts = filePath.split('/');
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (NON_E2E_DIR_PARTS.has(part)) return true;
    if (i === parts.length - 1 && (part.startsWith('.env') || part === '.gitignore' || part === '.npmrc')) {
      return true;
    }
  }
  return false;
}

function getVisibleModalFiles() {
  const files = state.diffPathScope.rawFiles || [];
  if (!state.diffPathScope.hideNonE2E) return files;
  return files.filter(f => !isNonE2EPath(f.filePath));
}

function applyScopeModal() {
  const visibleFiles = getVisibleModalFiles();
  const selectedCount = visibleFiles.filter(f => state.diffPathScope.draftSelectedPaths.has(f.filePath)).length;
  if (selectedCount === 0) {
    if (modalScopeAlert) {
      modalScopeAlert.classList.remove('hidden');
      modalScopeAlertText.textContent = '請至少選取一個檔案或符合條件的 pattern。';
    }
    return;
  }

  state.diffPathScope.appliedSelectedPaths = new Set(
    Array.from(state.diffPathScope.draftSelectedPaths).filter(p => !state.diffPathScope.hideNonE2E || !isNonE2EPath(p))
  );
  state.diffPathScope.appliedGlobText = (modalGlobInput?.value || '').trim();
  state.diffPathScope.isCustom = true;

  updateSegmentedControlUI();
  updateSummaryBarUI();
  closeScopeModal();
  invalidateScopePreview();
}

function renderModalDiffTree() {
  if (!modalDiffTreeContainer) return;
  modalDiffTreeContainer.replaceChildren();

  const files = getVisibleModalFiles();
  if (!files || files.length === 0) {
    const hint = document.createElement('p');
    hint.className = 'empty-hint';
    hint.textContent = state.diffPathScope.sourceMode === 'project'
      ? '專案中無任何可測試的原始碼檔案'
      : '本次無任何 Git 變更檔案';
    modalDiffTreeContainer.appendChild(hint);
    updateModalDraftBadge();
    return;
  }

  const root = { name: '', path: '', isDir: true, children: {} };

  for (const file of files) {
    const parts = file.filePath.split('/');
    let curr = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const subPath = parts.slice(0, i + 1).join('/');

      if (isFile) {
        curr.children[part] = {
          name: part,
          path: subPath,
          isDir: false,
          fileData: file
        };
      } else {
        if (!curr.children[part]) {
          curr.children[part] = {
            name: part,
            path: subPath,
            isDir: true,
            children: {}
          };
        }
        curr = curr.children[part];
      }
    }
  }

  const fragment = document.createDocumentFragment();
  let folderCounter = 0;

  function createTreeNodeElement(node) {
    const nodeEl = document.createElement('div');
    nodeEl.className = `diff-tree-node ${node.isDir ? 'diff-tree-folder' : 'diff-tree-file'}`;
    nodeEl.dataset.path = node.path;

    const rowEl = document.createElement('div');
    rowEl.className = 'diff-tree-row';

    if (node.isDir) {
      folderCounter++;
      const folderId = `tree-folder-${folderCounter}`;

      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'diff-tree-toggle-btn';
      toggleBtn.setAttribute('aria-expanded', 'false');
      toggleBtn.setAttribute('aria-controls', folderId);
      toggleBtn.setAttribute('aria-label', `展開或收合資料夾 ${node.name}`);

      const chevron = createSvgIcon('chevron');
      chevron.style.transform = 'rotate(0deg)';
      toggleBtn.appendChild(chevron);
      rowEl.appendChild(toggleBtn);

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'diff-tree-checkbox folder-checkbox';
      checkbox.dataset.path = node.path;
      rowEl.appendChild(checkbox);

      const folderIcon = createSvgIcon('folder');

      const label = document.createElement('span');
      label.className = 'diff-tree-label';
      label.appendChild(folderIcon);

      const nameSpan = document.createElement('span');
      nameSpan.className = 'diff-tree-filename';
      nameSpan.textContent = node.name;
      label.appendChild(nameSpan);

      rowEl.appendChild(label);
      nodeEl.appendChild(rowEl);

      const childrenContainer = document.createElement('div');
      childrenContainer.id = folderId;
      childrenContainer.className = 'diff-tree-children';
      childrenContainer.style.display = 'none';

      const childKeys = Object.keys(node.children).sort((a, b) => {
        const nodeA = node.children[a];
        const nodeB = node.children[b];
        if (nodeA.isDir !== nodeB.isDir) return nodeA.isDir ? -1 : 1;
        return a.localeCompare(b);
      });

      for (const k of childKeys) {
        childrenContainer.appendChild(createTreeNodeElement(node.children[k]));
      }

      nodeEl.appendChild(childrenContainer);

      let isExpanded = false;
      const toggleExpand = () => {
        isExpanded = !isExpanded;
        toggleBtn.setAttribute('aria-expanded', String(isExpanded));
        childrenContainer.style.display = isExpanded ? 'flex' : 'none';
        chevron.style.transform = isExpanded ? 'rotate(90deg)' : 'rotate(0deg)';
        const newFolderIcon = createSvgIcon(isExpanded ? 'folder-open' : 'folder');
        label.replaceChild(newFolderIcon, label.firstChild);
      };

      toggleBtn.addEventListener('click', e => {
        e.stopPropagation();
        toggleExpand();
      });

      toggleBtn.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          toggleExpand();
        }
      });

      checkbox.addEventListener('change', () => {
        const isChecked = checkbox.checked;
        checkbox.indeterminate = false;
        const descendantCheckboxes = nodeEl.querySelectorAll('.diff-tree-checkbox');
        descendantCheckboxes.forEach(cb => {
          cb.checked = isChecked;
          cb.indeterminate = false;
          if (!cb.classList.contains('folder-checkbox')) {
            if (isChecked) {
              state.diffPathScope.draftSelectedPaths.add(cb.dataset.path);
            } else {
              state.diffPathScope.draftSelectedPaths.delete(cb.dataset.path);
            }
          }
        });
        updateModalParentFolderStates();
        updateModalDraftBadge();
      });
    } else {
      const spacer = document.createElement('span');
      spacer.className = 'diff-tree-toggle';
      rowEl.appendChild(spacer);

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'diff-tree-checkbox file-checkbox';
      checkbox.dataset.path = node.path;
      checkbox.checked = state.diffPathScope.draftSelectedPaths.has(node.path);
      rowEl.appendChild(checkbox);

      const fileIcon = createSvgIcon('file');

      const label = document.createElement('span');
      label.className = 'diff-tree-label';
      label.title = node.path;
      label.appendChild(fileIcon);

      const nameSpan = document.createElement('span');
      nameSpan.className = 'diff-tree-filename';
      nameSpan.textContent = node.name;
      label.appendChild(nameSpan);

      if (node.fileData) {
        if (node.fileData.addedCount > 0) {
          const addedBadge = document.createElement('span');
          addedBadge.className = 'diff-tree-badge diff-badge-added';
          addedBadge.textContent = `+${node.fileData.addedCount}`;
          label.appendChild(addedBadge);
        }
        if (node.fileData.removedCount > 0) {
          const removedBadge = document.createElement('span');
          removedBadge.className = 'diff-tree-badge diff-badge-removed';
          removedBadge.textContent = `-${node.fileData.removedCount}`;
          label.appendChild(removedBadge);
        }
      }
      rowEl.appendChild(label);
      nodeEl.appendChild(rowEl);

      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          state.diffPathScope.draftSelectedPaths.add(node.path);
        } else {
          state.diffPathScope.draftSelectedPaths.delete(node.path);
        }
        updateModalParentFolderStates();
        updateModalDraftBadge();
      });
    }

    return nodeEl;
  }

  const rootKeys = Object.keys(root.children).sort((a, b) => {
    const nodeA = root.children[a];
    const nodeB = root.children[b];
    if (nodeA.isDir !== nodeB.isDir) return nodeA.isDir ? -1 : 1;
    return a.localeCompare(b);
  });

  for (const k of rootKeys) {
    fragment.appendChild(createTreeNodeElement(root.children[k]));
  }

  modalDiffTreeContainer.appendChild(fragment);
  updateModalParentFolderStates();
}

function updateModalParentFolderStates() {
  if (!modalDiffTreeContainer) return;
  const folderNodes = Array.from(modalDiffTreeContainer.querySelectorAll('.diff-tree-folder'));
  folderNodes.sort((a, b) => (b.dataset.path?.length || 0) - (a.dataset.path?.length || 0));

  for (const folder of folderNodes) {
    const folderCheckbox = folder.querySelector(':scope > .diff-tree-row > .folder-checkbox');
    if (!folderCheckbox) continue;
    const childrenContainer = folder.querySelector(':scope > .diff-tree-children');
    if (!childrenContainer) continue;

    const childCheckboxes = Array.from(childrenContainer.querySelectorAll(':scope > .diff-tree-node > .diff-tree-row > .diff-tree-checkbox'));
    if (childCheckboxes.length === 0) continue;

    const allChecked = childCheckboxes.every(cb => cb.checked && !cb.indeterminate);
    const allUnchecked = childCheckboxes.every(cb => !cb.checked && !cb.indeterminate);

    if (allChecked) {
      folderCheckbox.checked = true;
      folderCheckbox.indeterminate = false;
    } else if (allUnchecked) {
      folderCheckbox.checked = false;
      folderCheckbox.indeterminate = false;
    } else {
      folderCheckbox.checked = false;
      folderCheckbox.indeterminate = true;
    }
  }
}

function updateModalDraftBadge() {
  const visibleFiles = getVisibleModalFiles();
  const total = visibleFiles.length;
  const selected = visibleFiles.filter(f => state.diffPathScope.draftSelectedPaths.has(f.filePath)).length;
  if (modalSelectedCountBadge) {
    modalSelectedCountBadge.textContent = `已選 ${selected} / ${total} 個檔案`;
    modalSelectedCountBadge.className = selected > 0 ? 'badge badge-accent' : 'badge badge-neutral';
  }
  if (btnApplyScopeModal) {
    btnApplyScopeModal.disabled = selected === 0;
  }
  if (modalScopeAlert) {
    modalScopeAlert.classList.toggle('hidden', selected > 0);
  }
}

function selectAllModalPaths() {
  if (!modalDiffTreeContainer) return;
  const visibleFiles = getVisibleModalFiles();
  visibleFiles.forEach(f => state.diffPathScope.draftSelectedPaths.add(f.filePath));
  const checkboxes = modalDiffTreeContainer.querySelectorAll('.diff-tree-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = true;
    cb.indeterminate = false;
  });
  updateModalDraftBadge();
}

function clearAllModalPaths() {
  if (!modalDiffTreeContainer) return;
  const visibleFiles = getVisibleModalFiles();
  visibleFiles.forEach(f => state.diffPathScope.draftSelectedPaths.delete(f.filePath));
  const checkboxes = modalDiffTreeContainer.querySelectorAll('.diff-tree-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = false;
    cb.indeterminate = false;
  });
  updateModalDraftBadge();
}

async function loadScopeFiles(projectPath, requestedSourceMode = null) {
  if (!projectPath) return;
  const sourceMode = requestedSourceMode || state.diffPathScope.sourceMode;
  const reqId = ++state.diffPathScope.lastLoadRequestId;

  try {
    const endpoint = sourceMode === 'project' ? '/api/inspect/project-files' : '/api/inspect/diff';
    const bodyPayload = sourceMode === 'project'
      ? { projectPath }
      : { projectPath, scope: 'all' };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (reqId !== state.diffPathScope.lastLoadRequestId || state.currentProject !== projectPath) return;

    state.diffPathScope.rawFiles = data.files || [];
    state.diffPathScope.appliedSelectedPaths = new Set(state.diffPathScope.rawFiles.map(f => f.filePath));
    state.diffPathScope.appliedGlobText = '';

    updateSegmentedControlUI();
    updateSummaryBarUI();
  } catch (err) {
    if (reqId !== state.diffPathScope.lastLoadRequestId || state.currentProject !== projectPath) return;
    if (diffScopeSummaryText) {
      diffScopeSummaryText.textContent = `無法載入檔案: ${err.message}`;
    }
  }
}

function getModeAPathScopePayload() {
  if (state.activeMode !== 'diff-e2e') return null;
  if (!state.diffPathScope.isCustom) return null;

  const selectedFiles = Array.from(state.diffPathScope.appliedSelectedPaths);
  const globText = (state.diffPathScope.appliedGlobText || '').trim();

  const includePatterns = [];
  const excludePatterns = [];
  if (globText) {
    const lines = globText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (line.startsWith('!')) {
        excludePatterns.push(line.slice(1).trim());
      } else {
        includePatterns.push(line);
      }
    }
  }

  return {
    selectedPaths: selectedFiles,
    includePatterns,
    excludePatterns
  };
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

  const seenPaths = new Set();
  const allProjects = [];

  if (state.currentProject) {
    const projName = state.profile?.name || (state.currentProject.split(/[/\\]/).filter(Boolean).pop() || state.currentProject);
    allProjects.push({ name: projName, path: state.currentProject });
    seenPaths.add(state.currentProject);
  }

  const recent = getRecentProjects();
  recent.forEach(r => {
    if (!seenPaths.has(r.path)) {
      seenPaths.add(r.path);
      allProjects.push(r);
    }
  });

  (state.projectsList || []).forEach(p => {
    if (!seenPaths.has(p.path)) {
      seenPaths.add(p.path);
      allProjects.push(p);
    }
  });

  allProjects.forEach(p => {
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
        <span class="record-score score-pill">${item.overallScore === null ? 'N/A' : `${item.overallScore} 分`}</span>
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

    const score = report.overallScore ?? report.scorecard?.overallScore ?? report.metrics?.overallScore ?? report.healthScore ?? null;
    const rating = score === null ? 'INCONCLUSIVE' : (report.scorecard?.rating || (score >= 90 ? 'EXCELLENT' : score >= 80 ? 'GOOD' : 'NEEDS_ATTENTION'));

    if (histDetailTitle) histDetailTitle.textContent = `[${mode}] ${target} 評測歷史存檔`;
    if (histDetailTime) histDetailTime.textContent = `存檔編號: ${recordId} | 時間: ${report.savedAt ? report.savedAt.substring(0, 19).replace('T', ' ') : 'N/A'}`;
    if (histDetailScorePill) histDetailScorePill.textContent = score === null ? 'N/A [INCONCLUSIVE]' : `${score} / 100 [${rating}]`;

    // 差異標籤計算
    const diffRes = await fetch(`/api/history/diff?project=${encodeURIComponent(state.history.project)}&mode=${encodeURIComponent(mode)}&target=${encodeURIComponent(target)}&id=${encodeURIComponent(recordId)}`);
    const diffData = await diffRes.json();
    if (diffData.diff && diffData.hasBaseline) {
      const d = diffData.diff;
      histDetailDiffBar.innerHTML = `
        <span class="text-xs" style="color: #94a3b8;">基準差異 (相較 Baseline)：</span>
        <span class="diff-tag ${d.scoreDelta === null ? 'neutral' : d.scoreDelta >= 0 ? 'positive' : 'negative'}">總分 ${d.scoreDelta === null ? 'N/A' : `${d.scoreDelta >= 0 ? '+' : ''}${d.scoreDelta}`}</span>
        <span class="diff-tag ${d.tokensSaved ? 'positive' : d.tokensDelta === 0 ? 'neutral' : 'negative'}">Token ${d.tokensDelta < 0 ? '節省 ' : d.tokensDelta > 0 ? '+' : '持平 '}${Math.abs(d.tokensDelta)}</span>
        <span class="diff-tag ${d.recallDelta === null ? 'neutral' : d.recallDelta >= 0 ? 'positive' : 'negative'}">召回率 ${d.recallDelta === null ? 'N/A' : `${d.recallDelta >= 0 ? '+' : ''}${d.recallDelta}%`}</span>
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
      histMetricVal4.textContent = score === null ? 'INCONCLUSIVE' : (score >= 80 ? 'PASSED' : 'WARNING');
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
      histMetricVal4.textContent = score === null ? 'INCONCLUSIVE' : (score >= 80 ? 'PASSED' : 'WARNING');
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

function getModeFlow(mode = state.activeMode) {
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

  return flows[mode] || flows['diff-e2e'];
}

function renderInitialFunctionFlow() {
  renderFlowTrack(getModeFlow(), 0);
}

function renderFlowTrack(steps, completedUpTo = 0) {
  functionFlowContainer.innerHTML = steps.map((s, idx) => `
    <div class="flow-step-node ${idx < completedUpTo ? 'completed' : idx === completedUpTo ? 'active' : ''}">
      <div class="flow-node-header">
        <div class="flow-node-index">${idx < completedUpTo ? '✓' : s.step}</div>
        <strong class="flow-node-title">${s.name}</strong>
      </div>
      <div class="flow-node-desc">${s.desc}</div>
    </div>
    ${idx < steps.length - 1 ? '<div class="flow-arrow">&darr;</div>' : ''}
  `).join('');
}

// 3. 專案清單、路徑管理與選取
const RECENT_PROJECTS_KEY = 'test_sentinel_recent_projects';
const LAST_PROJECT_KEY = 'test_sentinel_last_project';

function getRecentProjects() {
  try {
    const raw = localStorage.getItem(RECENT_PROJECTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentProject(projPath, projName) {
  if (!projPath) return;
  try {
    let recent = getRecentProjects().filter(p => p.path !== projPath);
    recent.unshift({
      name: projName || (projPath.split(/[/\\]/).filter(Boolean).pop() || projPath),
      path: projPath
    });
    recent = recent.slice(0, 10);
    localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(recent));
    localStorage.setItem(LAST_PROJECT_KEY, projPath);
  } catch {}
}

async function browseFolder() {
  if (!browseFolderBtn) return;
  const originalHtml = browseFolderBtn.innerHTML;
  browseFolderBtn.disabled = true;
  try {
    const res = await fetch('/api/projects/choose-dialog', { method: 'POST' });
    const data = await res.json();
    if (res.status === 404 || data.error?.includes('API endpoint not found')) {
      alert('【需重啟服務】\n目前運行的 Test Sentinel 伺服器是在新增目錄選取功能前啟動的。\n請至終端按 Ctrl+C 結束，再重新執行 npm start 即會啟用資料夾選取功能。\n\n目前您可直接在「目標專案路徑」輸入框中輸入或貼上專案目錄路徑，點擊「載入專案資訊」即可！');
      if (projectPathInput) projectPathInput.focus();
      return;
    }
    if (data.path) {
      if (projectPathInput) projectPathInput.value = data.path;
      await selectProject(data.path);
    } else if (data.canceled) {
      // 使用者手動取消視窗
    } else if (data.error) {
      alert(`選取目錄失敗: ${data.error}。請直接在輸入框中貼上或輸入路徑。`);
      if (projectPathInput) projectPathInput.focus();
    }
  } catch (e) {
    alert(`無法開啟系統對話框: ${e.message}。請直接在輸入框中輸入路徑。`);
    if (projectPathInput) projectPathInput.focus();
  } finally {
    browseFolderBtn.disabled = false;
    browseFolderBtn.innerHTML = originalHtml;
  }
}

async function loadProjects() {
  try {
    const res = await fetch('/api/projects/list');
    const list = await res.json();
    state.projectsList = Array.isArray(list) ? list : [];

    populateHistoryProjectOptions();

    // 優先讀取上次使用的專案路徑，若無則使用清單中專案或當前目錄
    const lastProject = localStorage.getItem(LAST_PROJECT_KEY);
    const defaultProj = (lastProject && { path: lastProject })
      || state.projectsList.find(p => p.name.includes('當前') || p.name === 'test-sentinel')
      || state.projectsList[0];

    if (defaultProj && defaultProj.path) {
      if (projectPathInput) projectPathInput.value = defaultProj.path;
      await selectProject(defaultProj.path);
    }
  } catch (e) {
    projectInfo.innerHTML = `<p class="text-warning">專案載入失敗: ${e.message}</p>`;
  }
}

function getProjectPathInputValue() {
  const value = projectPathInput?.value.trim() || '';
  const selectedFolder = state.currentProject
    ? state.currentProject.split(/[/\\]/).filter(Boolean).pop()
    : '';
  if (state.currentProject && (value === state.profile?.name || value === selectedFolder)) {
    return state.currentProject;
  }
  return value || state.currentProject;
}

async function selectProject(projPath) {
  if (!projPath) return;
  const targetPath = projPath.trim();
  if (!targetPath) return;

  state.currentProject = targetPath;
  clearCaseResults();
  if (projectPathInput) {
    projectPathInput.value = targetPath;
  }
  updateDesktopAgentPrompt();
  clearSkillSelection();
  updateModeAvailability(null);
  projectInfo.innerHTML = '<p>掃描專案架構中...</p>';

  try {
    const res = await fetch('/api/projects/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectPath: targetPath })
    });
    const profile = await res.json();
    if (!res.ok || profile.error) {
      throw new Error(profile.error || `HTTP ${res.status}`);
    }
    if (state.currentProject !== targetPath) return;

    state.profile = profile;
    state.currentProject = profile.path || targetPath;
    if (projectPathInput) {
      projectPathInput.value = state.currentProject.split(/[/\\]/).filter(Boolean).pop() || state.currentProject;
      projectPathInput.title = state.currentProject;
    }
    state.skillsList = profile.skills || [];

    saveRecentProject(state.currentProject, profile.name);
    populateHistoryProjectOptions();

    renderProjectInfo(profile);
    updateModeAvailability(profile);
    renderAutocompleteOptions('');
    updateNavHistoryBadge();
    if (state.activeMode === 'diff-e2e') {
      state.diffPathScope.isCustom = false;
      state.diffPathScope.appliedGlobText = '';
      loadScopeFiles(state.currentProject);
    }
  } catch (e) {
    if (state.currentProject !== targetPath) return;
    projectInfo.innerHTML = `<p class="text-warning">掃描失敗: ${e.message}</p>`;
  }
}

function updateModeAvailability(profile) {
  const harnessButton = Array.from(modeButtons).find(button => button.dataset.mode === 'harness-eval');
  if (!harnessButton) return;

  const hasHarness = Boolean(profile?.harness?.hasHarness);
  harnessButton.classList.toggle('hidden', !hasHarness);
  harnessButton.setAttribute('aria-hidden', String(!hasHarness));

  if (!hasHarness && state.activeMode === 'harness-eval') {
    const fallbackButton = Array.from(modeButtons).find(button => button.dataset.mode === 'diff-e2e');
    modeButtons.forEach(button => button.classList.remove('active'));
    fallbackButton?.classList.add('active');
    state.activeMode = 'diff-e2e';
    updateModeView({ clearCases: true });
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

function updateSkillClearBtn() {
  if (!clearSkillBtn) return;
  const hasVal = Boolean(state.selectedSkill || (skillSearchInput && skillSearchInput.value.trim().length > 0));
  clearSkillBtn.classList.toggle('hidden', !hasVal);
}

function clearSkillSelection() {
  state.selectedSkill = null;
  if (skillSearchInput) {
    skillSearchInput.value = '';
  }
  updateSkillClearBtn();

  // 重設下層預覽
  if (casesSection) casesSection.classList.add('hidden');
  if (actionTriggerSection) actionTriggerSection.classList.add('hidden');
  if (btnExecutePlan) btnExecutePlan.disabled = true;
  closeCaseInspector();
  if (scorecardSection) scorecardSection.classList.add('hidden');

  updateNavHistoryBadge();
  renderAutocompleteOptions('');
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
  updateSkillClearBtn();

  // 重設下層預覽
  casesSection.classList.add('hidden');
  if (actionTriggerSection) actionTriggerSection.classList.add('hidden');
  if (btnExecutePlan) btnExecutePlan.disabled = true;
  closeCaseInspector();
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
  const requestMode = state.activeMode;
  const requestProject = state.currentProject;

  try {
    const pathScope = getModeAPathScopePayload();
    const payload = {
      mode: state.activeMode,
      projectPath: state.currentProject,
      skillPath: state.selectedSkill?.path,
      pathScope: pathScope || null,
      sourceMode: state.diffPathScope.sourceMode
    };

    const res = await fetch('/api/cases/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const previewData = await res.json();
    if (!res.ok || previewData.error) {
      throw new Error(previewData.error || `HTTP ${res.status}`);
    }
    if (requestMode !== state.activeMode || requestProject !== state.currentProject) return;
    state.currentCases = previewData.plannedCases || [];
    resetCaseResultsView();

    // 更新流程管線並顯示右欄
    flowColPipeline?.classList.remove('hidden');
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

    // 預設選取並載入第一個測案之細節 (浮動視窗預設關閉，點選時展開)
    if (state.currentCases.length > 0) {
      inspectCaseDetail(state.currentCases[0], null, false);
    }

    casesSection.classList.remove('hidden');
    actionTriggerSection.classList.remove('hidden');
    if (btnExecutePlan) btnExecutePlan.disabled = false;
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

function resetCaseResultsView() {
  state.caseView.query = '';
  state.caseView.status = 'all';
  state.caseView.page = 1;
  if (caseSearchInput) caseSearchInput.value = '';
  if (caseStatusFilter) caseStatusFilter.value = 'all';
}

function clearCaseResults() {
  state.currentCases = [];
  state.selectedCaseId = null;
  resetCaseResultsView();
  caseResultsToolbar?.classList.add('hidden');
  if (caseMasterList) caseMasterList.innerHTML = '';
  if (btnExecutePlan) btnExecutePlan.disabled = true;
  closeCaseInspector();
}

function renderCaseBlocks(cases) {
  const useCompactCards = state.activeMode === 'diff-e2e';
  const useBulkView = state.activeMode === 'diff-e2e' && cases.length > 10;
  caseResultsToolbar?.classList.toggle('hidden', !useBulkView);
  caseMasterList.classList.toggle('bulk-case-list', useBulkView);
  caseMasterList.classList.toggle('compact-case-list', useCompactCards);

  let visibleCases = cases;
  if (useBulkView) {
    const counts = cases.reduce((summary, testCase) => {
      summary[testCase.status] = (summary[testCase.status] || 0) + 1;
      return summary;
    }, {});
    caseResultStats.innerHTML = `
      <span><strong>${cases.length}</strong> 全部</span>
      <span class="text-success"><strong>${counts.PASS || 0}</strong> 已擊殺</span>
      <span class="text-warning"><strong>${counts.FAIL || 0}</strong> 存活</span>
      <span><strong>${counts.INCONCLUSIVE || 0}</strong> 無效</span>
    `;
    visibleCases = cases.filter(testCase => {
      const matchesStatus = state.caseView.status === 'all' || testCase.status === state.caseView.status;
      const searchable = `${testCase.id} ${testCase.name} ${testCase.input} ${testCase.delta}`.toLowerCase();
      return matchesStatus && searchable.includes(state.caseView.query);
    });
  }

  const totalPages = useBulkView ? Math.max(1, Math.ceil(visibleCases.length / state.caseView.pageSize)) : 1;
  state.caseView.page = Math.min(state.caseView.page, totalPages);
  const pageStart = (state.caseView.page - 1) * state.caseView.pageSize;
  const pageCases = useBulkView
    ? visibleCases.slice(pageStart, pageStart + state.caseView.pageSize)
    : visibleCases;
  if (useBulkView) {
    casePageInfo.textContent = `${visibleCases.length} 筆 · 第 ${state.caseView.page} / ${totalPages} 頁`;
    casePrevPage.disabled = state.caseView.page <= 1;
    caseNextPage.disabled = state.caseView.page >= totalPages;
  }

  const emptyMessage = cases.length === 0 ? '尚未生成測案' : '沒有符合條件的測案';
  caseMasterList.innerHTML = pageCases.length > 0 ? pageCases.map(c => useCompactCards ? `
    <div class="case-item-card compact-case-card ${c.status === 'FAIL' ? 'status-fail' : ''} ${state.selectedCaseId === c.id ? 'selected' : ''}" data-case-id="${c.id}">
      <div class="compact-case-heading">
        <span class="case-item-id">${c.id}</span>
        <span class="compact-case-divider">｜</span>
        <span class="compact-case-type">${c.type}</span>
      </div>
      <div class="compact-case-result">
        <span class="compact-case-summary">${c.name}：<strong class="compact-case-status status-${(c.status || '').toLowerCase()}">${c.status === 'PASS' ? 'Killed' : c.status === 'FAIL' ? 'Survived' : c.status === 'INCONCLUSIVE' ? 'Invalid' : '待執行'}</strong></span>
        <span class="case-item-action-pill">[檢視]</span>
      </div>
    </div>
  ` : `
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
  `).join('') : `<div class="case-results-empty">${emptyMessage}</div>`;

  // 點選卡片在項目右側彈出浮動視窗顯示細節
  caseMasterList.querySelectorAll('.case-item-card').forEach(card => {
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      const caseId = card.dataset.caseId;
      const targetCase = state.currentCases.find(item => item.id === caseId);
      if (targetCase) {
        inspectCaseDetail(targetCase, card, true);
      }
    });
  });
}

// 6. [第二階段] 批准測案並開始實體執行
function formatDuration(durationMs) {
  const totalSeconds = Math.max(0, Math.ceil(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes} 分 ${seconds} 秒` : `${seconds} 秒`;
}

function updateEvaluationProgressDisplay() {
  if (!state.evaluationProgress || !state.evaluationStartedAt) return;
  const { message, percent, estimatedMaxMs } = state.evaluationProgress;
  const elapsed = formatDuration(Date.now() - state.evaluationStartedAt);
  const limit = Number.isFinite(estimatedMaxMs)
    ? ` · 測試逾時上限約 ${formatDuration(estimatedMaxMs)}`
    : '';
  const text = `${message} (${percent}%) · 已執行 ${elapsed}${limit}`;
  flowStatusBadge.textContent = text;
  const buttonLabel = btnExecutePlan.querySelector('span');
  if (buttonLabel) buttonLabel.textContent = text;
}

async function executeTestFlow() {
  if (!state.currentProject) return;

  const evaluationId = globalThis.crypto?.randomUUID?.()
    && `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  state.activeEvaluationId = evaluationId;
  state.evaluationStartedAt = Date.now();
  state.evaluationProgress = { message: '準備執行', percent: 0, estimatedMaxMs: null };
  btnExecutePlan.disabled = true;
  btnExecutePlan.innerHTML = '<span>正在實體執行、破壞注入與比對品質...</span>';
  if (state.activeMode !== 'skill-eval') {
    flowStatusBadge.className = 'badge badge-warning';
    renderFlowTrack(getModeFlow(), 0);
    updateEvaluationProgressDisplay();
  }
  const progressTimer = state.activeMode === 'skill-eval'
    ? null
    : setInterval(updateEvaluationProgressDisplay, 1000);

  try {
    let endpoint = '/api/run/diff-e2e';
    const pathScope = getModeAPathScopePayload();
    let payload = {
      projectPath: state.currentProject,
      evaluationId,
      targetUrl: window.location.origin,
      pathScope: pathScope || null,
      sourceMode: state.diffPathScope.sourceMode,
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
    }

    let res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    let runResult = await res.json();
    if (!res.ok || runResult.error) {
      throw new Error(runResult.error || `HTTP ${res.status}`);
    }
    if (runResult.status === 'PENDING_AGENT') {
      flowStatusBadge.textContent = '等待 Agent 實際執行';
      flowStatusBadge.className = 'badge badge-warning';
      updateSentinelStatus(`Agent 評測已排入佇列: ${runResult.jobId}`, true);
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

    // 將實測結果覆蓋至測案清單；無量測證據時保留原規劃，避免誤顯示成尚未生成。
    const evaluatedCases = runResult.result?.caseComparisons || runResult.caseComparisons || [];
    const evaluationStatus = runResult.result?.status || runResult.status;
    const evaluationReason = runResult.result?.reason || runResult.reason || '本次未取得足夠證據。';
    if (evaluatedCases.length > 0) {
      state.currentCases = evaluatedCases;
    } else if (evaluationStatus === 'INCONCLUSIVE') {
      state.currentCases = state.currentCases.map(testCase => ({
        ...testCase,
        status: 'INCONCLUSIVE',
        actual: evaluationReason,
        evidenceType: 'NOT_MEASURED'
      }));
    } else {
      state.currentCases = [];
    }
    resetCaseResultsView();
    casesCountBadge.textContent = `${state.currentCases.length} 個測案`;

    // 更新流程管線狀態
    const isInconclusive = evaluationStatus === 'INCONCLUSIVE';
    flowStatusBadge.textContent = isInconclusive ? '實體檢定未完成 (Inconclusive)' : '實體檢定完成 (Verified)';
    flowStatusBadge.className = isInconclusive ? 'badge badge-warning' : 'badge badge-success';
    renderFlowTrack(getModeFlow(), isInconclusive ? 3 : 4);

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
    flowStatusBadge.textContent = '執行失敗';
    flowStatusBadge.className = 'badge badge-danger';
    alert(`執行失敗: ${e.message}`);
  } finally {
    if (progressTimer) clearInterval(progressTimer);
    if (state.activeEvaluationId === evaluationId) state.activeEvaluationId = null;
    state.evaluationStartedAt = null;
    state.evaluationProgress = null;
    btnExecutePlan.disabled = false;
    btnExecutePlan.innerHTML = `
      <svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="5 3 19 12 5 21 5 3"/>
      </svg>
      <span>3. 批准測案並開始實體執行</span>
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

// 7. 個別測案詳細資訊檢視器 (點選測案項目後在項目右側出現浮動視窗顯示細節)
function inspectCaseDetail(c, targetEl = null, openPopover = true) {
  state.selectedCaseId = c.id;

  // 高亮選取的卡片
  document.querySelectorAll('.case-item-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.caseId === c.id);
  });

  if (inspectorCaseTitle) inspectorCaseTitle.textContent = `${c.id}：${c.name}`;
  if (inspectorStatusBadge) {
    inspectorStatusBadge.textContent = c.status || '待執行';
    inspectorStatusBadge.className = `badge ${c.status === 'FAIL' ? 'badge-danger' : c.status === 'PASS' ? 'badge-success' : 'badge-neutral'}`;
  }

  if (inspectObjective) {
    inspectObjective.innerHTML = `
      <strong>檢測目的：</strong>${c.objective || c.delta || '驗證邊界輸入之模型決策與反應行為。'}
      ${c.inputDesign ? `<div style="margin-top: 0.35rem; font-size: 0.76rem; color: var(--text-muted);"><strong>輸入設計：</strong>${c.inputDesign}</div>` : ''}
      ${c.expected ? `<div style="margin-top: 0.35rem; font-size: 0.76rem; color: #a5f3fc;"><strong>預期反應 (Expected)：</strong>${c.expected}</div>` : ''}
    `;
  }

  // 設置可編輯的輸入框數值
  if (inspectInput) {
    inspectInput.value = c.input || '';
    if (!c.defaultInput) {
      c.defaultInput = c.input;
    }
    updateCustomInputStatus(c);
  }

  // 信心指數解析
  if (inspectConfidenceBox) {
    const conf = c.confidenceDetails || {};
    const confidence = conf.score || c.actual?.match(/\d+%/)?.[0] || 'N/A';
    inspectConfidenceBox.innerHTML = `
      <div><strong>${c.evidenceType === 'ROUTER_OBSERVATION' ? '路由觀測：' : '啟發式信心度：'}</strong> <span class="badge badge-accent">${c.evidenceType === 'ROUTER_OBSERVATION' ? conf.verdict : confidence}</span>${c.evidenceType === 'ROUTER_OBSERVATION' || confidence === 'N/A' ? '' : ' (判定門檻: 35%)'}</div>
      <div style="margin-top: 0.35rem; font-size: 0.75rem; color: #cbd5e1;">
        ${conf.explanation || c.delta || '語意特徵符合目標範圍。'}
      </div>
    `;
  }

  // 個別測案 Token 消耗明細
  if (inspectTokenTable) {
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
  }

  // 產出結果預覽
  if (inspectOutput) {
    inspectOutput.textContent = c.simulatedOutput || c.actual || '尚未執行';
  }

  // 產出品質評審
  if (inspectQualityBox) {
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

  if (openPopover && caseInspectorPopover) {
    caseInspectorPopover.classList.remove('hidden');
    positionInspectorPopover(targetEl);
  }
}

function positionInspectorPopover(targetEl) {
  if (!caseInspectorPopover) return;
  const popover = caseInspectorPopover;
  const popoverWidth = Math.min(640, window.innerWidth - 32);
  popover.style.width = `${popoverWidth}px`;

  if (targetEl && targetEl.getBoundingClientRect) {
    const rect = targetEl.getBoundingClientRect();
    let left = rect.right + 12;
    if (left + popoverWidth > window.innerWidth - 16) {
      if (rect.left - popoverWidth - 12 > 16) {
        left = rect.left - popoverWidth - 12;
      } else {
        left = Math.max(16, window.innerWidth - popoverWidth - 16);
      }
    }
    let top = rect.top;
    const popoverHeight = popover.offsetHeight || 480;
    if (top + popoverHeight > window.innerHeight - 16) {
      top = Math.max(16, window.innerHeight - popoverHeight - 16);
    }
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
  } else {
    const col03 = document.getElementById('col03Cases');
    if (col03) {
      const colRect = col03.getBoundingClientRect();
      let left = colRect.right + 12;
      if (left + popoverWidth > window.innerWidth - 16) {
        left = Math.max(16, window.innerWidth - popoverWidth - 16);
      }
      popover.style.left = `${Math.round(left)}px`;
      popover.style.top = `${Math.max(16, Math.min(colRect.top, window.innerHeight - 500))}px`;
    } else {
      popover.style.left = `${Math.max(16, window.innerWidth - popoverWidth - 32)}px`;
      popover.style.top = '72px';
    }
  }
}

function closeCaseInspector() {
  if (caseInspectorPopover) {
    caseInspectorPopover.classList.add('hidden');
  }
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
  metricVal3.title = '';

  if (state.activeMode === 'diff-e2e') {
    const killRate = scorecard.metrics?.mutationKillRate;
    const silentErrors = scorecard.metrics?.silentErrorsCaught;
    metricLbl1.textContent = '變異擊殺率';
    metricVal1.textContent = Number.isFinite(killRate) ? `${killRate}%` : 'N/A';
    metricLbl2.textContent = '未捕獲運行期錯誤';
    metricVal2.textContent = Number.isFinite(silentErrors) ? String(silentErrors) : 'N/A (未量測)';
    metricLbl3.textContent = 'Runtime 安全網證據';
    metricVal3.textContent = scorecard.evidence?.runtimeSafety || 'NOT_MEASURED';
    metricLbl4.textContent = '評測狀態';
    metricVal4.textContent = scorecard.status || scorecard.rating || 'INCONCLUSIVE';
  } else if (state.activeMode === 'skill-eval') {
    const tokenMeasurement = data.metrics?.tokenMeasurement;
    metricVal1.textContent = Number.isFinite(scorecard.metrics?.mutationKillRate) ? `${scorecard.metrics.mutationKillRate}%` : 'N/A';
    metricVal2.textContent = Number.isFinite(scorecard.metrics?.qualityScore) ? `${scorecard.metrics.qualityScore} 分` : 'N/A';
    metricVal3.textContent = scorecard.metrics?.totalTokens || (tokenMeasurement?.status === 'UNAVAILABLE' ? 'N/A (Runtime 未提供)' : 'N/A');
    metricVal3.title = tokenMeasurement?.reasons?.join('\n') || '';
    metricVal4.textContent = data.status || scorecard.status || scorecard.rating || 'INCONCLUSIVE';
    metricLbl1.textContent = data.status === 'MEASURED' ? '實測召回率' : '啟發式命中率';
    metricLbl2.textContent = '產出品質平均分';
    metricLbl3.textContent = '本次實測總消耗';
    metricLbl4.textContent = '證據狀態';
  } else {
    const checks = Array.isArray(data.checks) ? data.checks : [];
    const faultCheck = checks.find(check => check.name?.includes('Fault Sensitivity'));
    const idempotencyCheck = checks.find(check => check.name?.includes('Idempotency'));
    metricLbl1.textContent = 'Harness 健康度';
    metricVal1.textContent = Number.isFinite(data.healthScore) ? `${data.healthScore}%` : 'N/A';
    metricLbl2.textContent = '故障阻斷';
    metricVal2.textContent = faultCheck?.passed === true ? 'PASS' : (faultCheck?.passed === false ? 'FAIL' : 'NOT_EVALUATED');
    metricLbl3.textContent = '環境冪等性';
    metricVal3.textContent = idempotencyCheck?.passed === true ? 'PASS' : (idempotencyCheck?.passed === false ? 'FAIL' : 'NOT_EVALUATED');
    metricLbl4.textContent = '評測狀態';
    metricVal4.textContent = data.status || 'INCONCLUSIVE';
  }

  insightsList.innerHTML = (scorecard.insights || []).map(i => `<li>${i}</li>`).join('');

  const remediation = data.remediation || scorecard.remediation;
  const actions = Array.isArray(remediation?.actions) ? remediation.actions : [];
  remediationActions.replaceChildren(...actions.map(action => {
    const item = document.createElement('li');
    const priority = document.createElement('span');
    priority.className = `remediation-priority priority-${String(action.priority || 'MEDIUM').toLowerCase()}`;
    priority.textContent = action.priority || 'MEDIUM';
    const content = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = action.title;
    const detail = document.createElement('p');
    detail.textContent = action.detail;
    content.append(title, detail);
    item.append(priority, content);
    return item;
  }));
  remediationPromptText.value = remediation?.aiPrompt || '';
  remediationBox.classList.toggle('hidden', actions.length === 0 || !remediationPromptText.value);
}

// 9. SSE
function setupSSE() {
  const eventSource = new EventSource('/api/events');
  eventSource.addEventListener('evaluation_progress', event => {
    const data = JSON.parse(event.data);
    if (!state.activeEvaluationId || data.evaluationId !== state.activeEvaluationId) return;

    const percent = Number.isFinite(data.percent) ? data.percent : 0;
    state.evaluationProgress = {
      message: data.message,
      percent,
      estimatedMaxMs: Number.isFinite(data.estimatedMaxMs)
        ? data.estimatedMaxMs
        : state.evaluationProgress?.estimatedMaxMs
    };
    updateEvaluationProgressDisplay();
    flowStatusBadge.className = percent >= 100 ? 'badge badge-success' : 'badge badge-warning';
    renderFlowTrack(getModeFlow(data.mode), Math.max(0, Math.min(4, (data.step || 1) - 1)));
  });
  eventSource.addEventListener('project_change', event => {
    if (state.activeMode !== 'skill-eval') return;
    const data = JSON.parse(event.data);
    updateSentinelStatus(`檔案變更: ${data.filename} (即時喚醒)`, true);
    setTimeout(() => {
      updateSentinelStatus();
    }, 1500);
  });
}

window.addEventListener('DOMContentLoaded', init);
