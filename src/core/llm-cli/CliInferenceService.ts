import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { Logger } from '../utils/Logger';
import { featureFlags } from '../../config/featureFlags';
import { CliExecutionPolicy } from './CliExecutionPolicy';
import { CliAuditTrail } from './CliAuditTrail';
import { CliResultNormalizer, type CliRawExecutionResult } from './CliResultNormalizer';
import { llmCliRegistry, LlmCliRegistry } from './LlmCliRegistry';
import { redactSecrets } from './SecretRedactor';
import type {
    CliInferenceRequest,
    CliNormalizedResult,
    CliStreamHandlers,
    CliTelemetryEvent,
    LlmCliProvider,
} from './types';

export interface CliInferenceServiceOptions {
    registry?: LlmCliRegistry;
    policy?: CliExecutionPolicy;
    onTelemetry?: (event: CliTelemetryEvent) => void;
    auditTrail?: CliAuditTrail;
}

export class CliInferenceService {
    private logger = Logger.getInstance('CliInferenceService');
    private normalizer = new CliResultNormalizer();
    private registry: LlmCliRegistry;
    private policy: CliExecutionPolicy;
    private onTelemetry?: (event: CliTelemetryEvent) => void;
    private auditTrail: CliAuditTrail;

    constructor(options?: CliInferenceServiceOptions) {
        this.registry = options?.registry || llmCliRegistry;
        this.policy = options?.policy || new CliExecutionPolicy();
        this.onTelemetry = options?.onTelemetry;
        this.auditTrail = options?.auditTrail || new CliAuditTrail();
    }

    async executePrompt(
        request: CliInferenceRequest,
        streamHandlers?: CliStreamHandlers,
    ): Promise<CliNormalizedResult> {
        if (!featureFlags.enableLlm) {
            this.logger.warn('[CliInference] LLM disabled via feature flag (VIGIL_FEATURE_LLM=0)');
            const nowIso = new Date().toISOString();
            return {
                provider: (request.preferredProvider ?? 'copilot') as LlmCliProvider,
                command: 'noop',
                args: [],
                stdout: '',
                stderr: 'LLM disabled via VIGIL_FEATURE_LLM=0',
                rawText: '',
                exitCode: null,
                success: false,
                durationMs: 0,
                timedOut: false,
                retriesUsed: 0,
                startedAt: nowIso,
                endedAt: nowIso,
                error: 'LLM disabled via feature flag',
            };
        }
        const promptClass = this.policy.resolvePromptClass(request);
        const persistPromptOutput = this.policy.shouldPersistPromptOutput(request);
        const effectivePrompt = this.policy.shouldRedactSecretsBeforeExecution()
            ? redactSecrets(request.prompt.trim())
            : request.prompt.trim();

        const providers = this.resolveProviderOrder(request);
        const timeoutMs = this.policy.resolveTimeout(request);
        const maxRetries = this.policy.resolveMaxRetries(request);
        const baseBackoffMs = this.policy.resolveBackoff(request);

        let lastResult: CliNormalizedResult | null = null;

        for (const provider of providers) {
            const adapter = this.registry.get(provider);
            if (!adapter.isAvailable()) {
                this.logger.warn(`[CliInference] Provider unavailable: ${provider}`);
                continue;
            }

            await this.policy.approveIfNeeded(request, provider);

            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                const result = await this.runPromptOnce(provider, request, effectivePrompt, timeoutMs, attempt, streamHandlers);
                lastResult = result;

                const auditRecord = this.auditTrail.buildRecord({
                    request,
                    provider,
                    result,
                    promptClass,
                    persistedPrompt: effectivePrompt,
                    persistPromptOutput,
                });
                await this.auditTrail.append(auditRecord);

                if (result.success) {
                    return result;
                }

                if (!this.policy.shouldRetry(result, attempt, maxRetries)) {
                    break;
                }

                const delay = this.policy.backoffMs(attempt, baseBackoffMs);
                await sleep(delay);
            }
        }

