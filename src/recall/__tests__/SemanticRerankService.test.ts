import { describe, expect, it, vi } from 'vitest';
import type { RankedItem } from '../ranking';
import { SemanticRerankService } from '../SemanticRerankService';

function makeItems(): RankedItem[] {
    return [
        {
            id: 'a',
            key: 'deploy timeout',
            value: 'pipeline timeout in staging environment',
            category: 'ops',
            priority: 8,
            projectId: 'p1',
            score: 0.8,
            finalScore: 1.0,
            rank: 1,
        },
        {
            id: 'b',
            key: 'ui colors',
            value: 'dashboard palette update',
            category: 'ui',
            priority: 7,
            projectId: 'p1',
            score: 0.7,
            finalScore: 0.9,
            rank: 2,
        },
        {
            id: 'c',
            key: 'sql migration',
            value: 'schema migration and data backfill',
            category: 'db',
            priority: 6,
            projectId: 'p1',
            score: 0.6,
            finalScore: 0.75,
            rank: 3,
        },
    ];
}

describe('SemanticRerankService', () => {
    it('reranks top-N candidates and adds short reason', async () => {
        const executePrompt = vi.fn().mockResolvedValue({
            provider: 'gemini',
            command: 'gemini',
            args: ['-p', '...'],
            stdout: '',
            stderr: '',
            rawText: JSON.stringify([
                { id: 'c', semanticScore: 0.95, reason: 'Directly matches migration intent' },
                { id: 'a', semanticScore: 0.6, reason: 'Related to reliability concern' },
            ]),
            exitCode: 0,
            success: true,
            durationMs: 15,
            timedOut: false,
            retriesUsed: 0,
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
        });

        const service = new SemanticRerankService({ executePrompt } as any);
        const result = await service.rerank(makeItems(), 'database migration plan', { topN: 3 });

        expect(executePrompt).toHaveBeenCalledTimes(1);
        expect(result[0].id).toBe('c');
        expect(result[0].reason).toContain('migration');
        expect(result.find((item) => item.id === 'b')?.reason).toContain('Heuristic score retained');
    });

    it('falls back to heuristic ranking on malformed model output', async () => {
        const executePrompt = vi.fn().mockResolvedValue({
            provider: 'gemini',
            command: 'gemini',
            args: ['-p', '...'],
            stdout: 'not-json',
            stderr: '',
            rawText: 'not-json',
            exitCode: 0,
            success: true,
            durationMs: 15,
            timedOut: false,
            retriesUsed: 0,
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
        });

        const base = makeItems();
        const service = new SemanticRerankService({ executePrompt } as any);
        const result = await service.rerank(base, 'anything');

        expect(result.map((i) => i.id)).toEqual(base.map((i) => i.id));
        expect(result.map((i) => i.rank)).toEqual(base.map((i) => i.rank));
    });
});
