# AGENTS.md - Test Sentinel 協作指引

歡迎 AI Agent 與開發者協作 Test Sentinel！本文件提供本專案的核心設計原則與維護指引。

## 🎯 核心架構規範

1. **零外部框架核心原則**：
   - `src/server/app.js` 與 `src/core/` 嚴格使用 Node.js 原生 API (`http`, `fs`, `path`, `child_process`)，確保在任何環境克隆後「零 npm install」即可立刻跑起來。
2. **隔離暫存原則 (Ephemeral Probes)**：
   - 模式 A 生成的所有自動化探針必須放置於目標專案的 `.test-eval/diff-probes/`，且不可隨意寫入正式 `tests/`，避免污染 Git 狀態或與專案自身的 TDD 測試打架。
   - 只有在使用者明確觸發「晉升 (Promote)」時，才能將測案複製至正式測試目錄。
3. **安全網守護 (Safety Net Invariants)**：
   - 產出的 Playwright 測案必須永遠掛載 `page.on('pageerror')` 與 `page.on('console')` 監聽，視未捕獲的瀏覽器運行期錯誤為最高優先級阻斷項。
4. **Mock 引擎流水線 (2 -> 3 -> 1)**：
   - 先用 `ast-extractor.js` (2) 產出種子測資。
   - 遭遇執行期崩潰時用 `error-healer.js` (3) 自動打補丁。
   - 自癒成功後使用 `har-manager.js` (1) 固化為永久快照。
5. **Agent 實測喚醒協議**：
   - 需要實際 Agent 路由結果時，先以背景終端執行 `npm run agent:watch -- <目標專案>`。
   - 收到 `AGENT_EVAL_WAKEUP_TRIGGERED` 或 `AGENT_EVAL_WAKEUP_IMMEDIATE` 後，執行 `npm run agent:next -- <目標專案>` 取得待測 queries。
   - 每個 query 必須在新的 Agent context 中獨立執行；只有真正載入並套用目標 Skill 才回報 `triggered: true`。
   - Agent 不得讀取 `.test-eval/agent-jobs/*.labels.json`。該檔案是密封的評分標籤，讀取會使評測失效。
   - 將每案實際 output、可取得的 runtime token/latency，以及具證據的 quality checks 寫入結果 JSON。Runtime 未暴露 Token 時不可估算，必須填 `tokenMeasurementReason`，再執行 `npm run agent:complete -- <目標專案> <jobId> <result.json>`。
   - 完成後重新執行 `agent:watch`，進入下一輪待命。完整協議見 `docs/AGENT_EVALUATION.md`。

## 🧪 驗證指令
修改任何核心代碼後，請務必執行：
```bash
node tests/self-test.js
```
確保全數 9 個自檢模組皆回傳 PASS。
