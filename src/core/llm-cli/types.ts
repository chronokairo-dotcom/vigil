export type LlmCliProvider = 'claude' | 'gemini' | 'copilot' | 'codex' | 'opencode';

export type LlmCliMode = 'interactive' | 'prompt';

export interface LlmCliPromptOptions {
    prompt: string;
}

export interface LlmCliSpawnCommand {
    file: string;
    args: string[];
    resolvedCommand: string;
    resolvedArgs: string[];
}

export interface LlmCliAdapter {
    provider: LlmCliProvider;
    isAvailable(): boolean;
    getSpawnCommand(mode: LlmCliMode, options?: LlmCliPromptOptions): LlmCliSpawnCommand;
}

export interface CliInferenceRequest {
    prompt: string;
    cwd?: string;
    preferredProvider: LlmCliProvider;
    fallbackProviders?: LlmCliProvider[];
    timeoutMs?: number;
    maxRetries?: number;
    backoffMs?: number;
    metadata?: Record<string, string | number | boolean | null>;
    sensitive?: boolean;
    promptClass?: 'operational' | 'sensitive';
    persistPromptOutput?: boolean;
}

export interface CliStreamHandlers {
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
    onRaw?: (chunk: string) => void;
}

export interface CliNormalizedResult {
    provider: LlmCliProvider;
    command: string;
    args: string[];
    stdout: string;
    stderr: string;
    rawText: string;
    exitCode: number | null;
    success: boolean;
    durationMs: number;
    timedOut: boolean;
    retriesUsed: number;
    startedAt: string;
    endedAt: string;
    error?: string;
}

export interface CliTelemetryEvent {
    provider: LlmCliProvider;
    command: string;
    durationMs: number;
    success: boolean;
    exitCode: number | null;
    timedOut: boolean;
    retriesUsed: number;
    error?: string;
}

export interface CliTask {
    id: string;
    request: CliInferenceRequest;
    status: 'queued' | 'running' | 'completed' | 'failed';
    enqueuedAt: string;
    startedAt?: string;
    endedAt?: string;
    result?: CliNormalizedResult;
    error?: string;
}

export interface CliTaskQueueOptions {
    concurrency?: number;
}

export interface CliExecutionPolicyOptions {
    timeoutMs?: number;
    maxRetries?: number;
    backoffMs?: number;
    requireApprovalForSensitive?: boolean;
    approvalRequester?: string;
    persistOperationalPromptOutput?: boolean;
    persistSensitivePromptOutput?: boolean;
    redactSecretsBeforeExecution?: boolean;
}
