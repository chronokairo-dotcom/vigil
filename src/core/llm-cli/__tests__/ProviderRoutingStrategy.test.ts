import { describe, expect, it } from 'vitest';
import { ProviderRoutingStrategy } from '../ProviderRoutingStrategy';

describe('ProviderRoutingStrategy', () => {
    it('uses task override when configured', () => {
        const strategy = new ProviderRoutingStrategy({
            taskOverrides: {
                reranking: 'claude',
            },
        });

        const routing = strategy.resolve({ taskType: 'reranking' });
        expect(routing.preferredProvider).toBe('claude');
        expect(routing.reason).toBe('task-override');
        expect(routing.fallbackProviders).not.toContain('claude');
    });

    it('keeps explicit request preferred provider', () => {
        const strategy = new ProviderRoutingStrategy({
            defaultProvider: 'gemini',
        });

        const routing = strategy.resolve({
            taskType: 'code-automation',
            preferredProvider: 'copilot',
            fallbackProviders: ['claude', 'gemini', 'copilot'],
        });

        expect(routing.preferredProvider).toBe('copilot');
        expect(routing.reason).toBe('request-preferred-provider');
        expect(routing.fallbackProviders).toEqual(['claude', 'gemini']);
    });

    it('assigns deterministic provider for A/B tests', () => {
        const strategy = new ProviderRoutingStrategy({
            abTests: {
                summarization: {
                    providers: ['gemini', 'claude'],
                    ratio: 0.5,
                    seed: 'exp-1',
                },
            },
        });

        const first = strategy.resolve({
            taskType: 'summarization',
            contextKey: 'workspace-a',
        });
        const second = strategy.resolve({
            taskType: 'summarization',
            contextKey: 'workspace-a',
        });

        expect(first.preferredProvider).toBe(second.preferredProvider);
        expect(first.reason).toBe('ab-test');
    });
});
