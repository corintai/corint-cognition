export interface CostMetrics {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  queryCount: number;
  startTime: number;
  lastQueryTime: number;
}

export interface CostLimits {
  maxTokens: number;
  maxQueries: number;
  timeout: number;
}

export class CostController {
  private metrics = new Map<string, CostMetrics>();
  private limits: CostLimits;

  constructor(limits: Partial<CostLimits> = {}) {
    this.limits = {
      maxTokens: limits.maxTokens ?? 100000,
      maxQueries: limits.maxQueries ?? 50,
      timeout: limits.timeout ?? 3600000,
    };
  }

  initSession(sessionId: string): void {
    this.metrics.set(sessionId, {
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      queryCount: 0,
      startTime: Date.now(),
      lastQueryTime: Date.now(),
    });
  }

  recordQuery(
    sessionId: string,
    promptTokens: number,
    completionTokens: number,
  ): void {
    const metrics = this.metrics.get(sessionId);
    if (!metrics) {
      throw new Error(`Session ${sessionId} not initialized in CostController`);
    }

    metrics.promptTokens += promptTokens;
    metrics.completionTokens += completionTokens;
    metrics.totalTokens += promptTokens + completionTokens;
    metrics.queryCount += 1;
    metrics.lastQueryTime = Date.now();
  }

  checkLimits(sessionId: string): { allowed: boolean; reason?: string } {
    const metrics = this.metrics.get(sessionId);
    if (!metrics) {
      return { allowed: true };
    }

    if (metrics.totalTokens >= this.limits.maxTokens) {
      return {
        allowed: false,
        reason: `Token limit exceeded: ${metrics.totalTokens}/${this.limits.maxTokens}`,
      };
    }

    if (metrics.queryCount >= this.limits.maxQueries) {
      return {
        allowed: false,
        reason: `Query limit exceeded: ${metrics.queryCount}/${this.limits.maxQueries}`,
      };
    }

    if (this.limits.timeout > 0) {
      const elapsed = Date.now() - metrics.startTime;
      if (elapsed >= this.limits.timeout) {
        return {
          allowed: false,
          reason: `Timeout exceeded: ${elapsed}ms/${this.limits.timeout}ms`,
        };
      }
    }

    return { allowed: true };
  }

  getMetrics(sessionId: string): CostMetrics | undefined {
    return this.metrics.get(sessionId);
  }

  clearMetrics(sessionId: string): void {
    this.metrics.delete(sessionId);
  }
}
