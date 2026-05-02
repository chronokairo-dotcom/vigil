import type { CliNormalizedResult, LlmCliProvider } from './types';

export interface CliRawExecutionResult {
    provider: LlmCliProvider;
    command: string;
    args: string[];
    stdout: string;
    stderr: string;
    exitCode: number | null;
    durationMs: number;
    timedOut: boolean;
    retriesUsed: number;
    startedAt: Date;
    endedAt: Date;
    error?: string;
}

export class CliResultNormalizer {
    normalize(result: CliRawExecutionResult): CliNormalizedResult {
        const rawText = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
        return {
            provider: result.provider,
            command: result.command,
            args: result.args,
            stdout: result.stdout,
            stderr: result.stderr,
            rawText,
            exitCode: result.exitCode,
            success: result.exitCode === 0 && !result.timedOut,
            durationMs: result.durationMs,
            timedOut: result.timedOut,
            retriesUsed: result.retriesUsed,
            startedAt: result.startedAt.toISOString(),
            endedAt: result.endedAt.toISOString(),
            error: result.error,
        };
    }
}
