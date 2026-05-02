import { getPromptProfile, type CliTaskType } from './PromptCatalog';
import { supportedProvidersFor } from './ProviderCapabilityMatrix';
import type { LlmCliProvider } from './types';

export interface AbTestConfig {
    providers: [LlmCliProvider, LlmCliProvider];
    ratio?: number;
    seed?: string;
}

export interface CliRoutingConfig {
    defaultProvider?: LlmCliProvider;
    fallbackOrder?: LlmCliProvider[];
    taskOverrides?: Partial<Record<CliTaskType, LlmCliProvider>>;
    abTests?: Partial<Record<CliTaskType, AbTestConfig>>;
}

export interface ResolveRoutingInput {
    taskType?: CliTaskType;
    preferredProvider?: LlmCliProvider;
    fallbackProviders?: LlmCliProvider[];
    contextKey?: string;
}

export interface ResolvedRouting {
    preferredProvider: LlmCliProvider;
    fallbackProviders: LlmCliProvider[];
    reason: string;
    taskType: CliTaskType;
}

const DEFAULT_FALLBACK_ORDER: LlmCliProvider[] = ['claude', 'copilot', 'codex', 'opencode'];

export class ProviderRoutingStrategy {
    constructor(private readonly config: CliRoutingConfig = {}) { }

    resolve(input: ResolveRoutingInput): ResolvedRouting {
        const taskType = input.taskType ?? 'summarization';
        const supported = new Set(supportedProvidersFor(taskType));
        const requestedPreferred = input.preferredProvider;

        if (requestedPreferred) {
            const preferredProvider = this.ensureSupported(requestedPreferred, taskType);
            return {
                preferredProvider,
                fallbackProviders: this.normalizeFallback(preferredProvider, input.fallbackProviders, taskType),
                reason: 'request-preferred-provider',
                taskType,
            };
        }

        const override = this.config.taskOverrides?.[taskType];
        if (override && supported.has(override)) {
            return {
                preferredProvider: override,
                fallbackProviders: this.normalizeFallback(override, undefined, taskType),
                reason: 'task-override',
                taskType,
            };
        }

        const ab = this.config.abTests?.[taskType];
        if (ab && supported.has(ab.providers[0]) && supported.has(ab.providers[1])) {
            const preferredProvider = this.pickAbProvider(taskType, ab, input.contextKey);
            return {
                preferredProvider,
                fallbackProviders: this.normalizeFallback(preferredProvider, undefined, taskType),
                reason: 'ab-test',
                taskType,
            };
        }

        const defaultCandidate = this.config.defaultProvider ?? getPromptProfile(taskType).preferredProvider;
        const preferredProvider = this.ensureSupported(defaultCandidate, taskType);
        return {
            preferredProvider,
            fallbackProviders: this.normalizeFallback(preferredProvider, undefined, taskType),
            reason: this.config.defaultProvider ? 'config-default' : 'prompt-profile-default',
            taskType,
        };
    }

    private pickAbProvider(taskType: CliTaskType, config: AbTestConfig, contextKey?: string): LlmCliProvider {
        const ratio = clampRatio(config.ratio ?? 0.5);
        const key = `${taskType}:${config.seed ?? 'seed'}:${contextKey ?? ''}`;
        const bucket = deterministicUnit(key);
        return bucket < ratio ? config.providers[0] : config.providers[1];
    }

    private ensureSupported(provider: LlmCliProvider, taskType: CliTaskType): LlmCliProvider {
        if (supportedProvidersFor(taskType).includes(provider)) {
            return provider;
        }
        return getPromptProfile(taskType).preferredProvider;
    }

    private normalizeFallback(
        preferredProvider: LlmCliProvider,
        requestFallbackProviders: LlmCliProvider[] | undefined,
        taskType: CliTaskType,
    ): LlmCliProvider[] {
        const source = requestFallbackProviders && requestFallbackProviders.length > 0
            ? requestFallbackProviders
            : (this.config.fallbackOrder && this.config.fallbackOrder.length > 0
                ? this.config.fallbackOrder
                : DEFAULT_FALLBACK_ORDER);

        const supported = new Set(supportedProvidersFor(taskType));
        const seen = new Set<LlmCliProvider>();
        const normalized: LlmCliProvider[] = [];

        for (const provider of source) {
            if (provider === preferredProvider) continue;
            if (!supported.has(provider)) continue;
            if (seen.has(provider)) continue;
            seen.add(provider);
            normalized.push(provider);
        }

        return normalized;
    }
}

function clampRatio(value: number): number {
    if (Number.isNaN(value)) return 0.5;
    return Math.min(1, Math.max(0, value));
}

function deterministicUnit(input: string): number {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }

    const normalized = (hash >>> 0) / 4294967295;
    return normalized;
}
