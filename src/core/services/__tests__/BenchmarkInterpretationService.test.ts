import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BenchmarkReport } from '../ModelBenchmarkService';

const benchmarkReport: BenchmarkReport = {
    timestamp: new Date('2026-04-26T12:00:00.000Z'),
    summary: 'Benchmark report sample',
    bestModel: {
        bySuccessRate: 'gemini-2.5-pro',
        byLatency: 'copilot-fast',
        byCostEfficiency: 'gemini-2.5-flash',
    },
    models: [
        {
            id: 'gemini-2.5-pro',
            score: 92,
            metrics: {
                totalTasks: 80,
                successCount: 74,
                failureCount: 6,
                avgDuration: 2200,
                successRate: 92.5,
                avgTokensPerTask: 1100,
            },
        },
    ],
};

describe.sequential('BenchmarkInterpretationService', () => {
    const originalCwd = process.cwd();
    let tempRoot = '';

    beforeEach(async () => {
        tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vigil-bench-int-'));
        process.chdir(tempRoot);
        vi.resetModules();
    });

    afterEach(async () => {
        process.chdir(originalCwd);
        if (tempRoot) {
            await fs.rm(tempRoot, { recursive: true, force: true });
        }
    });

    it('generates interpretation and routing policy using CLI output', async () => {
        const executePrompt = vi.fn().mockResolvedValue({
            provider: 'gemini',
            command: 'gemini',
            args: ['-p', '...'],
            stdout: '',
            stderr: '',
            rawText: JSON.stringify({
                modelExplanations: [
                    {
                        modelId: 'gemini-2.5-pro',
                        strengths: ['High reliability'],
                        weaknesses: ['Higher token cost'],
                        bestUseCases: ['deep-analysis'],
                    },
                ],
                routingPolicy: [
                    {
                        taskType: 'deep-analysis',
                        preferredProvider: 'claude',
                        fallbackProviders: ['gemini', 'copilot'],
                        rationale: 'Long-form reasoning quality is stronger',
                        confidence: 0.81,
                    },
                    {
                        taskType: 'general',
                        preferredProvider: 'gemini',
                        fallbackProviders: ['claude', 'copilot', 'codex'],
                        rationale: 'Best overall score',
                        confidence: 0.74,
                    },
                ],
                summary: 'Use claude for deep-analysis and gemini for general tasks.',
            }),
            exitCode: 0,
            success: true,
            durationMs: 12,
            timedOut: false,
            retriesUsed: 0,
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
        });

        const { BenchmarkInterpretationService } = await import('../BenchmarkInterpretationService');
        const service = new BenchmarkInterpretationService(
            { executePrompt } as any,
            { generateReport: () => benchmarkReport } as any,
        );

        const result = await service.run('day');
        expect(executePrompt).toHaveBeenCalledTimes(1);
        expect(result.interpretation.routingPolicy).toHaveLength(2);

        const recommendation = await service.recommendForObjective('deep analysis of production incidents');
        expect(recommendation?.preferredProvider).toBe('claude');

        const persisted = JSON.parse(await fs.readFile(result.outputFile, 'utf8'));
        expect(persisted.period).toBe('day');
        expect(persisted.interpretation.summary).toContain('deep-analysis');
    });

    it('falls back to quantitative benchmark when model output is invalid', async () => {
        const executePrompt = vi.fn().mockResolvedValue({
            provider: 'gemini',
            command: 'gemini',
            args: ['-p', '...'],
            stdout: 'invalid',
            stderr: '',
            rawText: 'invalid',
            exitCode: 0,
            success: true,
            durationMs: 9,
            timedOut: false,
            retriesUsed: 0,
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
        });

        const { BenchmarkInterpretationService } = await import('../BenchmarkInterpretationService');
        const service = new BenchmarkInterpretationService(
            { executePrompt } as any,
            { generateReport: () => benchmarkReport } as any,
        );

        const result = await service.run('day');
        expect(result.interpretation.routingPolicy[0].taskType).toBe('general');
        expect(result.interpretation.summary).toContain('Fallback interpretation');
    });
});
