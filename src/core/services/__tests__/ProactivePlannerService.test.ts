import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe.sequential('ProactivePlannerService', () => {
    const originalCwd = process.cwd();
    let tempRoot = '';

    beforeEach(async () => {
        tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vigil-proactive-'));
        process.chdir(tempRoot);
        vi.resetModules();
    });

    afterEach(async () => {
        process.chdir(originalCwd);
        if (tempRoot) {
            await fs.rm(tempRoot, { recursive: true, force: true });
        }
    });

    it('generates proactive plan and routes sensitive tasks to approval flow', async () => {
        const { memoryManager } = await import('../../../memory');
        await memoryManager.appendEnriched({
            raw: {
                id: 'evt-1',
                content: 'Repeated deployment timeout in production',
                source: 'terminal-observer',
                projectId: 'proj-a',
                timestamp: new Date('2026-04-26T10:00:00.000Z'),
            },
            enriched: {
                classification: 'deployment-error',
                tags: ['deployment', 'timeout'],
                relevance: 0.92,
                entities: ['production'],
                suggestedAction: 'Inspect deployment logs',
            },
            inference: {
                provider: 'gemini',
                command: 'gemini',
                rawText: '',
                exitCode: 0,
            },
            enrichedAt: new Date('2026-04-26T10:01:00.000Z').toISOString(),
        });

        const executePrompt = vi.fn().mockResolvedValue({
            provider: 'gemini',
            command: 'gemini',
            args: ['-p', '...'],
            stdout: '',
            stderr: '',
            rawText: JSON.stringify({
                risks: [
                    {
                        title: 'Deploy instability',
                        severity: 'high',
                        evidence: 'Multiple timeouts in recent runs',
                        recommendedAction: 'Stabilize rollout strategy',
                    },
                ],
                opportunities: [
                    {
                        title: 'Automate canary checks',
                        impact: 'medium',
                        evidence: 'Failures detected late',
                        suggestedAction: 'Add canary smoke tests',
                    },
                ],
                taskCandidates: [
                    {
                        title: 'Rotate production token',
                        description: 'Rotate compromised token and redeploy',
                        priority: 'high',
                        rationale: 'Security-sensitive remediation',
                        sensitivity: 'high',
                        requiresApproval: true,
                    },
                ],
                recommendations: [
                    {
                        title: 'Improve release observability',
                        rationale: 'Current logs are insufficient during incidents',
                        action: 'Add deploy stage metrics and alerts',
                    },
                ],
            }),
            exitCode: 0,
            success: true,
            durationMs: 12,
            timedOut: false,
            retriesUsed: 0,
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
        });

        const { ProactivePlannerService } = await import('../ProactivePlannerService');
        const { ApprovalFlow } = await import('../../../policies/approvalFlow');
        const service = new ProactivePlannerService({ executePrompt } as any, {
            approvalFlow: new ApprovalFlow(),
            intervalMs: 30_000,
            recentWindowDays: 1,
        });

        const result = await service.runNow('proj-a');

        expect(executePrompt).toHaveBeenCalledTimes(1);
        expect(result.plan.risks).toHaveLength(1);
        expect(result.plan.opportunities).toHaveLength(1);
        expect(result.plan.taskCandidates).toHaveLength(1);
        expect(result.plan.recommendations).toHaveLength(1);
        expect(result.pendingApprovals).toHaveLength(1);
        expect(result.pendingApprovals[0].taskTitle).toContain('Rotate production token');

        const persisted = JSON.parse(await fs.readFile(result.outputFile, 'utf8'));
        expect(persisted.projectId).toBe('proj-a');
        expect(persisted.plan.risks[0].title).toBe('Deploy instability');
    });

    it('falls back to safe plan when model output is invalid', async () => {
        const executePrompt = vi.fn().mockResolvedValue({
            provider: 'gemini',
            command: 'gemini',
            args: ['-p', '...'],
            stdout: 'non-json response',
            stderr: '',
            rawText: 'non-json response',
            exitCode: 0,
            success: true,
            durationMs: 8,
            timedOut: false,
            retriesUsed: 0,
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
        });

        const { ProactivePlannerService } = await import('../ProactivePlannerService');
        const service = new ProactivePlannerService({ executePrompt } as any, {
            intervalMs: 30_000,
            recentWindowDays: 1,
        });

        const result = await service.runNow('proj-b');

        expect(result.plan.risks).toHaveLength(0);
        expect(result.plan.opportunities).toHaveLength(0);
        expect(result.plan.taskCandidates).toHaveLength(0);
        expect(result.plan.recommendations[0].title).toContain('Manual review required');
    });
});
