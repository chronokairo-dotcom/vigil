import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { CliInferenceRequest, CliNormalizedResult, LlmCliProvider } from './types';

export interface CliAuditRecord {
    id: string;
    timestamp: string;
    provider: LlmCliProvider;
    command: string;
    args: string[];
    durationMs: number;
    exitCode: number | null;
    success: boolean;
    timedOut: boolean;
    retriesUsed: number;
    promptClass: 'operational' | 'sensitive';
    prompt?: string;
    stdout?: string;
    stderr?: string;
    metadata?: Record<string, string | number | boolean | null>;
    error?: string;
}

export interface CliAuditTrailOptions {
    dataDir?: string;
}

export class CliAuditTrail {
    private readonly baseDir: string;

    constructor(options: CliAuditTrailOptions = {}) {
        this.baseDir = options.dataDir ?? path.join(process.cwd(), 'data', 'audit', 'llm-cli');
    }

    async append(record: CliAuditRecord): Promise<void> {
        const date = record.timestamp.slice(0, 10);
        const dayDir = path.join(this.baseDir, date);
        await fs.mkdir(dayDir, { recursive: true });

        const file = path.join(dayDir, 'inference.log');
        await fs.appendFile(file, JSON.stringify(record) + '\n', 'utf8');
    }

    buildRecord(params: {
        request: CliInferenceRequest;
        provider: LlmCliProvider;
        result: CliNormalizedResult;
        promptClass: 'operational' | 'sensitive';
        persistedPrompt?: string;
        persistPromptOutput: boolean;
    }): CliAuditRecord {
        const { request, provider, result, promptClass, persistedPrompt, persistPromptOutput } = params;

        return {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            timestamp: new Date().toISOString(),
            provider,
            command: result.command,
            args: result.args,
            durationMs: result.durationMs,
            exitCode: result.exitCode,
            success: result.success,
            timedOut: result.timedOut,
            retriesUsed: result.retriesUsed,
            promptClass,
            prompt: persistPromptOutput ? persistedPrompt : undefined,
            stdout: persistPromptOutput ? result.stdout : undefined,
            stderr: persistPromptOutput ? result.stderr : undefined,
            metadata: request.metadata,
            error: result.error,
        };
    }
}
