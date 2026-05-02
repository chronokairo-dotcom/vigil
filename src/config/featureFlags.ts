/**
 * featureFlags.ts — Runtime feature toggles via environment variables.
 */

export interface FeatureFlags {
    enableStreaming: boolean;
    enableMultimodalAgents: boolean;
    enableSleepConsolidation: boolean;
    enableVectorMemory: boolean;
    enableApprovalFlow: boolean;
    enableMetricsCollection: boolean;
    enableAutonomousModification: boolean;
    enableDeepRetrieval: boolean;
    enableJitEngine: boolean;
    /**
     * Master switch for any LLM usage (vscode.lm + CLI providers).
     * Defaults to true. Set `VIGIL_FEATURE_LLM=0` (or `VIGIL_LLM_DISABLED=1`)
     * to temporarily disable all LLM calls.
     */
    enableLlm: boolean;
}

function parseFlag(key: string, defaultValue: boolean): boolean {
    const raw = process.env[key];
    if (raw === undefined) return defaultValue;
    return raw === '1' || raw.toLowerCase() === 'true';
}

function getFlags(): FeatureFlags {
    return {
        enableStreaming: parseFlag('VIGIL_FEATURE_STREAMING', true),
        enableMultimodalAgents: parseFlag('VIGIL_FEATURE_MULTIMODAL', false),
        enableSleepConsolidation: parseFlag('VIGIL_FEATURE_SLEEP', true),
        enableVectorMemory: parseFlag('VIGIL_FEATURE_VECTOR_MEMORY', false),
        enableApprovalFlow: parseFlag('VIGIL_FEATURE_APPROVAL_FLOW', false),
        enableMetricsCollection: parseFlag('VIGIL_FEATURE_METRICS', true),
        enableAutonomousModification: parseFlag('VIGIL_FEATURE_AUTONOMOUS', false),
        enableDeepRetrieval: parseFlag('VIGIL_FEATURE_DEEP_RETRIEVAL', true),
        enableJitEngine: parseFlag('VIGIL_FEATURE_JIT', true),
        enableLlm: parseFlag('VIGIL_FEATURE_LLM', true)
            && !parseFlag('VIGIL_LLM_DISABLED', false),
    };
}

export const featureFlags: FeatureFlags = getFlags();
