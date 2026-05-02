import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';

const spawnSyncMock = vi.fn();

vi.mock('node:child_process', () => ({
    spawnSync: (...args: unknown[]) => spawnSyncMock(...args),
}));

describe('llm-cli adapters', () => {
    beforeEach(() => {
        spawnSyncMock.mockReset();
        spawnSyncMock.mockReturnValue({ status: 1 });
    });

    it('checks availability for every supported provider adapter', async () => {
        const {
            GeminiCliAdapter,
            ClaudeCliAdapter,
            CopilotCliAdapter,
            CodexCliAdapter,
        } = await import('../adapters');

        const available = new Set(['gemini', 'claude-code', 'gh', 'codex']);
        spawnSyncMock.mockImplementation((_: string, args: string[]) => ({
            status: available.has(args[0]) ? 0 : 1,
        }));

        expect(new GeminiCliAdapter().isAvailable()).toBe(true);
        expect(new ClaudeCliAdapter().isAvailable()).toBe(true);
        expect(new CopilotCliAdapter().isAvailable()).toBe(true);
        expect(new CodexCliAdapter().isAvailable()).toBe(true);
    });

    it('builds prompt command for short prompts', async () => {
        const { GeminiCliAdapter } = await import('../adapters');

        spawnSyncMock.mockImplementation((_: string, args: string[]) => ({
            status: args[0] === 'gemini' ? 0 : 1,
        }));

        const cmd = new GeminiCliAdapter().getSpawnCommand('prompt', { prompt: 'oi' });

        expect(cmd.resolvedCommand).toBe('gemini');
        expect(cmd.resolvedArgs).toEqual(['-p', 'oi']);
        if (process.platform === 'win32') {
            expect(cmd.args).toEqual(['/d', '/c', 'gemini', '-p', 'oi']);
        } else {
            expect(cmd.args).toEqual(['-p', 'oi']);
        }
    });

    it('preserves long prompt payload as a single argument', async () => {
        const { GeminiCliAdapter } = await import('../adapters');

        spawnSyncMock.mockImplementation((_: string, args: string[]) => ({
            status: args[0] === 'gemini' ? 0 : 1,
        }));

        const longPrompt = Array.from({ length: 120 }, (_, idx) => `linha-${idx}`).join(' ');
        const cmd = new GeminiCliAdapter().getSpawnCommand('prompt', { prompt: longPrompt });

        expect(cmd.resolvedArgs).toEqual(['-p', longPrompt]);
        if (process.platform === 'win32') {
            expect(cmd.args[4]).toBe(longPrompt);
        } else {
            expect(cmd.args[1]).toBe(longPrompt);
        }
    });
});
