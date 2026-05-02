import {
    ClaudeCliAdapter,
    CodexCliAdapter,
    CopilotCliAdapter,
    GeminiCliAdapter,
    OpenCodeCliAdapter,
} from './adapters';
import type { LlmCliAdapter, LlmCliProvider } from './types';

export class LlmCliRegistry {
    private adapters = new Map<LlmCliProvider, LlmCliAdapter>();

    constructor() {
        this.register(new GeminiCliAdapter());
        this.register(new ClaudeCliAdapter());
        this.register(new CopilotCliAdapter());
        this.register(new CodexCliAdapter());
        this.register(new OpenCodeCliAdapter());
    }

    register(adapter: LlmCliAdapter): void {
        this.adapters.set(adapter.provider, adapter);
    }

    get(provider: LlmCliProvider): LlmCliAdapter {
        const adapter = this.adapters.get(provider);
        if (!adapter) {
            throw new Error(`CLI adapter not registered: ${provider}`);
        }
        return adapter;
    }

    isAvailable(provider: LlmCliProvider): boolean {
        return this.get(provider).isAvailable();
    }

    listAvailable(): LlmCliProvider[] {
        const available: LlmCliProvider[] = [];
        for (const [provider, adapter] of this.adapters) {
            if (adapter.isAvailable()) {
                available.push(provider);
            }
        }
        return available;
    }
}

export const llmCliRegistry = new LlmCliRegistry();
