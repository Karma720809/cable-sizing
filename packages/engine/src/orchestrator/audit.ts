/**
 * Audit trail builder — PRD §6.3 / §12.
 *
 * Accumulates AuditStep records emitted by the pipeline. The step
 * counter is monotonic within a single sizeCable() invocation, so
 * downstream consumers (UI, reports) can reconstruct execution order
 * without having to trust array insertion order.
 */

import type { AuditCriterion, AuditStep, Decision } from '../types/index.js';

export class AuditBuilder {
  private steps: AuditStep[] = [];
  private counter = 0;

  add(entry: {
    criterion: AuditCriterion;
    inputs: Record<string, unknown>;
    formula: string;
    intermediateValues: Record<string, unknown>;
    decision: Decision;
    reason: string;
    code?: string;
  }): AuditStep {
    this.counter += 1;
    const step: AuditStep = {
      step: this.counter,
      criterion: entry.criterion,
      inputs: entry.inputs,
      formula: entry.formula,
      intermediateValues: entry.intermediateValues,
      decision: entry.decision,
      reason: entry.reason,
      ...(entry.code ? { code: entry.code } : {}),
    };
    this.steps.push(step);
    return step;
  }

  build(): AuditStep[] {
    return this.steps.slice();
  }
}
