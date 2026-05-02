/**
 * Multi-provider AI client.

 *
 * Supports: Anthropic, OpenAI, OpenAI-Responses (GPT-5), Google Gemini,
 *           Minimax, and any OpenAI-compatible service (Ollama, LocalAI, etc.)
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export interface MultiProviderMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface MultiProviderSettings {
    apiKey: string;
    model: string;
    baseUrl: string;
    maxTokens: number;
    temperature?: number;
    providerKeys?: Record<string, string>;
    openaiOrganization?: string;
    openaiProject?: string;
}

export interface ProviderConfig {
    id: string;
    name: string;
    baseUrl: string;
    apiFormat: 'anthropic' | 'openai' | 'openai-compatible' | 'openai-responses' | 'google' | 'minimax';
    authType: 'none' | 'bearer' | 'api-key' | 'query-param';
    description?: string;
}

// ─── Provider presets ──────────────────────────────────────────────────────

export const PROVIDER_PRESETS: Record<string, ProviderConfig> = {
    anthropic: {
        id: 'anthropic',
        name: 'Anthropic',
        baseUrl: 'https://api.anthropic.com',
        apiFormat: 'anthropic',
        authType: 'api-key',
    },
    openai: {
        id: 'openai',
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com',
        apiFormat: 'openai',
        authType: 'bearer',
    },
    google: {
        id: 'google',
        name: 'Google',
        baseUrl: 'https://generativelanguage.googleapis.com',
        apiFormat: 'google',
        authType: 'query-param',
    },
    minimax: {
        id: 'minimax',
        name: 'Minimax',
        baseUrl: 'https://api.minimax.chat',
        apiFormat: 'minimax',
        authType: 'bearer',
    },
    ollama: {
        id: 'ollama',
        name: 'Ollama',
        baseUrl: 'http://localhost:11434',
        apiFormat: 'openai-compatible',
        authType: 'none',
        description: 'Local Ollama server',
    },
    localai: {
        id: 'localai',
        name: 'LocalAI',
        baseUrl: 'http://localhost:8080',
        apiFormat: 'openai-compatible',
        authType: 'none',
    },
    lmstudio: {
        id: 'lmstudio',
        name: 'LM Studio',
        baseUrl: 'http://localhost:1234',
        apiFormat: 'openai-compatible',
        authType: 'none',
    },
    openrouter: {
        id: 'openrouter',
        name: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api',
        apiFormat: 'openai-compatible',
        authType: 'bearer',
    },
    together: {
        id: 'together',
        name: 'Together AI',
        baseUrl: 'https://api.together.xyz',
        apiFormat: 'openai-compatible',
        authType: 'bearer',
    },
    groq: {
        id: 'groq',
        name: 'Groq',
        baseUrl: 'https://api.groq.com/openai',
        apiFormat: 'openai-compatible',
        authType: 'bearer',
    },
    deepseek: {
        id: 'deepseek',
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
        apiFormat: 'openai-compatible',
        authType: 'bearer',
    },
    siliconflow: {
        id: 'siliconflow',
        name: 'SiliconFlow',
        baseUrl: 'https://api.siliconflow.cn',
        apiFormat: 'openai-compatible',
        authType: 'bearer',
    },
    vscode: {
        id: 'vscode',
        name: 'VS Code LLM (Copilot)',
        baseUrl: 'http://localhost:11434',
        apiFormat: 'openai-compatible',
        authType: 'none',
        description: 'Models via GitHub Copilot through Vigil LLM Server',
    },
    custom: {
        id: 'custom',
        name: 'Custom',
        baseUrl: '',
        apiFormat: 'openai-compatible',
        authType: 'bearer',
    },
};

export const OPENAI_COMPATIBLE_PROVIDERS = [
    'ollama', 'localai', 'lmstudio', 'vllm', 'tgi', 'sglang',
    'openrouter', 'together', 'groq', 'deepseek', 'siliconflow', 'vscode', 'custom',
];

// ─── Internal interface ────────────────────────────────────────────────────

interface AIProvider {
    name: string;
    sendMessage(
        messages: MultiProviderMessage[],
        settings: MultiProviderSettings,
        onStream?: (text: string) => void
    ): Promise<string>;
    testConnection(settings: MultiProviderSettings): Promise<string>;
}

// ─── Anthropic provider ────────────────────────────────────────────────────

class AnthropicProvider implements AIProvider {
    name = 'anthropic';

    async sendMessage(
        messages: MultiProviderMessage[],
        settings: MultiProviderSettings,
        onStream?: (text: string) => void
    ): Promise<string> {
        const response = await fetch(`${settings.baseUrl}/v1/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': settings.apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: settings.model,
                max_tokens: settings.maxTokens,
                stream: !!onStream,
                messages,
            }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error((error as any).error?.message || `API error: ${response.status}`);
        }

        if (onStream) return this.handleStream(response, onStream);

        const data = await response.json() as any;
        return data.content[0]?.text || '';
    }

    private async handleStream(response: Response, onStream: (t: string) => void): Promise<string> {
        let fullText = '';
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        if (reader) {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                            fullText += parsed.delta.text;
                            onStream(fullText);
                        }
                    } catch { /* skip */ }
                }
            }
        }
        return fullText;
    }

    async testConnection(settings: MultiProviderSettings): Promise<string> {
        try {
            const r = await fetch(`${settings.baseUrl}/v1/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': settings.apiKey,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({ model: settings.model, max_tokens: 10, messages: [{ role: 'user', content: 'Hi' }] }),
            });
            if (r.ok) return 'success';
            const e = await r.json().catch(() => ({}));
            return `Error: ${(e as any).error?.message || r.status}`;
        } catch (e) { return `Error: ${e instanceof Error ? e.message : String(e)}`; }
    }
}

// ─── OpenAI provider ───────────────────────────────────────────────────────

class OpenAIProvider implements AIProvider {
    name = 'openai';

    private buildHeaders(settings: MultiProviderSettings): Record<string, string> {
        const h: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.apiKey}`,
        };
        if (settings.openaiOrganization) h['OpenAI-Organization'] = settings.openaiOrganization;
        if (settings.openaiProject) h['OpenAI-Project'] = settings.openaiProject;
        return h;
    }

    private isReasoningModel(model: string): boolean {
        const l = model.toLowerCase();
        return l.startsWith('o1') || l.startsWith('o3') || l.includes('-o1') || l.includes('-o3');
    }

    private isLegacyModel(model: string): boolean {
        const l = model.toLowerCase();
        return l.includes('gpt-3.5') || (l.includes('gpt-4') && !l.includes('gpt-4o') && !l.includes('gpt-4-turbo'));
    }

    async sendMessage(
        messages: MultiProviderMessage[],
        settings: MultiProviderSettings,
        onStream?: (text: string) => void
    ): Promise<string> {
        const body: Record<string, unknown> = {
            model: settings.model,
            stream: !!onStream,
            messages,
        };
        if (settings.maxTokens) {
            if (this.isLegacyModel(settings.model)) body.max_tokens = settings.maxTokens;
            else body.max_completion_tokens = settings.maxTokens;
        }
        if (!this.isReasoningModel(settings.model) && settings.temperature !== undefined) {
            body.temperature = settings.temperature;
        }

        const response = await fetch(`${settings.baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: this.buildHeaders(settings),
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error((error as any).error?.message || `API error: ${response.status}`);
        }
        if (onStream) return this.handleStream(response, onStream);
        const data = await response.json() as any;
        return data.choices[0]?.message?.content || '';
    }

    private async handleStream(response: Response, onStream: (t: string) => void): Promise<string> {
        let fullText = '';
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        if (reader) {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(data);
                        const delta = parsed.choices?.[0]?.delta?.content;
                        if (delta) { fullText += delta; onStream(fullText); }
                    } catch { /* skip */ }
                }
            }
        }
        return fullText;
    }

    async testConnection(settings: MultiProviderSettings): Promise<string> {
        try {
            const body: Record<string, unknown> = {
                model: settings.model,
                messages: [{ role: 'user', content: 'Hi' }],
            };
            if (this.isLegacyModel(settings.model)) body.max_tokens = 10;
            else body.max_completion_tokens = 10;
            if (!this.isReasoningModel(settings.model)) body.temperature = 1;

            const r = await fetch(`${settings.baseUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: this.buildHeaders(settings),
                body: JSON.stringify(body),
            });
            if (r.ok) return 'success';
            const e = await r.json().catch(() => ({}));
            return `Error: ${(e as any).error?.message || r.status}`;
        } catch (e) { return `Error: ${e instanceof Error ? e.message : String(e)}`; }
    }
}

