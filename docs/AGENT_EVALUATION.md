# Agent FSEvent 實測協議

## 目的

Skill 評測不能用關鍵詞模擬取代真實 Agent 路由。本協議讓 Test Sentinel 建立待測工作，由 macOS FSEvents 喚醒已布防的 Desktop Agent；Agent 在新 context 中實際執行每個 query，回寫觀測結果後才計為 `MEASURED`。

## 與 task-dashboard 的對照

task-dashboard 的 `scripts/watch-task-gate.js` 先檢查現有 `in_progress` 任務，再以 `fs.watch` 監聽資料目錄。偵測到 `tasks.json` 改變後輸出 `WAKEUP_TRIGGERED` 並 `exit(0)`，Desktop Agent 因背景 terminal 完成通知而恢復工作。

Test Sentinel 採用相同模式：

| task-dashboard | Test Sentinel |
| --- | --- |
| `tasks.json` 的 `in_progress` | `.test-eval/agent-jobs/*.request.json` |
| `watch-task-gate.js` | `src/cli/agent-eval.js watch` |
| 任務 execution log | `*.result.json` 的 observations |
| 推進至 review | Server 合併密封標籤並產生 `MEASURED` 報告 |

FSEvents 本身不會建立 AI session。它會讓 Agent 先前啟動的背景 watcher 結束；VS Code、Cursor、Claude Desktop 等宿主必須支援背景 terminal 完成後喚醒目前 Agent。

## Agent 操作流程

### 1. 布防

請 Agent 在背景或 async terminal 執行：

```bash
cd ~/projects/test-sentinel
npm run agent:watch -- /path/to/target-project
```

若已有 pending job，腳本立即輸出 `AGENT_EVAL_WAKEUP_IMMEDIATE`；否則進入 FSEvent 等待。Web 儀表板啟動 Skill 測試後，腳本會輸出 `AGENT_EVAL_WAKEUP_TRIGGERED` 與 job ID，再以 exit code 0 結束。

### 2. 領取工作

```bash
cd ~/projects/test-sentinel
npm run agent:next -- /path/to/target-project
```

輸出只包含 Skill 目標與 queries，不包含正負答案。請勿讀取 `.test-eval/agent-jobs/*.labels.json`，否則會發生 benchmark leakage。

### 3. 實際執行

每個 query 必須在新的 Agent context 執行，並觀察目標 Skill 是否真的被載入及套用。不要只根據字面關鍵詞猜測。

- `triggered`: 只有目標 Skill 實際載入並影響執行時才為 `true`。
- `output`: 該 context 的實際產出。
- `promptTokens`、`completionTokens`: 僅填 Agent runtime 真正提供的數值。若宿主未暴露，兩者都省略並填寫 `tokenMeasurementReason`。
- `latencyMs`: 可使用 Agent runtime 數值，或由外部 wall-clock 計算每案實際經過時間。
- `qualityChecks`: 只填可由 output、命令結果或產物驗證的契約，必須附 evidence。

結果檔範例：

```json
{
  "agent": "github-copilot",
  "observations": [
    {
      "id": "PLAN-SKILL-01",
      "triggered": true,
      "output": "實際 Agent 回應",
      "tokenMeasurementReason": "Antigravity runtime 未暴露 promptTokens 與 completionTokens。",
      "latencyMs": 1234,
      "qualityChecks": [
        {
          "name": "檢查變更風險",
          "passed": true,
          "evidence": "回應包含依嚴重度排序的 findings"
        }
      ]
    }
  ]
}
```

### 4. 回寫

```bash
npm run agent:complete -- /path/to/target-project <jobId> /tmp/test-sentinel-result.json
```

CLI 會拒絕缺少案例、重複案例、非 boolean `triggered` 或沒有 evidence 的品質檢查。Web 每秒輪詢一次，完整結果回寫後自動完成正式評分。

### 5. 重新待命

每個 watcher 只消費一次喚醒事件。完成後再次執行 `agent:watch`，才能接收下一筆工作。

## 可直接交給 Agent 的指示

```text
在 async terminal 執行：
npm run agent:watch -- <target-project>

收到 AGENT_EVAL_WAKEUP_TRIGGERED 或 AGENT_EVAL_WAKEUP_IMMEDIATE 後：
1. 執行 npm run agent:next -- <target-project>。
2. 不讀取任何 *.labels.json。
3. 對每個 query 建立新的 Agent context，實際觀察目標 Skill 是否載入並執行。
4. 將 triggered、實際 output、可取得的 runtime usage 與具證據的 qualityChecks 寫入 JSON；無 Token 數值時填 tokenMeasurementReason，不得估算。
5. 執行 npm run agent:complete -- <target-project> <jobId> <result.json>。
6. 再次啟動 agent:watch。
```