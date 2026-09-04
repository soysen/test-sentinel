/**
 * skill-evaluator.js - [模式 B] Skill 效益評測與產出品質深度健檢引擎
 * 支援每個測案的 Token 消耗細節、信心指數解析、產出結果預覽與品質評分
 */

const fs = require('fs');
const path = require('path');

class SkillEvaluator {
  constructor(projectPath) {
    this.projectPath = path.resolve(projectPath);
  }

  evaluateSkill(skillPath, customCases = null) {
    const fullPath = path.resolve(this.projectPath, skillPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Skill file not found: ${fullPath}`);
    }

    const rawContent = fs.readFileSync(fullPath, 'utf8');
    const meta = this.parseSkillMeta(rawContent);

    // 1. Prompt Token 負載與品質體檢
    const promptAudit = this.auditPromptWeight(rawContent, meta);

    // 2. 自動合成基準題庫 (若有傳入自訂或修改後的測案，優先採用自訂題庫)
    let benchmarkSuite;
    let evaluationMode = 'HEURISTIC';
    if (Array.isArray(customCases) && customCases.length > 0) {
      benchmarkSuite = customCases.map((c, idx) => ({
        id: idx + 1,
        type: c.type?.includes('正向') || c.type === 'in-domain' ? 'in-domain' : 'distractor',
        query: c.input || c.query,
        actualTriggered: typeof c.triggered === 'boolean' ? c.triggered : undefined,
        actualOutput: typeof c.actualOutput === 'string' ? c.actualOutput : null,
        promptTokens: Number.isFinite(c.promptTokens) ? c.promptTokens : null,
        completionTokens: Number.isFinite(c.completionTokens) ? c.completionTokens : null,
        tokenMeasurementStatus: c.tokenMeasurementStatus || null,
        tokenMeasurementReason: typeof c.tokenMeasurementReason === 'string' ? c.tokenMeasurementReason : null,
        latencyMs: Number.isFinite(c.latencyMs) ? c.latencyMs : null,
        qualityChecks: Array.isArray(c.qualityChecks) ? c.qualityChecks : [],
        expectedTrigger: typeof c.expectedTrigger === 'boolean'
          ? c.expectedTrigger
          : (c.type?.includes('正向') || c.type === 'in-domain' || c.expected?.includes('>= 35%'))
      }));
      if (benchmarkSuite.every(testCase => typeof testCase.actualTriggered === 'boolean')) {
        evaluationMode = 'MEASURED';
      }
    } else {
      benchmarkSuite = this.generateBenchmarkSuite(meta);
    }

    // 3. 實施觸發鑑別度實測 (Recall vs Precision)
    const discriminationResult = this.testTriggerDiscrimination(meta, benchmarkSuite);

    // 4. 定義測試標準
    const standards = [
      {
        name: '領域召回率標準 (Recall Rate)',
        criterion: '針對領域內目標操作任務，觸發信心度需 >= 35%，召回率需達 100%',
        target: 'Recall = 100%',
        status: discriminationResult.recallRate === 100 ? 'PASSED' : 'FAILED',
        explanation: '確保當使用者真正需要此 Skill 時，Agent 不會遺漏或冷落，達到即時自動響應。'
      },
      {
        name: '抗干擾精確率標準 (Distractor Precision)',
        criterion: '面對無關或陷阱問題時，觸發信心度需 < 35%，精確率需達 100%',
        target: 'Precision = 100%',
        status: discriminationResult.specificityRate === 100 ? 'PASSED' : 'FAILED',
        explanation: '防止非相關問題誤觸發 Skill，杜絕 Context 污染與不必要的 Token 消耗。'
      },
      {
        name: 'Context Token 負載標準',
        criterion: 'Skill 說明與指引長度宜控制在 1,500 Tokens 以內，避免沖淡對話 Context',
        target: 'Tokens <= 1500',
        status: promptAudit.isBloated ? 'WARNING' : 'PASSED',
        explanation: '單個 Skill 的 Token 負載越輕，Agent 能留給推理思考與使用者代碼的空間就越多。'
      },
      {
        name: '產出品質契約合規性 (Quality & Output)',
        criterion: 'Skill 產出需嚴格遵循 SKILL.md 定義之步驟，無幻覺參數且具備高完整度',
        target: 'Quality Score >= 90',
        status: 'NOT_EVALUATED',
        explanation: '目前沒有 Agent 產出與契約驗證證據，因此不產生品質分數。'
      }
    ];

    // 5. 視覺化流程步驟 (Function Flow)
    const workflow = [
      { step: 1, name: '輸入查詢解析', desc: '解析使用者 Query 語意實體與核心意圖', status: 'completed' },
      { step: 2, name: '意圖匹配與信心度計算', desc: '比對 Skill 描述與特徵向量，計算觸發信心指數', status: 'completed' },
      { step: 3, name: 'Prompt Context 動態掛載', desc: '載入 SKILL.md 規範與工具鏈至 Agent 工作記憶區', status: 'completed' },
      { step: 4, name: '推論產出與品質檢驗', desc: '生成回應並審核格式合規性、準確性與 Token 損耗', status: 'completed' }
    ];

    // 6. 每個測案的詳細分析 (Token Breakdown, 產出結果, 品質打分, 信心解讀)
    let measuredTokenTotal = 0;
    let measuredTokenCases = 0;
    const measuredQualityScores = [];
    const caseComparisons = discriminationResult.cases.map(c => {
      const isExpectedTrigger = c.expectedTrigger;
      const isTriggered = c.triggered;

      const hasTokenEvidence = Number.isFinite(c.promptTokens) && Number.isFinite(c.completionTokens);
      const tokenBreakdown = hasTokenEvidence ? {
        promptTokens: c.promptTokens,
        completionTokens: c.completionTokens,
        totalTokens: c.promptTokens + c.completionTokens,
        latencyMs: c.latencyMs
      } : null;
      if (tokenBreakdown) {
        measuredTokenTotal += tokenBreakdown.totalTokens;
        measuredTokenCases++;
      }

      const qualityChecks = Array.isArray(c.qualityChecks) ? c.qualityChecks : [];
      const qualityEvaluation = qualityChecks.length > 0 ? {
        score: Math.round((qualityChecks.filter(check => check.passed).length / qualityChecks.length) * 100),
        rating: qualityChecks.every(check => check.passed) ? 'PASSED' : 'NEEDS_ATTENTION',
        checks: qualityChecks,
        summary: `${qualityChecks.filter(check => check.passed).length}/${qualityChecks.length} 項品質契約具備可觀測證據。`
      } : null;
      if (qualityEvaluation) measuredQualityScores.push(qualityEvaluation.score);

      // 信心指數解析
      const confidenceDetails = c.evidenceType === 'ROUTER_OBSERVATION' ? {
        score: null,
        rawNumber: null,
        threshold: null,
        verdict: isTriggered ? '實際觀測到 Skill 載入' : '實際觀測到 Skill 未載入',
        explanation: '此結果來自獨立 Agent context 的實際路由觀測，不使用關鍵詞 confidence 模擬。'
      } : {
        score: c.confidence,
        rawNumber: c.rawConfidence,
        threshold: '35%',
        verdict: isTriggered ? '達到觸發門檻 (>= 35%)' : '低於觸發門檻 (< 35%)',
        explanation: isTriggered
          ? `Query 中命中多項核心意圖與關聯動作詞彙 [${c.matchedKeywords.join(', ')}]，計算權重分數為 ${c.confidence}。`
          : `Query 與 Skill 描述無直接字詞交集，計算權重分數為 ${c.confidence}。`
      };

      return {
        id: `SKILL-TC-0${c.id}`,
        name: c.type === 'in-domain' ? '領域內任務意圖召回與產出品質實測' : '領域外干擾問題抑制與邊界隔離實測',
        type: c.type === 'in-domain' ? '正向任務 (In-Domain)' : '抗干擾防護 (Distractor)',
        input: c.query,
        expected: isExpectedTrigger ? '自動啟動 Skill (信心度 >= 35%) 並給出專業解法' : '保持沉默 (信心度 < 35%) 避免誤調用',
        actual: c.evidenceType === 'ROUTER_OBSERVATION'
          ? (isTriggered ? 'Agent 實際載入並套用 Skill' : 'Agent 實際未載入 Skill')
          : (isTriggered ? `啟動 Skill (啟發式信心度 ${c.confidence})` : `保持沉默 (啟發式信心度 ${c.confidence})`),
        status: c.passed ? 'PASS' : 'FAIL',
        delta: c.passed ? '完全吻合 (差異度 0%)' : '出現誤判 (實測與預期相反)',
        tokenBreakdown,
        tokenMeasurement: {
          status: hasTokenEvidence ? 'MEASURED' : (c.tokenMeasurementStatus || 'UNAVAILABLE'),
          reason: hasTokenEvidence ? null : (c.tokenMeasurementReason || 'Agent runtime 未提供 Token 使用量。'),
          latencyMs: c.latencyMs
        },
        confidenceDetails,
        simulatedOutput: c.actualOutput,
        qualityEvaluation,
        evidenceType: c.evidenceType
      };
    });
    const totalTokensConsumed = measuredTokenCases === caseComparisons.length && measuredTokenCases > 0
      ? measuredTokenTotal
      : null;
    const tokenMeasurement = totalTokensConsumed === null
      ? {
        status: 'UNAVAILABLE',
        measuredCases: measuredTokenCases,
        totalCases: caseComparisons.length,
        reasons: [...new Set(caseComparisons
          .filter(testCase => testCase.tokenMeasurement.status !== 'MEASURED')
          .map(testCase => testCase.tokenMeasurement.reason))]
      }
      : { status: 'MEASURED', measuredCases: measuredTokenCases, totalCases: caseComparisons.length, reasons: [] };
    const averageQualityScore = measuredQualityScores.length === caseComparisons.length && measuredQualityScores.length > 0
      ? Math.round(measuredQualityScores.reduce((total, value) => total + value, 0) / measuredQualityScores.length)
      : null;
    const qualityStandard = standards.find(standard => standard.name.includes('產出品質'));
    qualityStandard.status = averageQualityScore === null
      ? 'NOT_EVALUATED'
      : (averageQualityScore >= 90 ? 'PASSED' : 'FAILED');
    qualityStandard.explanation = averageQualityScore === null
      ? '部分或全部測案缺少品質契約證據，因此不產生品質分數。'
      : `依 Agent 回傳的逐條品質契約證據計算，平均分為 ${averageQualityScore}。`;

    // 計算綜合效益評分
    const routingScore = evaluationMode === 'MEASURED'
      ? this.computeRoutingScore(discriminationResult)
      : null;
    const score = evaluationMode === 'MEASURED' && averageQualityScore !== null
      ? this.computeSkillScore(promptAudit, routingScore, averageQualityScore)
      : null;

    const suggestions = [];
    if (promptAudit.isBloated) {
      suggestions.push(`Prompt 篇幅偏大 (${promptAudit.estimatedTokens} tokens)，建議將參考資料拆分至 references/ 目錄以減少 Context 開銷。`);
    }
    if (!meta.hasNegativeTriggers) {
      suggestions.push('建議在 description 中補充「何時不要使用 (Negative Triggers)」，可進一步加強邊界防禦。');
    }
    if (discriminationResult.recallRate === 100 && discriminationResult.precisionRate === 100) {
      suggestions.push('正負向路由觀測均符合預期，未發現誤觸發或漏觸發。');
    }

    return {
      timestamp: new Date().toISOString(),
      status: evaluationMode,
      skillName: meta.name || path.basename(path.dirname(fullPath)),
      path: path.relative(this.projectPath, fullPath),
      description: meta.description,
      standards,
      workflow,
      caseComparisons,
      promptAudit,
      totalTokensConsumed,
      discriminationResult,
      metrics: {
        recallRate: discriminationResult.recallRate,
        precisionRate: discriminationResult.precisionRate,
        specificityRate: discriminationResult.specificityRate,
        f1Score: discriminationResult.f1Score,
        confusionMatrix: discriminationResult.confusionMatrix,
        tokenWeight: `${promptAudit.estimatedTokens} tokens`,
        totalTestTokens: totalTokensConsumed,
        tokenMeasurement,
        estimatedTokenEfficiency: null,
        averageQualityScore,
        routingScore,
        scoreCoverage: {
          routing: evaluationMode === 'MEASURED' ? 'MEASURED' : 'HEURISTIC',
          outputQuality: averageQualityScore === null ? 'NOT_EVALUATED' : 'MEASURED',
          tokenUsage: tokenMeasurement.status
        },
        overallScore: score
      },
      suggestions
    };
  }

  parseSkillMeta(content) {
    let name = '';
    let description = '';

    const fmMatch = content.match(/^---\s*([\s\S]*?)\s*---/);
    if (fmMatch) {
      const frontmatter = fmMatch[1];
      const nameMatch = frontmatter.match(/name:\s*(.+)/);
      const descMatch = frontmatter.match(/description:\s*["']?([\s\S]*?)["']?(?=\n\w+:|$)/);
      if (nameMatch) name = nameMatch[1].trim();
      if (descMatch) description = descMatch[1].trim().replace(/\n/g, ' ');
    }

    if (!name) {
      const titleMatch = content.match(/^#\s+(.+)/m);
      if (titleMatch) name = titleMatch[1].trim();
    }

    const hasNegativeTriggers = /not\s+(?:use|trigger|apply)|do\s+not|never|avoid|except|排除|不要在/i.test(description + content.slice(0, 800));

    return {
      name,
      description,
      hasNegativeTriggers,
      rawLength: content.length
    };
  }

  auditPromptWeight(content, meta) {
    const estimatedTokens = Math.round(content.length / 3.5);
    const isBloated = estimatedTokens > 1500;

    return {
      charCount: content.length,
      estimatedTokens,
      isBloated,
      status: isBloated ? 'HEAVY' : 'OPTIMAL',
      hasValidFrontmatter: !!(meta.name && meta.description)
    };
  }

  generateBenchmarkSuite(meta) {
    const domainText = `${meta.name || ''} ${meta.description || ''}`.toLowerCase();
    if (/code.?review|review.*(?:diff|code)|security vulnerabilit|pull request|api contract/.test(domainText)) {
      return this.generateCodeReviewBenchmarkSuite();
    }

    return [
      {
        id: 1,
        type: 'in-domain',
        strategy: '自然短句正例',
        query: '請依目前專案規範處理這項工作，並驗證結果是否正確。',
        expectedTrigger: true,
        discriminationRationale: '不提 Skill 名稱，只用自然任務意圖測試基本召回。'
      },
      {
        id: 2,
        type: 'in-domain',
        strategy: '口語同義正例',
        query: '幫我把這件事照專案既有做法處理好，完成後確認沒有漏掉必要檢查。',
        expectedTrigger: true,
        discriminationRationale: '避開 description 原句，測試 Agent 能否辨識口語同義表達。'
      },
      {
        id: 3,
        type: 'distractor',
        strategy: '近鄰否定負例',
        query: '只整理目前資訊，不要執行專案專屬流程，也不要提出修改建議。',
        expectedTrigger: false,
        discriminationRationale: '主題接近但明確排除專屬流程，測試否定語意抑制能力。'
      },
      {
        id: 4,
        type: 'distractor',
        strategy: '完全無關負例',
        query: '請比較這週三個城市的天氣預報。',
        expectedTrigger: false,
        discriminationRationale: '確認完全無關需求不會誤觸發。'
      }
    ];
  }

  generateCodeReviewBenchmarkSuite() {
    return [
      {
        id: 1,
        type: 'in-domain',
        strategy: '自然短句正例',
        query: '請檢查這次修改是否有會造成正式環境故障的問題。',
        expectedTrigger: true,
        discriminationRationale: '不提 Skill 名稱或固定術語，測試真實使用者意圖的基本召回。'
      },
      {
        id: 2,
        type: 'in-domain',
        strategy: '詳盡同義正例',
        query: '這個 PR 有沒有安全漏洞、未處理例外或 API 相容性風險？請依嚴重度列出可驗證的問題。',
        expectedTrigger: true,
        discriminationRationale: '用具體風險而非 Skill 名稱描述任務，測試多項職責的完整召回。'
      },
      {
        id: 3,
        type: 'in-domain',
        strategy: '跨語言改寫正例',
        query: 'Check the current patch for regressions, unsafe behavior, and missing tests. Report only actionable findings.',
        expectedTrigger: true,
        discriminationRationale: '測試相同意圖改用英文後，路由是否仍穩定。'
      },
      {
        id: 4,
        type: 'in-domain',
        strategy: '最小差異正例',
        query: '檢查這次 API 修改是否會破壞既有呼叫端。',
        expectedTrigger: true,
        discriminationRationale: '與第 5 題只差是否要求風險判斷，用來測量細微意圖差異。'
      },
      {
        id: 5,
        type: 'distractor',
        strategy: '最小差異近鄰負例',
        query: '摘要這次 API 修改內容，不要判斷是否會破壞既有呼叫端。',
        expectedTrigger: false,
        discriminationRationale: '保留相同 API 主題但移除審查意圖，測試是否因關鍵詞相近而誤觸發。'
      },
      {
        id: 6,
        type: 'distractor',
        strategy: '明確否定負例',
        query: '只執行現有測試並回報 exit code，不要審查程式碼或提出改善建議。',
        expectedTrigger: false,
        discriminationRationale: '工作仍與程式碼相關，但明確排除 review，測試否定語意是否生效。'
      },
      {
        id: 7,
        type: 'distractor',
        strategy: '相鄰工程任務負例',
        query: '請把目前未提交的檔案整理成一則 Conventional Commit 訊息。',
        expectedTrigger: false,
        discriminationRationale: '同屬軟體工程但目標是版本控制，測試領域邊界精確率。'
      },
      {
        id: 8,
        type: 'distractor',
        strategy: '完全無關負例',
        query: '請比較這週三個城市的天氣預報。',
        expectedTrigger: false,
        discriminationRationale: '確認完全無關需求不會誤觸發。'
      }
    ];
  }

  testTriggerDiscrimination(meta, suite) {
    const descText = (meta.name + ' ' + meta.description).toLowerCase();
    const keywords = descText
      .replace(/[^a-z0-9\s_-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !['and', 'for', 'the', 'use', 'when', 'user', 'with'].includes(w));

    let truePositive = 0;
    let falsePositive = 0;
    let trueNegative = 0;
    let falseNegative = 0;

    const evaluatedCases = suite.map(tc => {
      const queryLower = tc.query.toLowerCase();
      const matched = keywords.filter(k => queryLower.includes(k));
      const hitCount = matched.length;
      const confidence = Math.min(1.0, (hitCount / Math.max(1, Math.min(4, keywords.length))) + (queryLower.includes(meta.name.toLowerCase()) ? 0.6 : 0));
      const simulatedTrigger = confidence >= 0.35;
      const triggered = typeof tc.actualTriggered === 'boolean' ? tc.actualTriggered : simulatedTrigger;

      const isAccurate = triggered === tc.expectedTrigger;

      if (tc.expectedTrigger && triggered) truePositive++;
      if (!tc.expectedTrigger && triggered) falsePositive++;
      if (!tc.expectedTrigger && !triggered) trueNegative++;
      if (tc.expectedTrigger && !triggered) falseNegative++;

      return {
        ...tc,
        confidence: Math.round(confidence * 100) + '%',
        rawConfidence: confidence,
        matchedKeywords: matched,
        triggered,
        passed: isAccurate,
        evidenceType: typeof tc.actualTriggered === 'boolean' ? 'ROUTER_OBSERVATION' : 'KEYWORD_HEURISTIC'
      };
    });

    const recallRate = truePositive + falseNegative > 0
      ? Math.round((truePositive / (truePositive + falseNegative)) * 100)
      : null;
    const precisionRate = truePositive + falsePositive > 0
      ? Math.round((truePositive / (truePositive + falsePositive)) * 100)
      : null;
    const specificityRate = trueNegative + falsePositive > 0
      ? Math.round((trueNegative / (trueNegative + falsePositive)) * 100)
      : null;
    const f1Score = precisionRate !== null && recallRate !== null && precisionRate + recallRate > 0
      ? Math.round((2 * precisionRate * recallRate) / (precisionRate + recallRate))
      : null;

    return {
      cases: evaluatedCases,
      recallRate,
      precisionRate,
      specificityRate,
      f1Score,
      confusionMatrix: { truePositive, falsePositive, trueNegative, falseNegative }
    };
  }

  generateSimulatedOutput(meta, testCase) {
    const skillName = meta.name || 'Skill';
    if (testCase.type === 'in-domain') {
      if (testCase.id === 1) {
        return `[Agent 已調用 ${skillName} 流程]
1. 檢核先決條件：確認目標環境與相依套件就緒。
2. 執行核心作業：遵循 ${skillName} 規範，呼叫標準命令鏈執行。
3. 驗證產出物：執行自動化檢查，確保無語法或執行期異常。
4. 狀態回報：作業順利完成，符合專案標準定義之交付成果。`;
      } else {
        return `[Agent 已載入 ${skillName} 指南]
本 Skill 主要涵蓋以下職責與規範：
- 核心目標：${meta.description.slice(0, 120)}...
- 最佳實踐：優先採用確定性命令，避免非預期 side-effects。
- 異常處置：當指令返回非 0 狀態碼時，應立即停止並回報具體錯誤日誌。`;
      }
    } else {
      return `[Agent 判斷：此問題與 ${skillName} 無關，使用通用助手模式回答]
已為您查詢相關通用資訊：該主題屬於一般性諮詢，無需啟用專案特化工具鏈。`;
    }
  }

  computeRoutingScore(discrimination) {
    const metrics = [discrimination.recallRate, discrimination.precisionRate]
      .filter(value => typeof value === 'number');
    return metrics.length > 0
      ? Math.round(metrics.reduce((total, value) => total + value, 0) / metrics.length)
      : null;
  }

  computeSkillScore(promptAudit, routingScore, qualityScore) {
    let score = Math.round((routingScore * 0.8) + (qualityScore * 0.2));
    if (promptAudit.isBloated) score -= 10;
    if (!promptAudit.hasValidFrontmatter) score -= 15;
    return Math.max(0, Math.min(100, score));
  }
}

module.exports = { SkillEvaluator };
