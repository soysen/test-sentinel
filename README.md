# 🛡️ Test Sentinel (智慧測試與評測哨兵平台)

專為現代前端、AI Agent 專案以及**「肥大、零測試、零規格」的陳年舊專案**設計的 AI-Native 自主測試與品質評測平台。

## ✨ 核心特色與亮點

### 1. 三大維度模組化評測模式 (Three Distinct Evaluation Modes)
- **模式 A：Git Diff E2E 智慧測試**
  - **路徑範圍選測 (Path Scoped Selection)**：Web 儀表板支援資料夾/檔案勾選樹（父子連動、部分選取 indeterminate、全選與清除）及進階 Include/Exclude Glob（`!pattern` 排除），透過 Git 原生安全 pathspec 精確鎖定變更範圍。
  - **Baseline 隔離機制**：全範圍沿用 `all-diffs`，篩選範圍以 canonical scope 的 SHA-256 短 hash 隔離歷史基線，保存可讀 scope metadata。
  - **隔離暫存探針**：生成於 `.test-eval/diff-probes/`，跑完即焚，不污染正式 Git 代碼庫，與既有 TDD 測試互不干擾。
  - **全域安全網**：自動捕捉 `console.error`、`pageerror` 與後端 `500` 靜默崩潰。
  - **變異擊殺測試 (Mutation Kill Rate)**：故意將邏輯條件改壞（如 `===` 改為 `!==`），計算測案斷言是否具備真實鑑別力。
  - **一鍵晉升 (Promote)**：有價值的探針可一鍵收編入正式測試庫。
- **模式 B：Skill 效益評測**
  - 掃描 `SKILL.md`，自動合成「領域內必答題」與「領域外干擾題」。
  - 量化計算召回率 (Recall)、精確率 (Precision) 與 Token 消耗增益。
- **模式 C：Harness 流程健檢**
  - 故障注入 (Fault Injection)：注入壞環境變數驗證是否有中斷能力。
  - 冪等性檢測 (Idempotency)：連跑兩次檢視快取與狀態殘留污染。

### 評測證據狀態

- `MEASURED`：已執行真實 baseline 與正負控制，可用於品質判定。
- `HEURISTIC`：僅使用靜態或關鍵詞預檢，不應作為品質門禁。
- `INCONCLUSIVE`：缺少測試命令、有效變異或可注入目標，不產生分數。

Git Diff 模式會依序偵測 `test:e2e`、`e2e`、`test` npm script，執行 baseline 後逐一套用 diff mutation。只有 baseline 通過且 mutant 造成測試失敗時才計為 `KILLED`；逾時、語法錯誤與環境故障不列入擊殺率。Skill 模式只有在案例帶有路由器實際觀測的 `triggered` 值時才標示為 `MEASURED`。

### FSEvent 喚醒 Agent 實測

在 Agent 的背景終端先布防：

```bash
cd ~/projects/test-sentinel
npm run agent:watch -- /path/to/target-project
```

接著在 Web 儀表板啟動 Skill 測試。Test Sentinel 會建立 Agent job；macOS FSEvents 使 watcher 輸出 job ID 並退出，喚醒已布防的 Desktop Agent。Agent 依序執行：

```bash
npm run agent:next -- /path/to/target-project
npm run agent:complete -- /path/to/target-project <jobId> <result.json>
```

Web 會等待回寫，收到完整結果後才產生 `MEASURED` 分數。詳細結果格式、Agent prompt 與 task-dashboard 機制對照見 [Agent 實測協議](docs/AGENT_EVALUATION.md)。

### 2. GitNexus 知識圖譜衝擊分析 (Blast Radius Radar)
- 透過 `gitnexus detect-changes` 映射 Git Diff 到 Symbols 與執行流程。
- 透過 `gitnexus impact` 精準推導上游受波及的頁面與元件，縮小打擊面，避免整站盲目漫遊。

### 3. 2 跨到 3 智慧自癒 Mock 引擎 (Legacy Project Rescue)
解決肥大舊專案「無測資、無規格、進不去畫面」的痛點：
- **解法 2（靜態推導）**：AST 掃描 JSX/TS 解構語法，秒出 80% 準確的 `Seed Mock`。
- **解法 3（動態自癒）**：Playwright 運行遇 `TypeError` 時，自動解析缺失欄位並原地 Patch。
- **解法 1（永久固化）**：自癒成功的測資自動存入 `.test-eval/mocks/`，轉為永久離線快照。