// ─── OpenAI Responses API provider (GPT-5 series) ─────────────────────────

class OpenAIResponsesProvider implements AIProvider {
    name = 'openai-responses';

    private buildHeaders(settings: MultiProviderSettings): Record<string, string> {
        const h: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.apiKey}`,
        };
        if (settings.openaiOrganization) h['OpenAI-Organization'] = settings.openaiOrganization;
        if (settings.openaiProject) h['OpenAI-Project'] = settings.openaiProject;
        return h;
    }

    async sendMessage(
        messages: MultiProviderMessage[],
        settings: MultiProviderSettings,
        onStream?: (text: string) => void
    ): Promise<string> {
        const systemMsg = messages.find(m => m.role === 'system');
        const inputMsgs = messages.filter(m => m.role !== 'system');

        const body: Record<string, unknown> = {
            model: settings.model,
            input: inputMsgs.map(m => ({ role: m.role, content: m.content })),
            max_output_tokens: settings.maxTokens,
            temperature: settings.temperature ?? 1.0,
            stream: !!onStream,
        };
        if (systemMsg) body.instructions = systemMsg.content;

        const response = await fetch(`${settings.baseUrl}/v1/responses`, {
            method: 'POST',
            headers: this.buildHeaders(settings),
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error((error as any).error?.message || `API error: ${response.status}`);
        }

        if (onStream) return this.handleStream(response, onStream);

        const data = await response.json() as any;
        return this.extractText(data);
    }

    private extractText(data: any): string {
        const output = data.output as Array<any> | undefined;
        if (!output) return '';
        const messageItem = output.find((i: any) => i.type === 'message');
        if (!messageItem) return '';
        const content = messageItem.content as Array<any> | undefined;
        if (!content) return '';
        const textContent = content.find((c: any) => c.type === 'output_text');
        return (textContent?.text as string) || '';
    }

    private async handleStream(response: Response, onStream: (t: string) => void): Promise<string> {
        let fullText = '';
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        if (reader) {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.type === 'response.output_text.delta' && parsed.delta) {
                            fullText += parsed.delta;
                            onStream(fullText);
                        }
                        if (parsed.type === 'response.completed') {
                            const finalText = this.extractText(parsed.response || {});
                            if (finalText && finalText !== fullText) { fullText = finalText; onStream(fullText); }
                        }
                    } catch { /* skip */ }
                }
            }
        }
        return fullText;
    }

    async testConnection(settings: MultiProviderSettings): Promise<string> {
        try {
            const r = await fetch(`${settings.baseUrl}/v1/responses`, {
                method: 'POST',
                headers: this.buildHeaders(settings),
                body: JSON.stringify({
                    model: settings.model,
                    input: [{ role: 'user', content: 'Hi' }],
                    max_output_tokens: 10,
                }),
            });
            if (r.ok) return 'success';
            const e = await r.json().catch(() => ({}));
            return `Error: ${(e as any).error?.message || r.status}`;
        } catch (e) { return `Error: ${e instanceof Error ? e.message : String(e)}`; }
    }
}

// ─── Google Gemini provider ────────────────────────────────────────────────

class GoogleProvider implements AIProvider {
    name = 'google';

    async sendMessage(
        messages: MultiProviderMessage[],
        settings: MultiProviderSettings,
        onStream?: (text: string) => void
    ): Promise<string> {
        const contents = messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
        }));

        const url = `${settings.baseUrl}/v1beta/models/${settings.model}:generateContent?key=${settings.apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents,
                generationConfig: { maxOutputTokens: settings.maxTokens },
            }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error((error as any).error?.message || `API error: ${response.status}`);
        }

        const data = await response.json() as any;
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (onStream) onStream(text);
        return text;
    }

    async testConnection(settings: MultiProviderSettings): Promise<string> {
        try {
            const url = `${settings.baseUrl}/v1beta/models/${settings.model}:generateContent?key=${settings.apiKey}`;
            const r = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
                    generationConfig: { maxOutputTokens: 10 },
                }),
            });
            if (r.ok) return 'success';
            const e = await r.json().catch(() => ({}));
            return `Error: ${(e as any).error?.message || r.status}`;
        } catch (e) { return `Error: ${e instanceof Error ? e.message : String(e)}`; }
    }
}