        if (!lastResult) {
            throw new Error('No available CLI provider found for inference');
        }

        return lastResult;
    }

    async streamPrompt(
        request: CliInferenceRequest,
        streamHandlers: CliStreamHandlers,
    ): Promise<CliNormalizedResult> {
        return this.executePrompt(request, streamHandlers);
    }

    private async runPromptOnce(
        provider: LlmCliProvider,
        request: CliInferenceRequest,
        effectivePrompt: string,
        timeoutMs: number,
        retriesUsed: number,
        streamHandlers?: CliStreamHandlers,
    ): Promise<CliNormalizedResult> {
        const adapter = this.registry.get(provider);
        const spawnCommand = adapter.getSpawnCommand('prompt', { prompt: effectivePrompt });
        const cwd = this.resolveCwd(request.cwd);

        const startedAt = new Date();
        const start = Date.now();

        const raw = await new Promise<CliRawExecutionResult>((resolve) => {
            let stdout = '';
            let stderr = '';
            let rawText = '';
            let timedOut = false;
            let settled = false;

            const child = spawn(spawnCommand.file, spawnCommand.args, {
                cwd,
                env: {
                    ...process.env,
                    TERM: process.env.TERM || 'xterm-256color',
                    COLORTERM: process.env.COLORTERM || 'truecolor',
                },
                stdio: ['ignore', 'pipe', 'pipe'],
            });

            const timer = setTimeout(() => {
                timedOut = true;
                child.kill('SIGTERM');
            }, timeoutMs);

            child.stdout?.on('data', (chunk: Buffer) => {
                const text = chunk.toString('utf8');
                stdout += text;
                rawText += text;
                streamHandlers?.onStdout?.(text);
                streamHandlers?.onRaw?.(text);
            });

            child.stderr?.on('data', (chunk: Buffer) => {
                const text = chunk.toString('utf8');
                stderr += text;
                rawText += text;
                streamHandlers?.onStderr?.(text);
                streamHandlers?.onRaw?.(text);
            });

            child.on('error', (error: Error) => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timer);
                const endedAt = new Date();
                resolve({
                    provider,
                    command: spawnCommand.resolvedCommand,
                    args: spawnCommand.resolvedArgs,
                    stdout,
                    stderr,
                    exitCode: null,
                    durationMs: Date.now() - start,
                    timedOut,
                    retriesUsed,
                    startedAt,
                    endedAt,
                    error: error.message,
                });
            });

            child.on('close', (exitCode: number | null) => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timer);
                const endedAt = new Date();
                resolve({
                    provider,
                    command: spawnCommand.resolvedCommand,
                    args: spawnCommand.resolvedArgs,
                    stdout,
                    stderr,
                    exitCode,
                    durationMs: Date.now() - start,
                    timedOut,
                    retriesUsed,
                    startedAt,
                    endedAt,
                    error: timedOut ? `Command timed out after ${timeoutMs}ms` : undefined,
                });
            });
        });

        const normalized = this.normalizer.normalize(raw);

        this.onTelemetry?.({
            provider,
            command: normalized.command,
            durationMs: normalized.durationMs,
            success: normalized.success,
            exitCode: normalized.exitCode,
            timedOut: normalized.timedOut,
            retriesUsed: normalized.retriesUsed,
            error: normalized.error,
        });

        return normalized;
    }

    private resolveProviderOrder(request: CliInferenceRequest): LlmCliProvider[] {
        const seen = new Set<LlmCliProvider>();
        const ordered: LlmCliProvider[] = [];
        const append = (provider: LlmCliProvider) => {
            if (!seen.has(provider)) {
                seen.add(provider);
                ordered.push(provider);
            }
        };

        append(request.preferredProvider);
        for (const fallback of request.fallbackProviders || []) {
            append(fallback);
        }
        return ordered;
    }

    private resolveCwd(cwd?: string): string {
        if (cwd && cwd.trim() && existsSync(cwd.trim())) {
            return cwd.trim();
        }
        return process.cwd();
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
