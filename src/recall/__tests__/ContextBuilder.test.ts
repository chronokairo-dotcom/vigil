import { describe, expect, it, vi } from 'vitest';
import { ContextBuilder } from '../contextBuilder';

describe('ContextBuilder', () => {
    it('runs lexical + vector retrieval then applies semantic CLI rerank', async () => {
        const fakeRetriever = {
            retrieve: vi.fn().mockResolvedValue([
                {
                    id: '1',
                    key: 'deploy issue',
                    value: 'timeout while deploying',
                    category: 'ops',
                    priority: 9,
                    projectId: 'p1',
                    score: 0.9,
                },
                {
                    id: '2',
                    key: 'readme update',
                    value: 'documentation tweaks',
                    category: 'docs',
                    priority: 5,
                    projectId: 'p1',
                    score: 0.5,
                },
            ]),
            retrieveSemantic: vi.fn().mockResolvedValue([
                {
                    id: '3',
                    key: 'semantic note',
                    value: 'matches intent semantically',
                    category: 'notes',
                    priority: 7,
                    projectId: 'p1',
                    score: 0.85,
                },
            ]),
        };

        const fakeReranker = {
            rerank: vi.fn().mockImplementation(async (items) => {
                const docs = items.find((item) => item.key === 'readme update') ?? items[0];
                const secondary = items.find((item) => item.id !== docs.id) ?? items[0];
                return [
                    {
                        ...docs,
                        rank: 1,
                        finalScore: 2.0,
                        reason: 'Query asks for documentation context',
                    },
                    {
                        ...secondary,
                        rank: 2,
                        finalScore: 1.0,
                        reason: 'Operational issue is secondary to docs request',
                    },
                ];
            }),
        };

        const builder = new ContextBuilder({} as any, {
            retriever: fakeRetriever as any,
            semanticReranker: fakeReranker as any,
        });

        const window = await builder.build('p1', 'documentation update', 2000);

        expect(fakeRetriever.retrieve).toHaveBeenCalledWith('p1', 'documentation update', 50);
        expect(fakeRetriever.retrieveSemantic).toHaveBeenCalledWith('p1', 'documentation update', 50);
        expect(fakeReranker.rerank).toHaveBeenCalledTimes(1);
        expect(window.items[0].key).toBe('readme update');
        expect(window.items[0].reason).toContain('documentation');
    });
});