// ─── Minimax provider ──────────────────────────────────────────────────────

class MinimaxProvider implements AIProvider {
    name = 'minimax';

    async sendMessage(
        messages: MultiProviderMessage[],
        settings: MultiProviderSettings,
        onStream?: (text: string) => void
    ): Promise<string> {
        const response = await fetch(`${settings.baseUrl}/v1/text/chatcompletion_v2`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.apiKey}`,
            },
            body: JSON.stringify({
                model: settings.model,
                max_tokens: settings.maxTokens,
                stream: !!onStream,
                messages,
            }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error((error as any).error?.message || `API error: ${response.status}`);
        }

        const data = await response.json() as any;
        const text = data.choices?.[0]?.message?.content || '';
        if (onStream) onStream(text);
        return text;
    }

    async testConnection(settings: MultiProviderSettings): Promise<string> {
        try {
            const r = await fetch(`${settings.baseUrl}/v1/text/chatcompletion_v2`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.apiKey}`,
                },
                body: JSON.stringify({ model: settings.model, max_tokens: 10, messages: [{ role: 'user', content: 'Hi' }] }),
            });
            if (r.ok) return 'success';
            const e = await r.json().catch(() => ({}));
            return `Error: ${(e as any).error?.message || r.status}`;
        } catch (e) { return `Error: ${e instanceof Error ? e.message : String(e)}`; }
    }
}

