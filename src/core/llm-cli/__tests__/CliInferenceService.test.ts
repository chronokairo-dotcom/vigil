import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CliExecutionPolicy } from '../CliExecutionPolicy';
import { CliInferenceService } from '../CliInferenceService';
import { LlmCliRegistry } from '../LlmCliRegistry';
import type { LlmCliAdapter } from '../types';

const spawnMock = vi.fn();

vi.mock('node:child_process', async () => {
    const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
    return {
        ...actual,
        spawn: (...args: unknown[]) => spawnMock(...args),
    };
});

type ChildPlan = {
    stdout?: string[];
    stderr?: string[];
    exitCode?: number | null;
    emitError?: string;
    autoClose?: boolean;
};

function createFakeChild(plan: ChildPlan) {
    const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        kill: ReturnType<typeof vi.fn>;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = vi.fn(() => {
        setTimeout(() => child.emit('close', null), 0);
    });

    setTimeout(() => {
        for (const chunk of plan.stdout || []) {
            child.stdout.emit('data', Buffer.from(chunk, 'utf8'));
        }
        for (const chunk of plan.stderr || []) {
            child.stderr.emit('data', Buffer.from(chunk, 'utf8'));
        }

        if (plan.emitError) {
            child.emit('error', new Error(plan.emitError));
            return;
        }

        if (plan.autoClose !== false) {
            child.emit('close', plan.exitCode ?? 0);
        }
    }, 0);

    return child;
}

function buildService() {
    const registry = new LlmCliRegistry();
    const adapter: LlmCliAdapter = {
        provider: 'gemini',
        isAvailable: () => true,
        getSpawnCommand: (_mode, options) => ({
            file: 'gemini',
            args: ['-p', options?.prompt || ''],
            resolvedCommand: 'gemini',
            resolvedArgs: ['-p', options?.prompt || ''],
        }),
    };
    registry.register(adapter);

    const policy = new CliExecutionPolicy({
        timeoutMs: 100,
        maxRetries: 0,
        backoffMs: 1,
    });

    const auditTrail = {
        buildRecord: vi.fn((params) => ({ id: 'audit', ...params })),
        append: vi.fn().mockResolvedValue(undefined),
    };

    return {
        service: new CliInferenceService({ registry, policy, auditTrail: auditTrail as any }),
        auditTrail,
    };
}

describe('CliInferenceService', () => {
    beforeEach(() => {
        spawnMock.mockReset();
    });

    it('streams stdout/stderr chunks and normalizes result', async () => {
        const { service } = buildService();
        spawnMock.mockReturnValue(createFakeChild({
            stdout: ['hello ', 'world'],
            stderr: ['warn'],
            exitCode: 0,
        }));

        const onStdout = vi.fn();
        const onStderr = vi.fn();
        const onRaw = vi.fn();

        const result = await service.streamPrompt(
            {
                preferredProvider: 'gemini',
                prompt: 'short prompt',
                maxRetries: 0,
            },
            { onStdout, onStderr, onRaw },
        );

        expect(result.success).toBe(true);
        expect(result.stdout).toBe('hello world');
        expect(result.stderr).toBe('warn');
        expect(result.rawText).toContain('hello world');
        expect(result.rawText).toContain('warn');
        expect(onStdout).toHaveBeenCalledTimes(2);
        expect(onStderr).toHaveBeenCalledTimes(1);
        expect(onRaw).toHaveBeenCalledTimes(3);
    });

    it('retries once and succeeds on second attempt', async () => {
        const { service } = buildService();
        spawnMock
            .mockImplementationOnce(() => createFakeChild({ exitCode: 1, stderr: ['first failed'] }))
            .mockImplementationOnce(() => createFakeChild({ exitCode: 0, stdout: ['second ok'] }));

        const result = await service.executePrompt({
            preferredProvider: 'gemini',
            prompt: 'retry prompt',
            maxRetries: 1,
            backoffMs: 1,
            timeoutMs: 5_000,
        });

        expect(spawnMock).toHaveBeenCalledTimes(2);
        expect(result.success).toBe(true);
        expect(result.retriesUsed).toBe(1);
        expect(result.stdout).toContain('second ok');
    });

    it('marks execution as timed out and kills process', async () => {
        const { service } = buildService();
        const hangingChild = createFakeChild({ autoClose: false });
        spawnMock.mockReturnValue(hangingChild);

        const result = await service.executePrompt({
            preferredProvider: 'gemini',
            prompt: 'hang',
            timeoutMs: 10,
            maxRetries: 0,
        });

        expect(hangingChild.kill).toHaveBeenCalledWith('SIGTERM');
        expect(result.timedOut).toBe(true);
        expect(result.success).toBe(false);
        expect(result.error).toContain('timed out');
    });

    it('parses spawn errors into normalized error output', async () => {
        const { service } = buildService();
        spawnMock.mockReturnValue(createFakeChild({ emitError: 'boom' }));

        const result = await service.executePrompt({
            preferredProvider: 'gemini',
            prompt: 'parse error',
            maxRetries: 0,
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('boom');
        expect(result.exitCode).toBeNull();
    });

    it('redacts secrets before sending prompt to CLI and writes audit record', async () => {
        const { service, auditTrail } = buildService();
        spawnMock.mockReturnValue(createFakeChild({ stdout: ['ok'], exitCode: 0 }));

        await service.executePrompt({
            preferredProvider: 'gemini',
            prompt: 'token=abc123 api_key=xyz987',
            maxRetries: 0,
        });

        const spawnArgs = spawnMock.mock.calls[0]?.[1] as string[];
        expect(spawnArgs[1]).toContain('token=[REDACTED]');
        expect(spawnArgs[1]).toContain('api_key=[REDACTED]');
        expect(auditTrail.append).toHaveBeenCalledTimes(1);
    });
});
