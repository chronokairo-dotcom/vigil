import {
  multiProviderChat,
  PROVIDER_PRESETS,
  type MultiProviderMessage,
  type MultiProviderSettings,
  type ProviderConfig,
} from '../providers/multi-provider';

export interface LitellmModelOptions {
  model: string;
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
  providerId?: string;
  providerKeys?: Record<string, string>;
  openaiOrganization?: string;
  openaiProject?: string;
  chat?: typeof multiProviderChat;
}

export class LitellmModel {
  private settings: MultiProviderSettings;
  private providerId?: string;
  private chatImpl: typeof multiProviderChat;

  constructor(options: LitellmModelOptions) {
    const providerId = options.providerId ?? 'openai';
    const providerConfig = resolveProviderConfig(providerId);
    const baseUrl = options.baseUrl ?? providerConfig.baseUrl;
    const apiKey = options.apiKey ?? '';

    if (providerConfig.authType !== 'none' && !apiKey) {
      throw new Error(`apiKey is required for provider: ${providerId}`);
    }

    this.providerId = providerId;
    this.chatImpl = options.chat ?? multiProviderChat;
    this.settings = {
      apiKey,
      model: options.model,
      baseUrl,
      maxTokens: options.maxTokens ?? 1024,
      temperature: options.temperature,
      providerKeys: options.providerKeys,
      openaiOrganization: options.openaiOrganization,
      openaiProject: options.openaiProject,
    };
  }

  getSettings(): MultiProviderSettings {
    return { ...this.settings };
  }

  getProviderId(): string | undefined {
    return this.providerId;
  }

  async chat(messages: MultiProviderMessage[]): Promise<string> {
    return this.chatImpl(messages, this.settings, this.providerId);
  }

  async stream(
    messages: MultiProviderMessage[],
    onStream: (text: string) => void
  ): Promise<string> {
    return this.chatImpl(messages, this.settings, this.providerId, onStream);
  }
}

function resolveProviderConfig(providerId: string): ProviderConfig {
  return PROVIDER_PRESETS[providerId] ?? PROVIDER_PRESETS.openai;
}
