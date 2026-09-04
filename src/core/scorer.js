/**
 * scorer.js - 測試品質與鑑別度綜合評分器 (Quality Scorecard)
 * 統整 Diff E2E, 變異測試, GitNexus 衝擊半徑與安全網指標
 */

class QualityScorer {
  static computeScorecard({ diffSummary, impactData, e2eResult, mockData }) {
    const insights = [];

    const killRate = e2eResult?.mutationResults?.killRate;
    const hasMutationEvidence = e2eResult?.status === 'MEASURED' && typeof killRate === 'number';
    const hasRuntimeEvidence = Array.isArray(e2eResult?.silentErrorsCaught);

    if (!hasMutationEvidence) {
      return {
        overallScore: null,
        rating: 'INCONCLUSIVE',
        color: '#64748b',
        status: 'INCONCLUSIVE',
        metrics: {
          mutationKillRate: null,
          silentErrorsCaught: hasRuntimeEvidence ? e2eResult.silentErrorsCaught.length : null,
          blastRadiusRisk: impactData?.blastRadius?.riskLevel || null,
          affectedSymbols: impactData?.blastRadius?.totalAffected || null
        },
        evidence: {
          mutation: 'NOT_MEASURED',
          runtimeSafety: hasRuntimeEvidence ? 'MEASURED' : 'NOT_MEASURED'
        },
        insights: [e2eResult?.reason || '缺少有效的 baseline 與變異測試證據，拒絕產生品質分數。'],
        timestamp: new Date().toISOString()
      };
    }

    let baseScore = 60 + (killRate * 0.4);

    // 1. 變異測試擊殺率權重
    if (killRate >= 90) {
      insights.push(`✅ 變異測試擊殺率優異 (${killRate}%)，測試具備高敏銳度的鑑別力。`);
    } else if (killRate < 60) {
      insights.push('⚠️ 變異擊殺率偏低，部分斷言可能過於寬鬆，存在「代碼被改壞但測試仍通過」的假陽性風險。');
    }

    // 2. 靜默錯誤攔截
    const silentErrors = hasRuntimeEvidence ? e2eResult.silentErrorsCaught.length : null;
    if (silentErrors !== null && silentErrors > 0) {
      baseScore -= 20;
      insights.push(`❌ 攔截到 ${silentErrors} 個未捕獲的瀏覽器運行期崩潰 (Console Error / Uncaught Exception)。`);
    } else if (silentErrors === 0) {
      insights.push('✅ 全域安全網未發現未捕獲的 Console Error 或 500 伺服器異常。');
    } else {
      insights.push('⚠️ 未取得瀏覽器運行期安全網證據，此項不視為通過。');
    }

    // 3. 爆炸半徑考量
    const riskLevel = impactData?.blastRadius?.riskLevel || 'LOW';
    if (riskLevel === 'HIGH') {
      insights.push(`⚠️ 依據 GitNexus 知識圖譜，本次改動爆炸半徑較大 (波及 ${impactData.blastRadius.totalAffected} 個關聯節點)，建議提高回歸測試覆蓋率。`);
    }

    // 4. Mock 補全狀態
    if (mockData?.healed) {
      insights.push(`💡 成功透過「動態自癒引擎」自動補齊缺漏欄位: [${mockData.patchedField}]，已固化為可復用快照。`);
    }

    const finalScore = Math.max(0, Math.min(100, baseScore));

    return {
      overallScore: finalScore,
      status: 'MEASURED',
      rating: finalScore >= 90 ? 'EXCELLENT' : finalScore >= 75 ? 'GOOD' : 'NEEDS_IMPROVEMENT',
      color: finalScore >= 90 ? '#10b981' : finalScore >= 75 ? '#f59e0b' : '#ef4444',
      metrics: {
        mutationKillRate: killRate,
        silentErrorsCaught: silentErrors,
        blastRadiusRisk: riskLevel,
        affectedSymbols: impactData?.blastRadius?.totalAffected || 0
      },
      evidence: {
        mutation: 'MEASURED',
        runtimeSafety: hasRuntimeEvidence ? 'MEASURED' : 'NOT_MEASURED'
      },
      insights,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = { QualityScorer };