// ─── OpenAI-compatible provider ────────────────────────────────────────────

class OpenAICompatibleProvider implements AIProvider {
    name = 'openai-compatible';
    private providerConfig: ProviderConfig;

    constructor(providerId: string) {
        this.providerConfig = PROVIDER_PRESETS[providerId] ?? PROVIDER_PRESETS['custom'];
    }

    private buildHeaders(settings: MultiProviderSettings): Record<string, string> {
        const h: Record<string, string> = { 'Content-Type': 'application/json' };
        switch (this.providerConfig.authType) {
            case 'bearer':
                if (settings.apiKey) h['Authorization'] = `Bearer ${settings.apiKey}`;
                break;
            case 'api-key':
                if (settings.apiKey) h['x-api-key'] = settings.apiKey;
                break;
            case 'none':
                break;
        }
        return h;
    }

    private apiEndpoint(baseUrl: string): string {
        const url = baseUrl.replace(/\/$/, '');
        if (url.endsWith('/v1')) return `${url}/chat/completions`;
        return `${url}/v1/chat/completions`;
    }

    async sendMessage(
        messages: MultiProviderMessage[],
        settings: MultiProviderSettings,
        onStream?: (text: string) => void
    ): Promise<string> {
        const response = await fetch(this.apiEndpoint(settings.baseUrl), {
            method: 'POST',
            headers: this.buildHeaders(settings),
            body: JSON.stringify({
                model: settings.model,
                max_tokens: settings.maxTokens,
                temperature: settings.temperature ?? 0.7,
                stream: !!onStream,
                messages,
            }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error((error as any).error?.message || `API error: ${response.status}`);
        }
        if (onStream) return this.handleStream(response, onStream);
        const data = await response.json() as any;
        return data.choices?.[0]?.message?.content || '';
    }

    private async handleStream(response: Response, onStream: (t: string) => void): Promise<string> {
        let fullText = '';
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        if (reader) {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(data);
                        const delta = parsed.choices?.[0]?.delta?.content;
                        if (delta) { fullText += delta; onStream(fullText); }
                    } catch { /* skip */ }
                }
            }
        }
        return fullText;
    }

    async discoverModels(baseUrl: string): Promise<string[]> {
        try {
            const url = baseUrl.replace(/\/$/, '');
            const endpoint = url.endsWith('/v1') ? `${url}/models` : `${url}/v1/models`;
            const r = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
            if (!r.ok) return [];
            const data = await r.json() as any;
            return (data.data as Array<{ id: string }> || []).map(m => m.id);
        } catch {
            // Try Ollama /api/tags fallback
            try {
                const url = baseUrl.replace(/\/$/, '').replace('/v1', '');
                const r = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(5000) });
                if (!r.ok) return [];
                const data = await r.json() as any;
                return (data.models as Array<{ name: string }> || []).map(m => m.name);
            } catch { return []; }
        }
    }

    async testConnection(settings: MultiProviderSettings): Promise<string> {
        try {
            const r = await fetch(this.apiEndpoint(settings.baseUrl), {
                method: 'POST',
                headers: this.buildHeaders(settings),
                body: JSON.stringify({
                    model: settings.model,
                    max_tokens: 10,
                    messages: [{ role: 'user', content: 'Hi' }],
                }),
            });
            if (r.ok) return 'success';
            const e = await r.json().catch(() => ({}));
            return `Error: ${(e as any).error?.message || r.status}`;
        } catch (e) { return `Error: ${e instanceof Error ? e.message : String(e)}`; }
    }
}

