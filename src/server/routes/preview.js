/**
 * preview.js - 測案預覽與目的解說生成器 (Step 1: Preview Before Run)
 */

const path = require('path');
const fs = require('fs');
const { DiffAnalyzer } = require('../../core/diff-analyzer');
const { SkillEvaluator } = require('../../core/modes/skill-evaluator');
const { HarnessAuditor } = require('../../core/modes/harness-auditor');

function getCasesPreview({ mode, projectPath, skillPath, harnessScript }) {
  const resolvedProject = path.resolve(projectPath);

  if (mode === 'diff-e2e') {
    const analyzer = new DiffAnalyzer(resolvedProject);
    const diffData = analyzer.getDiff('all');
    const mutations = diffData.files.flatMap(f => f.mutationCandidates);

    const standards = [
      {
        name: '變異擊殺鑑別度 (Mutation Sensitivity)',
        criterion: '當代碼關鍵條件 (如 ===, >, true) 被倒轉時，測試斷言必須能即時報錯 (Killed)，擊殺率需 >= 80%',
        target: 'Kill Rate >= 80%'
      },
      {
        name: '零靜默運行期崩潰 (Zero Silent Crashes)',
        criterion: '瀏覽器載入與點擊互動期間，嚴禁出現未捕獲的 pageerror 或 console.error',
        target: 'Uncaught Errors = 0'
      },
      {
        name: '零伺服器服務端異常 (Zero Server 5xx)',
        criterion: '所有後端 API 請求均需正常回應，不得出現 500/502/504 服務中斷',
        target: 'Server 5xx = 0'
      }
    ];

    const plannedCases = [
      {
        id: 'PLAN-DIFF-01',
        name: '快樂路徑 (Happy Path) 頁面渲染與互動',
        type: '行為健全性',
        objective: '驗證受變更影響的頁面在最基本的使用者流下能否完整渲染，防止因變更導致整頁白屏或載入卡死。',
        input: 'Playwright 造訪頁面，等待 networkidle 並嘗試主要點擊互動',
        expected: '頁面正常可見，所有基本 DOM 元件渲染就緒，無載入異常'
      },
      {
        id: 'PLAN-DIFF-02',
        name: '全域安全網：無聲崩潰監聽 (Silent Crash Watchdog)',
        type: '安全網審核',
        objective: '攔截所有前端未處理的例外 (TypeError、未定義屬性等) 與後端 500 錯誤，防止隱性錯誤流入生產環境。',
        input: '監聽 page.on(\'pageerror\')、console.error 與 response 狀態碼',
        expected: '未捕獲錯誤數 = 0 (Console 清淨，無 5xx 請求)'
      },
      {
        id: 'PLAN-DIFF-03',
        name: '變異反向攻擊：條件邏輯顛倒測試',
        type: '變異測試 (Mutation)',
        objective: '故意將變更程式碼中的條件反轉 (如 === 改為 !==)，檢驗測案是否具備「抓壞能力」，防止假陽性。',
        input: mutations.length > 0 ? `顛倒行: ${mutations[0].type}` : '故意顛倒條件判斷式 (=== -> !==)',
        expected: '測試斷言必須立即報錯攔截 (Killed)，證明測試具有真實鑑別力'
      },
      {
        id: 'PLAN-DIFF-04',
        name: '變異反向攻擊：布林值反向測試',
        type: '變異測試 (Mutation)',
        objective: '故意將狀態值 true/false 顛倒，驗證畫面或按鈕狀態切換是否受到嚴格斷言保護。',
        input: mutations.length > 1 ? `顛倒行: ${mutations[1].type}` : '翻轉布林真假值 (true -> false)',
        expected: '測試斷言必須立即報錯攔截 (Killed)，嚴禁代碼改壞測試依然 PASS'
      }
    ];

    return {
      mode: 'diff-e2e',
      modeTitle: '模式 A: Git Diff E2E 智慧測試與變異鑑別',
      targetSummary: `偵測到 ${diffData.files.length} 個變更檔案，共標記 ${mutations.length} 個變異測試候選點。`,
      standards,
      plannedCases
    };
  }

  if (mode === 'skill-eval') {
    const evaluator = new SkillEvaluator(resolvedProject);
    const fullSkillPath = path.resolve(resolvedProject, skillPath || 'SKILL.md');
    const content = fs.existsSync(fullSkillPath) ? fs.readFileSync(fullSkillPath, 'utf8') : '';
    const meta = evaluator.parseSkillMeta(content);
    const audit = evaluator.auditPromptWeight(content, meta);
    const suite = evaluator.generateBenchmarkSuite(meta);

    const standards = [
      {
        name: '領域召回率標準 (Recall Rate)',
        criterion: '針對領域內目標操作任務，觸發信心度需 >= 35%，召回率需達 100%',
        target: 'Recall = 100%'
      },
      {
        name: '抗干擾精確率標準 (Distractor Precision)',
        criterion: '面對無關或陷阱問題時，觸發信心度需 < 35%，精確率需達 100%',
        target: 'Precision = 100%'
      },
      {
        name: 'Context Token 負載標準',
        criterion: 'Skill 說明長度宜控制在 1,500 Tokens 以內，避免沖淡對話上下文',
        target: 'Tokens <= 1500'
      }
    ];

    const plannedCases = suite.map(c => ({
      id: `PLAN-SKILL-0${c.id}`,
      name: c.type === 'in-domain' ? '領域內任務召回測案' : '領域外干擾問題抑制測案',
      type: c.type === 'in-domain' ? '正向召回 (Recall)' : '負向抗干擾 (Precision)',
      objective: c.type === 'in-domain'
        ? `驗證當使用者提出與 [${meta.name}] 相關的操作需求時，Agent 能否正確自動啟用該 Skill。`
        : `驗證當使用者詢問無關或陷阱問題時，Agent 不會胡亂觸發該 Skill 浪費 Token 或干擾思維。`,
      input: c.query,
      expected: c.expectedTrigger ? '自動啟動該 Skill (信心度 >= 35%)' : '保持沉默 (信心度 < 35%)'
    }));

    return {
      mode: 'skill-eval',
      modeTitle: `模式 B: Skill 效益評測 [${meta.name || path.basename(skillPath)}]`,
      targetSummary: `目標檔案: ${skillPath} (${audit.estimatedTokens} tokens, 狀態: ${audit.status})`,
      standards,
      plannedCases
    };
  }

  if (mode === 'harness-eval') {
    const auditor = new HarnessAuditor(resolvedProject);
    const detectedCmd = harnessScript || auditor.detectHarnessCommand() || 'npm test';

    const standards = [
      {
        name: '正常基線標準 (Baseline Integrity)',
        criterion: '在正常無損壞環境下執行 Harness，Exit Code 必須為 0',
        target: 'Exit Code = 0'
      },
      {
        name: '故障敏銳阻斷標準 (Fault Sensitivity)',
        criterion: '關鍵資料或設定損壞時，腳本必須以非 0 狀態碼立即阻斷退出，嚴禁假陽性通過',
        target: 'Exit Code != 0 on failure'
      },
      {
        name: '環境隔離與無痕標準 (Idempotency)',
        criterion: '連續執行 Harness 兩次回合，磁碟中未被 .gitignore 忽略的殘留檔案數必須為 0',
        target: 'Residue Files = 0'
      }
    ];

    const plannedCases = [
      {
        id: 'PLAN-HARNESS-01',
        name: '正常環境基線順行測試',
        type: '正向基線',
        objective: '確認專案目前的 Harness 流程在無干擾的乾淨狀態下能正常順利通過。',
        input: `執行測試指令: ${detectedCmd}`,
        expected: 'Exit Code = 0 (正常順行，無異常中斷)'
      },
      {
        id: 'PLAN-HARNESS-02',
        name: '實體資料破壞注入阻斷測試 (Fault Injection)',
        type: '實體破壞注入',
        objective: '在關鍵設定檔寫入損壞資料，檢驗 Harness 是否具備實質阻斷能力，抓出「壞資料仍回傳 0」的致命假陽性。',
        input: '暫時破壞設定檔語法並執行 Harness，驗證完畢毫秒級自動原樣復原',
        expected: 'Exit Code != 0 (必須立即阻斷並報警，嚴禁通過)'
      },
      {
        id: 'PLAN-HARNESS-03',
        name: '雙回合連續執行狀態隔離檢驗 (Idempotency)',
        type: '環境潔淨度',
        objective: '連續執行 Harness 兩次，檢視腳本是否在磁碟偷偷留下了未被 .gitignore 包含的暫存檔案或髒資料。',
        input: '連續執行兩次回合，自動比對前後 git status --porcelain',
        expected: '未清理的殘留磁碟檔案數 = 0 (完全乾淨無痕)'
      },
      {
        id: 'PLAN-HARNESS-04',
        name: 'Shell 腳本退出碼防吞噬靜態審核',
        type: '靜態防禦審查',
        objective: '檢查腳本內容是否有 set -e 保護，並防範 || true 等可能遮蔽重要失敗的靜默語法。',
        input: '靜態掃描目標腳本之錯誤處理機制',
        expected: '啟用 set -e，且無吞噬錯誤之語法'
      }
    ];

    return {
      mode: 'harness-eval',
      modeTitle: '模式 C: Harness 流程實體健檢與故障注入',
      targetSummary: `目標測試指令: ${detectedCmd}`,
      standards,
      plannedCases
    };
  }

  throw new Error(`Unsupported mode: ${mode}`);
}

module.exports = { getCasesPreview };
