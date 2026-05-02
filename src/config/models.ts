/**
 * Vigil model catalog.

 */

export interface ModelInfo {
    id: string;
    name: string;
    description: string;
    provider: string;
    baseUrl: string;
    group: 'auto' | 'recommended' | 'other';
}

export const AVAILABLE_MODELS: ModelInfo[] = [
    // ── Auto ─────────────────────────────────────────────────────────────────
    { id: 'auto', name: 'Auto', description: 'Router: melhora o prompt e elege o modelo ideal', provider: 'vscode', baseUrl: 'http://localhost:11434', group: 'auto' },

    // ── Recommended ──────────────────────────────────────────────────────────
    { id: 'claude-haiku-4.5', name: 'Claude Haiku 4.5', description: 'Rapido y eficiente · 0.33x', provider: 'vscode', baseUrl: 'http://localhost:11434', group: 'recommended' },
    { id: 'claude-opus-4.7', name: 'Claude Opus 4.7', description: 'Mas capaz · 7.5x', provider: 'vscode', baseUrl: 'http://localhost:11434', group: 'recommended' },
    { id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5', description: 'Balanceado · 1x', provider: 'vscode', baseUrl: 'http://localhost:11434', group: 'recommended' },
    { id: 'claude-sonnet-4.6', name: 'Claude Sonnet 4.6', description: 'Ultimo Anthropic · High · 1x', provider: 'vscode', baseUrl: 'http://localhost:11434', group: 'recommended' },
    { id: 'gpt-5.4', name: 'GPT-5.4', description: 'OpenAI flagship · Medium · 1x', provider: 'vscode', baseUrl: 'http://localhost:11434', group: 'recommended' },

    // ── Other Models ─────────────────────────────────────────────────────────
    { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', description: 'Anthropic · 1x', provider: 'vscode', baseUrl: 'http://localhost:11434', group: 'other' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Google · 1x', provider: 'vscode', baseUrl: 'http://localhost:11434', group: 'other' },
    { id: 'gemini-3-flash', name: 'Gemini 3 Flash (Preview)', description: 'Google rapido · 0.33x', provider: 'vscode', baseUrl: 'http://localhost:11434', group: 'other' },
    { id: 'gemini-3.1-pro', name: 'Gemini 3.1 Pro (Preview)', description: 'Google avanzado · 1x', provider: 'vscode', baseUrl: 'http://localhost:11434', group: 'other' },
    { id: 'gpt-4.1', name: 'GPT-4.1', description: 'OpenAI · 0x', provider: 'vscode', baseUrl: 'http://localhost:11434', group: 'other' },
    { id: 'gpt-4o', name: 'GPT-4o', description: 'OpenAI multimodal · 0x', provider: 'vscode', baseUrl: 'http://localhost:11434', group: 'other' },
    { id: 'gpt-5-mini', name: 'GPT-5 mini', description: 'OpenAI rapido · Medium · 0x', provider: 'vscode', baseUrl: 'http://localhost:11434', group: 'other' },
    { id: 'gpt-5.2', name: 'GPT-5.2', description: 'OpenAI · Medium · 1x', provider: 'vscode', baseUrl: 'http://localhost:11434', group: 'other' },
    { id: 'gpt-5.2-codex', name: 'GPT-5.2-Codex', description: 'OpenAI codigo · Medium · 1x', provider: 'vscode', baseUrl: 'http://localhost:11434', group: 'other' },
    { id: 'gpt-5.3-codex', name: 'GPT-5.3-Codex', description: 'OpenAI codigo · Medium · 1x', provider: 'vscode', baseUrl: 'http://localhost:11434', group: 'other' },
    { id: 'gpt-5.4-mini', name: 'GPT-5.4 mini', description: 'OpenAI · Medium · 0.33x', provider: 'vscode', baseUrl: 'http://localhost:11434', group: 'other' },
    { id: 'grok-code-fast-1', name: 'Grok Code Fast 1', description: 'xAI codigo · 0.25x', provider: 'vscode', baseUrl: 'http://localhost:11434', group: 'other' },
    { id: 'raptor-mini-preview', name: 'Raptor mini (Preview)', description: 'Router de modelos · 0x', provider: 'vscode', baseUrl: 'http://localhost:11434', group: 'other' },

    // ── Ollama Local Models ──────────────────────────────────────────────────
    { id: 'ollama-mistral', name: 'Mistral (Ollama)', description: 'Modelo aberto · Rápido · 0.5x', provider: 'ollama', baseUrl: 'http://localhost:11434', group: 'other' },
    { id: 'ollama-llama2', name: 'Llama 2 (Ollama)', description: 'Modelo aberto · Capaz · 1x', provider: 'ollama', baseUrl: 'http://localhost:11434', group: 'other' },
    { id: 'ollama-neural-chat', name: 'Neural Chat (Ollama)', description: 'Especializado en chat · 0.75x', provider: 'ollama', baseUrl: 'http://localhost:11434', group: 'other' },
    { id: 'ollama-dolphin', name: 'Dolphin (Ollama)', description: 'Modelo code-tuned · 1x', provider: 'ollama', baseUrl: 'http://localhost:11434', group: 'other' },
];

/**
 * Get model metadata by id. Returns undefined if not in catalog.
 */
export function getModelInfo(id: string): ModelInfo | undefined {
    return AVAILABLE_MODELS.find(m => m.id === id);
}

/**
 * Get the default base URL for a model.
 */
export function getDefaultBaseUrl(id: string): string {
    return getModelInfo(id)?.baseUrl ?? 'http://localhost:11434';
}

/**
 * Whether the model uses the OpenAI Responses API (`/v1/responses`).
 * True for GPT-5 series.
 */
export function usesResponsesApi(id: string): boolean {
    const lower = id.toLowerCase();
    return lower.startsWith('gpt-5') || /^gpt-5[\.-]/.test(lower);
}

/**
 * Get the provider id for a given model id.
 */
export function getProviderFromModel(id: string): string {
    return getModelInfo(id)?.provider ?? 'anthropic';
}

/**
 * All models in a given group.
 */
export function getModelsByGroup(group: ModelInfo['group']): ModelInfo[] {
    return AVAILABLE_MODELS.filter(m => m.group === group);
}

/**
 * The default model id.
 */
export const DEFAULT_MODEL = 'auto';
