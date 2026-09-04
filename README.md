# 🛡️ Test Sentinel (智慧測試與評測哨兵平台)

專為現代前端、AI Agent 專案以及**「肥大、零測試、零規格」的陳年舊專案**設計的 AI-Native 自主測試與品質評測平台。

## ✨ 核心特色與亮點

### 1. 三大維度模組化評測模式 (Three Distinct Evaluation Modes)
- **模式 A：Git Diff E2E 智慧測試**
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

## 🚀 快速啟動

### 1. 啟動 Web 視覺化儀表板
```bash
npm start
# 或 node src/server/app.js
# 開啟瀏覽器訪問: http://localhost:3890
```

### 2. CLI 模式
```bash
# 掃描專案架構指紋
node src/cli/test-sentinel.js scan /path/to/project

# 執行 Git Diff E2E 探針與變異測試
node src/cli/test-sentinel.js run diff-e2e /path/to/project

# 執行 Skill 效益評測
node src/cli/test-sentinel.js run skill-eval /path/to/project

# 執行 Harness 健檢
node src/cli/test-sentinel.js run harness-eval /path/to/project
```

### 3. 背景哨兵門禁 (Sentinel Gate)
```bash
# 守候變更 (0 Token)，偵測到改動自動 exit 0 觸發外部 Agent
node src/cli/watch-gate.js /path/to/project
```

---

## 📂 目錄結構

```
test-sentinel/
├── src/
│   ├── server/app.js           # 輕量 HTTP 伺服器 + SSE 推送
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
└── tests/self-test.js          # 8 大模組整合自檢
```
