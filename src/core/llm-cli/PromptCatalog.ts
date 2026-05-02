import type { LlmCliProvider } from './types';

export type CliTaskType =
    | 'summarization'
    | 'enrichment'
    | 'reranking'
    | 'proactive-planning'
    | 'long-analysis'
    | 'code-automation';

export interface PromptProfile {
    taskType: CliTaskType;
    schemaId: string;
    preferredProvider: LlmCliProvider;
    description: string;
}

// Provider-agnostic prompt/schema catalog with gemini as default first choice.
export const PROMPT_PROFILES: Record<CliTaskType, PromptProfile> = {
    summarization: {
        taskType: 'summarization',
        schemaId: 'summary.v1',
        preferredProvider: 'gemini',
        description: 'Narrative summaries and structured day/session outputs.',
    },
    enrichment: {
        taskType: 'enrichment',
        schemaId: 'event-enrichment.v1',
        preferredProvider: 'gemini',
        description: 'Semantic event enrichment with tags, entities, and relevance.',
    },
    reranking: {
        taskType: 'reranking',
        schemaId: 'rerank.v1',
        preferredProvider: 'gemini',
        description: 'Semantic reranking of retrieved context windows.',
    },
    'proactive-planning': {
        taskType: 'proactive-planning',
        schemaId: 'proactive-plan.v1',
        preferredProvider: 'gemini',
        description: 'Proactive risk/opportunity/task recommendations.',
    },
    'long-analysis': {
        taskType: 'long-analysis',
        schemaId: 'analysis.v1',
        preferredProvider: 'claude',
        description: 'Deep and long-form reflective analysis tasks.',
    },
    'code-automation': {
        taskType: 'code-automation',
        schemaId: 'code-automation.v1',
        preferredProvider: 'copilot',
        description: 'Repository coding and automation-oriented tasks.',
    },
};

export function getPromptProfile(taskType?: string): PromptProfile {
    if (taskType && taskType in PROMPT_PROFILES) {
        return PROMPT_PROFILES[taskType as CliTaskType];
    }
    return PROMPT_PROFILES.summarization;
}
