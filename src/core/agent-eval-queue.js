const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class AgentEvalQueue {
  constructor(projectPath) {
    this.projectPath = path.resolve(projectPath);
    this.jobsDir = path.join(this.projectPath, '.test-eval', 'agent-jobs');
    fs.mkdirSync(this.jobsDir, { recursive: true });
  }

  createSkillJob({ skillPath, skillName, cases }) {
    if (!skillPath || !Array.isArray(cases) || cases.length === 0) {
      throw new Error('skillPath and at least one case are required');
    }

    const jobId = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const request = {
      schemaVersion: 1,
      jobId,
      mode: 'skill-eval',
      status: 'PENDING_AGENT',
      createdAt: new Date().toISOString(),
      projectPath: this.projectPath,
      skillPath,
      skillName: skillName || path.basename(path.dirname(skillPath)),
      cases: cases.map((testCase, index) => ({
        id: String(testCase.id || index + 1),
        query: testCase.input || testCase.query
      })),
      instructions: [
        'Read the target SKILL.md and evaluate each query independently.',
        'Actually follow the agent routing decision: set triggered=true only when the skill was loaded and applied.',
        'Base each decision only on the query and the routing behavior observed in a fresh agent context.',
        'Submit one observation for every case ID using agent-eval complete.'
      ],
      resultSchema: {
        observations: [{
          id: 'case-id',
          triggered: true,
          output: 'actual agent output',
          promptTokens: 'optional number from the agent runtime',
          completionTokens: 'optional number from the agent runtime',
          tokenMeasurementReason: 'required explanation when token values are unavailable',
          latencyMs: 'optional number from the agent runtime',
          qualityChecks: [{ name: 'contract requirement', passed: true, evidence: 'observable evidence' }]
        }]
      }
    };

    const labels = {
      jobId,
      cases: cases.map((testCase, index) => ({
        id: String(testCase.id || index + 1),
        type: testCase.type,
        expectedTrigger: Boolean(testCase.expectedTrigger)
      }))
    };
    this.writeJsonAtomic(this.requestPath(jobId), request);
    this.writeJsonAtomic(this.labelsPath(jobId), labels);
    return request;
  }

  listPending() {
    return fs.readdirSync(this.jobsDir)
      .filter(name => name.endsWith('.request.json'))
      .map(name => this.readJson(path.join(this.jobsDir, name)))
      .filter(Boolean)
      .filter(request => !fs.existsSync(this.resultPath(request.jobId)))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  getNext() {
    return this.listPending()[0] || null;
  }

  getStatus(jobId) {
    const request = this.readJson(this.requestPath(jobId));
    if (!request) return null;
    const result = this.readJson(this.resultPath(jobId));
    const labels = result ? this.readJson(this.labelsPath(jobId)) : null;
    const evaluationCases = result && labels
      ? request.cases.map(testCase => ({
        ...testCase,
        ...labels.cases.find(label => label.id === testCase.id)
      }))
      : null;
    return result
      ? { status: 'COMPLETED', request, result, evaluationCases }
      : { status: 'PENDING_AGENT', request, result: null };
  }

  submit(jobId, payload) {
    const request = this.readJson(this.requestPath(jobId));
    if (!request) throw new Error(`Agent evaluation job not found: ${jobId}`);
    if (fs.existsSync(this.resultPath(jobId))) {
      throw new Error(`Agent evaluation job already completed: ${jobId}`);
    }

    const observations = payload && payload.observations;
    if (!Array.isArray(observations)) throw new Error('observations must be an array');
    const expectedIds = request.cases.map(testCase => testCase.id).sort();
    const actualIds = observations.map(observation => String(observation.id)).sort();
    if (JSON.stringify(expectedIds) !== JSON.stringify(actualIds)) {
      throw new Error('observations must contain every requested case ID exactly once');
    }
    if (observations.some(observation => typeof observation.triggered !== 'boolean')) {
      throw new Error('every observation.triggered must be boolean');
    }
    for (const observation of observations) {
      if (observation.qualityChecks !== undefined && !Array.isArray(observation.qualityChecks)) {
        throw new Error('observation.qualityChecks must be an array when provided');
      }
      if ((observation.qualityChecks || []).some(check => !check || typeof check.name !== 'string' || typeof check.passed !== 'boolean' || typeof check.evidence !== 'string')) {
        throw new Error('every quality check requires name, boolean passed, and evidence');
      }
      const hasPromptTokens = Number.isFinite(observation.promptTokens);
      const hasCompletionTokens = Number.isFinite(observation.completionTokens);
      if (hasPromptTokens !== hasCompletionTokens) {
        throw new Error('promptTokens and completionTokens must be provided together');
      }
      if (!hasPromptTokens && observation.tokenMeasurementReason !== undefined && typeof observation.tokenMeasurementReason !== 'string') {
        throw new Error('tokenMeasurementReason must be a string when provided');
      }
    }

    const result = {
      schemaVersion: 1,
      jobId,
      status: 'COMPLETED',
      completedAt: new Date().toISOString(),
      agent: payload.agent || 'desktop-agent',
      observations: observations.map(observation => {
        const hasTokenMeasurement = Number.isFinite(observation.promptTokens)
          && Number.isFinite(observation.completionTokens);
        return {
          id: String(observation.id),
          triggered: observation.triggered,
          output: typeof observation.output === 'string' ? observation.output : null,
          promptTokens: hasTokenMeasurement ? observation.promptTokens : null,
          completionTokens: hasTokenMeasurement ? observation.completionTokens : null,
          tokenMeasurementStatus: hasTokenMeasurement ? 'MEASURED' : 'UNAVAILABLE',
          tokenMeasurementReason: hasTokenMeasurement
            ? null
            : (observation.tokenMeasurementReason || 'Agent runtime did not expose prompt/completion token usage.'),
          latencyMs: Number.isFinite(observation.latencyMs) ? observation.latencyMs : null,
          qualityChecks: (observation.qualityChecks || []).map(check => ({
            name: check.name,
            passed: check.passed,
            evidence: check.evidence
          }))
        };
      })
    };
    this.writeJsonAtomic(this.resultPath(jobId), result);
    return result;
  }

  requestPath(jobId) {
    return path.join(this.jobsDir, `${jobId}.request.json`);
  }

  resultPath(jobId) {
    return path.join(this.jobsDir, `${jobId}.result.json`);
  }

  labelsPath(jobId) {
    return path.join(this.jobsDir, `${jobId}.labels.json`);
  }

  readJson(filePath) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      return null;
    }
  }

  writeJsonAtomic(filePath, value) {
    const tempPath = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
  }
}

module.exports = { AgentEvalQueue };