import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MetricsSnapshot } from '../MetricsService';
import type { BenchmarkReport } from '../ModelBenchmarkService';

const metricsSnapshot: MetricsSnapshot = {
    timestamp: new Date('2026-04-26T10:00:00.000Z'),
    period: 'day',
    totalTasks: 120,
    successCount: 108,
    failureCount: 12,
    avgDuration: 1800,
    avgTokensUsed: 920,
    successRate: 90,
    errorRate: 10,
    byAgent: {},
    byModel: {
        gemini: {
            totalTasks: 70,
            successCount: 63,
            failureCount: 7,
            avgDuration: 1500,
            successRate: 90,
            avgTokensPerTask: 850,
        },
    },
};

const benchmarkReport: BenchmarkReport = {
    timestamp: new Date('2026-04-26T10:00:00.000Z'),
    summary: 'Benchmark day report',
    bestModel: {
        bySuccessRate: 'gemini',
        byLatency: 'gemini',
        byCostEfficiency: 'gemini',
    },
    models: [
        {
            id: 'gemini',
            metrics: metricsSnapshot.byModel.gemini,
            score: 91,
        },
    ],
};

describe.sequential('SelfOptimizationService', () => {
    const originalCwd = process.cwd();
    let tempRoot = '';

    beforeEach(async () => {
        tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vigil-selfopt-'));
        process.chdir(tempRoot);
        vi.resetModules();
    });

    afterEach(async () => {
        process.chdir(originalCwd);
        if (tempRoot) {
            await fs.rm(tempRoot, { recursive: true, force: true });
        }
    });

    it('generates optimization plan and persists artifacts', async () => {
        const executePrompt = vi.fn().mockResolvedValue({
            provider: 'gemini',
            command: 'gemini',
            args: ['-p', '...'],
            stdout: '',
            stderr: '',
            rawText: JSON.stringify({
                configImprovements: [
                    {
                        title: 'Increase retry limit',
                        settingKey: 'llm.retry.max',
                        proposedValue: '4',
                        rationale: 'Transient failures increased',
                        expectedImpact: 'Reduce recoverable failures',
                    },
                ],
                policyChanges: [
                    {
                        title: 'Tighten high-risk command policy',
                        policyArea: 'guardrails.commands',
                        change: 'Require explicit approval for destructive git operations',
                        rationale: 'Avoid accidental destructive actions',
                        riskLevel: 'medium',
                    },
                ],
                routingChanges: [
                    {
                        taskType: 'long-analysis',
                        recommendedProvider: 'claude',
                        rationale: 'Better consistency for long reasoning tasks',
                        confidence: 0.82,
                    },
                ],
            }),
            exitCode: 0,
            success: true,
            durationMs: 22,
            timedOut: false,
            retriesUsed: 0,
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
        });

        const { SelfOptimizationService } = await import('../SelfOptimizationService');

        const service = new SelfOptimizationService(
            { executePrompt } as any,
            { getMetrics: () => metricsSnapshot } as any,
            { generateReport: () => benchmarkReport } as any,
            { intervalMs: 60_000 },
        );

        const run = await service.runNow();

        expect(executePrompt).toHaveBeenCalledTimes(1);
        expect(run.plan.configImprovements).toHaveLength(1);
        expect(run.plan.policyChanges).toHaveLength(1);
        expect(run.plan.routingChanges).toHaveLength(1);
        expect(run.suggestions.length).toBeGreaterThanOrEqual(3);

        const persisted = JSON.parse(await fs.readFile(run.outputFile, 'utf8'));
        expect(persisted.provider).toBe('gemini');
        expect(persisted.plan.configImprovements[0].settingKey).toBe('llm.retry.max');
    });

    it('records accepted/rejected optimization history', async () => {
        const executePrompt = vi.fn().mockResolvedValue({
            provider: 'gemini',
            command: 'gemini',
            args: ['-p', '...'],
            stdout: '',
            stderr: '',
            rawText: JSON.stringify({
                configImprovements: [
                    {
                        title: 'Tune timeout',
                        settingKey: 'llm.timeout.ms',
                        proposedValue: '45000',
                        rationale: 'Current timeout too aggressive',
                        expectedImpact: 'Lower false timeouts',
                    },
                ],
                policyChanges: [],
                routingChanges: [],
            }),
            exitCode: 0,
            success: true,
            durationMs: 18,
            timedOut: false,
            retriesUsed: 0,
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
        });

        const { SelfOptimizationService } = await import('../SelfOptimizationService');

        const service = new SelfOptimizationService(
            { executePrompt } as any,
            { getMetrics: () => metricsSnapshot } as any,
            { generateReport: () => benchmarkReport } as any,
            { intervalMs: 60_000 },
        );

        const run = await service.runNow();
        const target = run.suggestions[0];

        const accepted = await service.recordDecision({
            suggestionId: target.id,
            decision: 'accepted',
            actor: 'tester',
            reason: 'Looks safe',
        });

        expect(accepted.decision).toBe('accepted');

        const history = await service.getDecisionHistory();
        expect(history).toHaveLength(1);
        expect(history[0].suggestionId).toBe(target.id);
        expect(history[0].actor).toBe('tester');
    });
});