### 4. 零 Token 哨兵喚醒 (Reactive FSEvents Gate)
- 使用 macOS 原生 FSEvents / Node `fs.watch`。
- 平時在背景待命 **0 Token 開銷**；一旦偵測到代碼儲存，即刻喚醒 Agent 開工！

---

## 🚀 使用者操作指南

### 使用前準備

- Node.js 18 以上版本（核心平台不需安裝 npm 套件）。
- 待測專案需位於本機，且建議先確認自身測試可正常執行。
- Web 儀表板支援輸入/貼上任何本機專案路徑、點選資料夾按鈕瀏覽選取，或直接從最近使用清單切換。
- 模式 A 需要待測專案提供 `test:e2e`、`e2e` 或 `test` npm script。若測試使用 Playwright，依賴與瀏覽器也必須已在待測專案中備妥。
- 模式 B 的完整實測需要 Desktop Agent 配合；若未回寫真實路由結果，只會得到 `HEURISTIC`，不能當作正式品質門禁。

Test Sentinel 核心 runtime 沒有外部依賴，下載後可直接啟動：

```bash
cd /path/to/test-sentinel
npm start
```

瀏覽器開啟 [http://localhost:3890](http://localhost:3890)。如需改用其他連接埠：

開發驗證需先執行 `npm install`。`@playwright/test` 僅為 dev dependency；UI E2E 預設使用本機 Chrome：

```bash
npm test             # 9 模組自檢 + Worker Thread 整合測試
npm run test:e2e     # Dashboard UI E2E + 最近生成的隔離探針
```

```bash
PORT=4000 npm start
```

### 選擇評測模式

| 使用情境 | 建議模式 | 主要結果 |
| --- | --- | --- |
| 想確認目前 Git 變更是否被測試有效保護 | 模式 A：Git Diff E2E | 基線結果、變異擊殺率、靜默錯誤 |
| 想確認 `SKILL.md` 是否會在正確情境觸發且產出合格 | 模式 B：Skill 效益評測 | Recall、Precision、品質與 Token 數據 |
| 想檢查測試流程遇到錯誤時能否正確中斷且可重複執行 | 模式 C：Harness 健檢 | 故障注入、冪等性與健康分數 |

### Web 儀表板操作流程

1. 在左側「目標專案」選擇待測專案。平台會掃描框架、測試設定與可用 Skill，並開始監聽專案變更。
2. 選擇模式 A、B 或 C：
   - **模式 A**：可於「路徑範圍選測」面板勾選欲納入之變更資料夾或檔案，亦可填寫進階 Glob 規則（如 `src/**/*.js` 或 `!**/*.spec.js`）。若變更範圍，系統將自動重設舊預覽。
   - **模式 B**：需要從搜尋欄選擇要評測的 Skill。
3. 點擊「1. 生成測試流程與測案」。先檢查每個測案的目的、輸入與預期結果；輸入內容可直接編輯，也可還原預設值。
4. 點擊「2. 批准測案並開始實體執行」。執行期間不要關閉儀表板。
5. 在評分卡確認證據狀態與各項指標。完成的報告會自動存入待測專案的 `.test-eval/history/`（模式 A 依 canonical scope hash 隔離 baseline）。
6. 切換到「歷史紀錄中心」，依專案、模式與目標篩選紀錄，查看歷次結果及相對基準差異。

模式 A 執行時會在待測專案的 `.test-eval/diff-probes/` 建立隔離探針，並短暫修改變異候選行來檢驗測試；每次變異執行後都會還原原始內容。為避免與其他寫入作業互相干擾，評測期間不要同時修改待測檔案。

### 模式 B：Desktop Agent 實測

先在另一個終端布防 watcher：

```bash
cd /path/to/test-sentinel
npm run agent:watch -- /path/to/target-project
```

接著回到 Web 儀表板：

1. 選擇模式 B 與目標 Skill，生成測案。
2. 複製畫面中的「Desktop Agent 啟動 Prompt」，貼到 Desktop Agent。
3. 批准執行後，watcher 會在收到 job 時輸出 job ID 並結束。
4. Agent 依 Prompt 執行每個 query 並回寫結果；Web 收到完整結果後才會顯示 `MEASURED` 分數。

若需手動處理 Agent job，可使用：

```bash
npm run agent:next -- /path/to/target-project
npm run agent:complete -- /path/to/target-project <jobId> <result.json>
```

每個 query 必須在獨立 Agent context 執行，且不得讀取 `.test-eval/agent-jobs/*.labels.json`。完整格式與步驟請見 [Agent 實測協議](docs/AGENT_EVALUATION.md)。

### CLI 操作

CLI 適合自動化、CI 或待測專案不在 `~/projects/` 時使用。

```bash
# 掃描專案架構、測試能力與 Skill
node src/cli/test-sentinel.js scan /path/to/project

# 模式 A：評測所有 Git diff
node src/cli/test-sentinel.js run diff-e2e /path/to/project

# 模式 B：評測第一個找到的 Skill
node src/cli/test-sentinel.js run skill-eval /path/to/project

# 模式 B：指定 Skill 名稱或 SKILL.md 路徑
node src/cli/test-sentinel.js run skill-eval /path/to/project <skill-name-or-path>

# 模式 C：健檢測試 Harness
node src/cli/test-sentinel.js run harness-eval /path/to/project

# 查詢指定模式與目標的歷史紀錄
node src/cli/test-sentinel.js history <mode> <target> /path/to/project
```

`run` 指令可加上 `--format=markdown`、`--format=junit` 或 `--format=json`，供 PR 留言、CI 測試報告或後續程式處理使用。例如：

```bash
node src/cli/test-sentinel.js run diff-e2e /path/to/project --format=junit > test-sentinel.xml
```

### 結果判讀

- `MEASURED`：具備實際執行證據，可用於品質判定。
- `HEURISTIC`：僅為靜態或關鍵詞推估，適合初步診斷，不適合作為阻擋合併的依據。
- `INCONCLUSIVE`：本次沒有足夠證據產生分數。常見原因是找不到測試 script、基線測試失敗、沒有可用變異，或 Harness 沒有可注入的目標。
- 模式 A 的 Kill Rate 越高，表示現有測試越能偵測邏輯被破壞；低於 80% 代表仍有變異在測試下存活。
- 模式 B 應同時查看 Recall 與 Precision：前者代表該觸發時有觸發，後者代表不該觸發時能抑制。
- 任何 `pageerror`、`console.error` 或 HTTP 5xx 都應優先處理，不應只看總分。

### 常見問題

**Web 找不到待測專案**
可在左側「目標專案路徑」直接輸入或貼上任何本機目錄路徑（例如 `~/dev/my-app` 或 `/path/to/project`），或點擊資料夾圖示透過系統選取視窗選擇。

**模式 A 顯示 `INCONCLUSIVE`**

先在待測專案中手動執行對應的 `npm run test:e2e`、`npm run e2e` 或 `npm test`。基線必須通過，且目前 diff 中要有可安全套用的變異候選點。

**模式 B 一直沒有 `MEASURED` 結果**

確認 `agent:watch` 已在評測前啟動、Desktop Agent 已使用畫面提供的 Prompt，且所有 query 結果都已回寫。不要自行估算 runtime 未提供的 Token 數。

**啟動背景變更門禁**

以下指令會以零 Token 待命；偵測到目標專案變更後以 exit code 0 結束，供外部 Agent 或自動化流程接手：

```bash
node src/cli/watch-gate.js /path/to/project
```

---

## 📂 目錄結構

```
test-sentinel/
├── playwright.config.js       # UI E2E 與隔離探針設定
├── src/
│   ├── server/                 # 輕量 HTTP 伺服器、SSE 與 Worker 啟動器
│   ├── core/
│   │   ├── scanner.js          # 專案指紋與框架探測器
│   │   ├── gitnexus.js         # GitNexus CLI 知識圖譜橋接
│   │   ├── diff-analyzer.js    # Diff 提取與變異候選點標記
│   │   ├── scorer.js           # 測試鑑別度與品質計分卡
│   │   ├── watcher.js          # 原生 FSEvents 防抖監聽器
│   │   ├── mock-engine/        # 2 -> 3 智慧自癒 Mock 模組
│   │   │   ├── ast-extractor.js
│   │   │   ├── error-healer.js
│   │   │   └── har-manager.js
│   │   └── modes/              # 三大驗證模式
│   │       ├── diff-e2e-runner.js
│   │       ├── skill-evaluator.js
│   │       └── harness-auditor.js
│   ├── web/                    # 現代暗黑風格 Web Dashboard
│   └── cli/                    # CLI 與守候門禁
└── tests/                      # 核心自檢、Worker 整合與 Dashboard E2E
```
