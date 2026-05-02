// Export all provider classes and interfaces
export * from './AIProvider';
export * from './CopilotProvider';
export * from './OllamaProvider';
export * from './ai-provider';
export { ClaudeAIProvider } from './claude-provider';
export { OpenAIProvider } from './openai-provider';

// Multi-provider client (Google, Anthropic, OpenAI, Minimax, any OpenAI-compatible)
export {
  multiProviderChat,
  testMultiProviderConnection,
  discoverLocalModels,
  checkLocalService,
  PROVIDER_PRESETS,
  OPENAI_COMPATIBLE_PROVIDERS,
  type MultiProviderMessage,
  type MultiProviderSettings,
  type ProviderConfig,
} from './multi-provider';

// Re-export the global registry
export { aiProviderRegistry } from './AIProvider';

// Provider setup utilities
import { CopilotProvider } from './CopilotProvider';
import { OllamaProvider } from './OllamaProvider';
import { aiProviderRegistry } from './AIProvider';
import { AIProviderFactory } from './ai-provider';
import { ClaudeAIProvider } from './claude-provider';
import { OpenAIProvider } from './openai-provider';
import { MockAIProvider } from './ai-provider';

/**
 * Initialize and register all available providers
 * Includes both free providers (Copilot, Ollama, Mock) and paid (Claude, OpenAI)
 */
export async function initializeProviders(options: {
  ollamaBaseUrl?: string;
  claudeApiKey?: string;
  openaiApiKey?: string;
} = {}): Promise<void> {
  // Always register free providers
  aiProviderRegistry.register(new CopilotProvider());
  aiProviderRegistry.register(new MockAIProvider());

  // Register Ollama if available (local, free)
  const ollama = new OllamaProvider(options.ollamaBaseUrl);
  aiProviderRegistry.register(ollama);

  // Register Claude if API key provided
  if (options.claudeApiKey || process.env.ANTHROPIC_API_KEY) {
    try {
      const claude = new ClaudeAIProvider(
        { model: 'claude-3-opus-20250219', temperature: 1 },
        options.claudeApiKey
      );
      AIProviderFactory.register('claude', () => claude);
    } catch (e) {
      console.warn('Claude provider not available:', e);
    }
  }

  // Register OpenAI if API key provided
  if (options.openaiApiKey || process.env.OPENAI_API_KEY) {
    try {
      const openai = new OpenAIProvider(
        { model: 'gpt-4-turbo', temperature: 0.7 },
        options.openaiApiKey
      );
      AIProviderFactory.register('openai', () => openai);
    } catch (e) {
      console.warn('OpenAI provider not available:', e);
    }
  }

  // Set Copilot as default (best free option for cloud-based inference)
  aiProviderRegistry.setDefault('copilot');
}

/**
 * Get provider based on preference and availability
 */
export async function getAIProvider(preference?: 'best' | 'free' | 'paid' | 'claude' | 'openai' | 'local') {
  const providers = await aiProviderRegistry.getAvailableProviders();

  switch (preference) {
    case 'local':
      // Prefer Ollama (local, private)
      return providers.find(p => p.vendor === 'ollama') ||
        new MockAIProvider();

    case 'claude':
      return AIProviderFactory.create('claude', {});

    case 'openai':
      return AIProviderFactory.create('openai', {});

    case 'paid':
      // Try Claude first, then OpenAI
      try {
        return AIProviderFactory.create('claude', {});
      } catch {
        return AIProviderFactory.create('openai', {});
      }

    case 'free':
      // Prefer Ollama, then Copilot, then Mock
      return providers.find(p => p.vendor === 'ollama') ||
        providers.find(p => p.vendor === 'copilot') ||
        new MockAIProvider();

    case 'best':
    default:
      // Prefer Ollama (local, private, free)
      const ollama = providers.find(p => p.vendor === 'ollama');
      if (ollama) return ollama;

      // Then Claude (best commercial option)
      try {
        return AIProviderFactory.create('claude', {});
      } catch (e1) {
        // Then OpenAI
        try {
          return AIProviderFactory.create('openai', {});
        } catch (e2) {
          // Fallback to Copilot
          return providers.find(p => p.vendor === 'copilot') || new MockAIProvider();
        }
      }
  }
}

/**
 * Get the best available free provider (no API keys required)
 */
export async function getBestFreeProvider() {
  const providers = await aiProviderRegistry.getAvailableProviders();

  // Prefer Ollama (local, private, completely free)
  const ollama = providers.find(p => p.vendor === 'ollama');
  if (ollama) return ollama;

  // Fallback to Copilot free models (cloud-based, fast)
  const copilot = providers.find(p => p.vendor === 'copilot');
  return copilot || new MockAIProvider();
}
