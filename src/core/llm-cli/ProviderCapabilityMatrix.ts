import type { LlmCliProvider } from './types';
import type { CliTaskType } from './PromptCatalog';

export interface CliCapability {
    supported: boolean;
    quality: 'low' | 'medium' | 'high';
    notes: string;
}

export type CliCapabilityMatrix = Record<LlmCliProvider, Record<CliTaskType, CliCapability>>;

const UNSUPPORTED: CliCapability = {
    supported: false,
    quality: 'low',
    notes: 'Not a recommended provider for this task type.',
};

export const CLI_CAPABILITY_MATRIX: CliCapabilityMatrix = {
    gemini: {
        summarization: { supported: true, quality: 'high', notes: 'Primary provider for summaries.' },
        enrichment: { supported: true, quality: 'high', notes: 'Primary provider for event enrichment.' },
        reranking: { supported: true, quality: 'high', notes: 'Primary provider for semantic reranking.' },
        'proactive-planning': { supported: true, quality: 'high', notes: 'Primary provider for proactive planning.' },
        'long-analysis': { supported: true, quality: 'medium', notes: 'Capable, but not default for very long analysis.' },
        'code-automation': { supported: true, quality: 'medium', notes: 'Can automate code tasks when needed.' },
    },
    claude: {
        summarization: { supported: true, quality: 'medium', notes: 'Reliable fallback for summaries.' },
        enrichment: { supported: true, quality: 'medium', notes: 'Good fallback for enrichment.' },
        reranking: { supported: true, quality: 'medium', notes: 'Good fallback for reranking.' },
        'proactive-planning': { supported: true, quality: 'medium', notes: 'Useful for broader planning narratives.' },
        'long-analysis': { supported: true, quality: 'high', notes: 'Preferred for long and reflective analysis.' },
        'code-automation': { supported: true, quality: 'medium', notes: 'Supports code tasks, but not the primary choice.' },
    },
    copilot: {
        summarization: { supported: true, quality: 'medium', notes: 'Fallback option for summaries.' },
        enrichment: { supported: true, quality: 'medium', notes: 'Fallback option for enrichment.' },
        reranking: { supported: true, quality: 'low', notes: 'Available fallback, lower quality for reranking.' },
        'proactive-planning': { supported: true, quality: 'medium', notes: 'Fallback option for planning.' },
        'long-analysis': { supported: true, quality: 'medium', notes: 'Can be used for medium-depth analysis.' },
        'code-automation': { supported: true, quality: 'high', notes: 'Preferred provider for repository coding tasks.' },
    },
    codex: {
        summarization: { supported: true, quality: 'low', notes: 'Optional fallback when installed.' },
        enrichment: { supported: true, quality: 'low', notes: 'Optional fallback when installed.' },
        reranking: { supported: true, quality: 'low', notes: 'Optional fallback when installed.' },
        'proactive-planning': { supported: true, quality: 'low', notes: 'Optional fallback when installed.' },
        'long-analysis': { supported: true, quality: 'low', notes: 'Optional fallback when installed.' },
        'code-automation': { supported: true, quality: 'medium', notes: 'Optional code automation provider when installed.' },
    },
    opencode: {
        summarization: { supported: true, quality: 'medium', notes: 'Optional fallback when installed.' },
        enrichment: { supported: true, quality: 'medium', notes: 'Optional fallback when installed.' },
        reranking: { supported: true, quality: 'low', notes: 'Optional fallback when installed.' },
        'proactive-planning': { supported: true, quality: 'medium', notes: 'Optional fallback when installed.' },
        'long-analysis': { supported: true, quality: 'medium', notes: 'Optional fallback when installed.' },
        'code-automation': { supported: true, quality: 'high', notes: 'Preferred provider for repository coding tasks when installed.' },
    },
};

export function supportsTask(provider: LlmCliProvider, taskType: CliTaskType): boolean {
    return CLI_CAPABILITY_MATRIX[provider]?.[taskType]?.supported ?? false;
}

export function supportedProvidersFor(taskType: CliTaskType): LlmCliProvider[] {
    return (Object.keys(CLI_CAPABILITY_MATRIX) as LlmCliProvider[])
        .filter((provider) => supportsTask(provider, taskType));
}

export function getCapability(provider: LlmCliProvider, taskType: CliTaskType): CliCapability {
    return CLI_CAPABILITY_MATRIX[provider]?.[taskType] ?? UNSUPPORTED;
}