// ─── Registry ──────────────────────────────────────────────────────────────

const providers: Record<string, AIProvider> = {
    anthropic: new AnthropicProvider(),
    openai: new OpenAIProvider(),
    google: new GoogleProvider(),
    minimax: new MinimaxProvider(),
    'openai-responses': new OpenAIResponsesProvider(),
};

function usesResponsesApi(modelId: string): boolean {
    const l = modelId.toLowerCase();
    return l.startsWith('gpt-5') || /^gpt-5[\.-]/.test(l);
}

function getProvider(modelId: string, providerId?: string): AIProvider {
    if (usesResponsesApi(modelId)) return providers['openai-responses'];
    if (providerId && OPENAI_COMPATIBLE_PROVIDERS.includes(providerId)) {
        return new OpenAICompatibleProvider(providerId);
    }
    const config = Object.values(PROVIDER_PRESETS).find(p => p.id === (providerId ?? 'anthropic'));
    if (config?.apiFormat === 'openai-compatible') return new OpenAICompatibleProvider(config.id);
    return providers[providerId ?? 'anthropic'] ?? providers['anthropic'];
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Send a message to any configured AI provider.
 */
export async function multiProviderChat(
    messages: MultiProviderMessage[],
    settings: MultiProviderSettings,
    providerId?: string,
    onStream?: (text: string) => void
): Promise<string> {
    const provider = getProvider(settings.model, providerId);
    return provider.sendMessage(messages, settings, onStream);
}

/**
 * Test connection to any AI provider.
 */
export async function testMultiProviderConnection(
    settings: MultiProviderSettings,
    providerId?: string
): Promise<string> {
    const provider = getProvider(settings.model, providerId);
    return provider.testConnection(settings);
}

/**
 * Discover available models from an OpenAI-compatible local service.
 */
export async function discoverLocalModels(baseUrl: string, providerId = 'custom'): Promise<string[]> {
    const provider = new OpenAICompatibleProvider(providerId);
    return provider.discoverModels(baseUrl);
}

/**
 * Check if a local service (Ollama / LocalAI) is reachable.
 */
export async function checkLocalService(baseUrl: string): Promise<{ running: boolean; models: string[] }> {
    try {
        const models = await discoverLocalModels(baseUrl);
        if (models.length > 0) return { running: true, models };
        // Try a HEAD request to root as fallback
        const url = baseUrl.replace(/\/$/, '');
        const r = await fetch(`${url}/`, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
        return { running: r.ok, models: [] };
    } catch {
        return { running: false, models: [] };
    }
}
