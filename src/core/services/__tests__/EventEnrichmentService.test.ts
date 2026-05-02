import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe.sequential('EventEnrichmentService', () => {
    const originalCwd = process.cwd();
    let tempRoot = '';

    beforeEach(async () => {
        tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vigil-enrichment-'));
        process.chdir(tempRoot);
        vi.resetModules();
    });

    afterEach(async () => {
        process.chdir(originalCwd);
        if (tempRoot) {
            await fs.rm(tempRoot, { recursive: true, force: true });
        }
    });

    it('enriches batch and persists raw+enriched sidecar log', async () => {
        const executePrompt = vi.fn().mockResolvedValue({
            provider: 'gemini',
            command: 'gemini',
            args: ['-p', '...'],
            stdout: '',
            stderr: '',
            rawText: '```json\n[{"id":"evt-1","classification":"code-change","tags":["typescript","refactor"],"relevance":0.9,"entities":["src/core"],"suggestedAction":"Run targeted tests"}]\n```',
            exitCode: 0,
            success: true,
            durationMs: 10,
            timedOut: false,
            retriesUsed: 0,
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
        });

        const { EventEnrichmentService } = await import('../EventEnrichmentService');
        const { memoryManager } = await import('../../../memory');

        const service = new EventEnrichmentService({ executePrompt } as any);
        const entry = {
            id: 'evt-1',
            content: 'Updated core service logic',
            source: 'code-observer',
            projectId: 'project-a',
            timestamp: new Date('2026-04-26T10:00:00.000Z'),
        };

        const enriched = await service.enrichBatch([entry], { persist: true });

        expect(enriched).toHaveLength(1);
        expect(enriched[0].raw.id).toBe('evt-1');
        expect(enriched[0].enriched.classification).toBe('code-change');
        expect(enriched[0].enriched.tags).toContain('typescript');
        expect(enriched[0].inference.provider).toBe('gemini');

        const dateKey = '2026-04-26';
        const persisted = await memoryManager.readEnrichedLog(dateKey);
        expect(persisted).toHaveLength(1);
        expect(persisted[0].raw.id).toBe('evt-1');
        expect(persisted[0].enriched.classification).toBe('code-change');

        const logFile = path.join(process.cwd(), 'data', 'logs', 'enriched', `${dateKey}.enriched.log`);
        const fileContent = await fs.readFile(logFile, 'utf8');
        expect(fileContent).toContain('"raw"');
        expect(fileContent).toContain('"enriched"');
    });

    it('normalizes non-json output into fallback enrichment', async () => {
        const executePrompt = vi.fn().mockResolvedValue({
            provider: 'gemini',
            command: 'gemini',
            args: ['-p', '...'],
            stdout: 'I think this is important but here is no JSON output',
            stderr: '',
            rawText: 'I think this is important but here is no JSON output',
            exitCode: 0,
            success: true,
            durationMs: 10,
            timedOut: false,
            retriesUsed: 0,
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
        });

        const { EventEnrichmentService } = await import('../EventEnrichmentService');
        const service = new EventEnrichmentService({ executePrompt } as any);

        const enriched = await service.enrichBatch([
            {
                id: 'evt-2',
                content: 'Terminal output with warning',
                source: 'terminal-observer',
                projectId: 'project-z',
                timestamp: new Date('2026-04-26T11:00:00.000Z'),
            },
        ]);

        expect(enriched).toHaveLength(1);
        expect(enriched[0].enriched.classification).toBe('unclassified-event');
        expect(enriched[0].enriched.suggestedAction).toContain('Review event manually');
        expect(enriched[0].enriched.tags).toContain('terminal-observer');
    });

    it('builds provider-agnostic prompt and sends batch payload to CliInferenceService', async () => {
        const executePrompt = vi.fn().mockResolvedValue({
            provider: 'gemini',
            command: 'gemini',
            args: ['-p', '...'],
            stdout: '[]',
            stderr: '',
            rawText: '[]',
            exitCode: 0,
            success: true,
            durationMs: 10,
            timedOut: false,
            retriesUsed: 0,
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
        });

        const { EventEnrichmentService } = await import('../EventEnrichmentService');
        const service = new EventEnrichmentService({ executePrompt } as any);

        await service.enrichBatch([
            {
                id: 'evt-3',
                content: 'API endpoint failed',
                source: 'api-observer',
                projectId: 'project-y',
                timestamp: new Date('2026-04-26T12:00:00.000Z'),
            },
            {
                id: 'evt-4',
                content: 'File modified',
                source: 'code-observer',
                projectId: 'project-y',
                timestamp: new Date('2026-04-26T12:10:00.000Z'),
            },
        ]);

        expect(executePrompt).toHaveBeenCalledTimes(1);
        const requestArg = executePrompt.mock.calls[0][0];
        expect(requestArg.preferredProvider).toBe('gemini');
        expect(requestArg.fallbackProviders).toEqual(['claude', 'copilot', 'codex']);
        expect(requestArg.prompt).toContain('You are an event enrichment engine.');
        expect(requestArg.prompt).toContain('INPUT_EVENTS=');
        expect(requestArg.prompt).toContain('evt-3');
        expect(requestArg.prompt).toContain('evt-4');
    });
});
