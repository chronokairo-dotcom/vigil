/**
 * Claude AI Provider (Anthropic)
 * 
 * Integração com Claude 3 (Opus, Sonnet, Haiku)
 * Suporte para Extended Thinking e Vision
 */

import axios, { AxiosInstance } from 'axios';
import {
  IAIProvider,
  AIModelConfig,
  AICompletionOptions,
  AICompletionResult,
  AIReasoningResult,
  AIMessage,
  AIAuthError,
  AIRateLimitError,
  AIModelError,
} from './ai-provider';

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; source?: any }>;
}

interface ClaudeResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text?: string;
    thinking?: string;
  }>;
  model: string;
  stop_reason: string;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class ClaudeAIProvider implements IAIProvider {
  private client: AxiosInstance;
  private config: AIModelConfig;
  private apiKey: string;
  private baseUrl = 'https://api.anthropic.com/v1';

  constructor(config: AIModelConfig, apiKey?: string) {
    this.config = {
      model: 'claude-3-opus-20250219',
      temperature: 1, // Claude uses temperature 1 by default
      maxTokens: 4096,
      ...config,
    };

    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || '';
    if (!this.apiKey) {
      throw new AIAuthError('ANTHROPIC_API_KEY is not set');
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
    });
  }

  getConfig(): AIModelConfig {
    return this.config;
  }

  async complete(
    prompt: string,
    messages?: AIMessage[],
    options?: AICompletionOptions
  ): Promise<AICompletionResult> {
    try {
      const claudeMessages: ClaudeMessage[] = messages
        ? messages.map((m) => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content,
          }))
        : [{ role: 'user', content: prompt }];

      if (!claudeMessages.length || claudeMessages[claudeMessages.length - 1].role !== 'user') {
        claudeMessages.push({ role: 'user', content: prompt });
      }

      const response = await this.client.post<ClaudeResponse>('/messages', {
        model: this.config.model,
        max_tokens: options?.maxTokens || this.config.maxTokens,
        temperature: options?.temperature ?? this.config.temperature,
        top_p: options?.topP ?? this.config.topP ?? 0.95,
        system: this.config.systemPrompt,
        messages: claudeMessages,
      });

      const data = response.data;
      const textContent = data.content.find((c) => c.type === 'text');

      if (!textContent || !textContent.text) {
        throw new AIModelError('No text content in response');
      }

      return {
        content: textContent.text,
        usage: {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
          totalTokens: data.usage.input_tokens + data.usage.output_tokens,
        },
        stopReason: this.mapStopReason(data.stop_reason),
        model: data.model,
        timestamp: new Date(),
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async reasonAbout(
    problem: string,
    context?: Record<string, any>,
    options?: AICompletionOptions
  ): Promise<AIReasoningResult> {
    try {
      const prompt = context
        ? `Problem: ${problem}\n\nContext: ${JSON.stringify(context)}\n\nPlease think through this carefully.`
        : `Problem: ${problem}\n\nPlease think through this carefully.`;

      // Claude with extended thinking (thinking_budget in max_tokens)
      const response = await this.client.post<ClaudeResponse>('/messages', {
        model: this.config.model,
        max_tokens: 16000, // Allow extended thinking
        temperature: options?.temperature ?? 1,
        thinking: {
          type: 'enabled',
          budget_tokens: 10000,
        },
        system: 'You are an expert problem solver. Use your extended thinking capabilities to reason through problems thoroughly.',
        messages: [{ role: 'user', content: prompt }],
      });

      const data = response.data;
      const thinkingContent = data.content.find((c) => c.type === 'thinking');
      const textContent = data.content.find((c) => c.type === 'text');

      if (!textContent || !textContent.text) {
        throw new AIModelError('No text content in response');
      }

      const startTime = Date.now();
      const thinkingTime = Date.now() - startTime;

      return {
        content: textContent.text,
        reasoning: thinkingContent?.thinking || 'No explicit reasoning captured',
        thinkingTime,
        confidenceScore: 0.85, // Claude is generally high confidence
        usage: {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
          totalTokens: data.usage.input_tokens + data.usage.output_tokens,
        },
        stopReason: this.mapStopReason(data.stop_reason),
        model: data.model,
        timestamp: new Date(),
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async generateCode(
    description: string,
    language: string,
    context?: string,
    options?: AICompletionOptions
  ): Promise<AICompletionResult> {
    try {
      const prompt = context
        ? `Generate ${language} code to: ${description}\n\nContext: ${context}\n\nProvide only the code, no explanations.`
        : `Generate ${language} code to: ${description}\n\nProvide only the code, no explanations.`;

      return await this.complete(prompt, undefined, options);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async analyzeCode(
    code: string,
    language: string,
    analysisType: 'security' | 'performance' | 'quality' | 'all' = 'all',
    options?: AICompletionOptions
  ): Promise<AICompletionResult> {
    try {
      const analysisPrompts = {
        security: 'Analyze this code for security vulnerabilities and issues.',
        performance: 'Analyze this code for performance improvements and bottlenecks.',
        quality: 'Analyze this code for code quality, readability, and best practices.',
        all: 'Perform a comprehensive analysis of this code including security, performance, and quality aspects.',
      };

      const prompt = `${analysisPrompts[analysisType]}\n\nLanguage: ${language}\n\nCode:\n\`\`\`${language}\n${code}\n\`\`\`\n\nProvide a detailed analysis with specific recommendations.`;

      return await this.complete(prompt, undefined, options);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async decomposeProblem(
    problem: string,
    context?: string,
    options?: AICompletionOptions
  ): Promise<{
    steps: Array<{
      order: number;
      title: string;
      description: string;
      dependencies: number[];
      estimatedTokens: number;
    }>;
    totalTokens: number;
  }> {
    try {
      const prompt = context
        ? `Break down this problem into concrete steps:\n\nProblem: ${problem}\n\nContext: ${context}\n\nProvide a JSON response with structure: { "steps": [{ "order": 1, "title": "...", "description": "...", "dependencies": [], "estimatedTokens": 100 }], "totalTokens": 1000 }`
        : `Break down this problem into concrete steps:\n\nProblem: ${problem}\n\nProvide a JSON response with structure: { "steps": [{ "order": 1, "title": "...", "description": "...", "dependencies": [], "estimatedTokens": 100 }], "totalTokens": 1000 }`;

      const result = await this.complete(prompt, undefined, options);

      // Parse JSON from response
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new AIModelError('Could not extract JSON from response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      parsed.totalTokens = result.usage.totalTokens + parsed.totalTokens;

      return parsed;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async streamComplete(
    prompt: string,
    messages?: AIMessage[],
    onChunk?: (chunk: string) => void,
    options?: AICompletionOptions
  ): Promise<AICompletionResult> {
    try {
      const claudeMessages: ClaudeMessage[] = messages
        ? messages.map((m) => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content,
          }))
        : [{ role: 'user', content: prompt }];

      if (!claudeMessages.length || claudeMessages[claudeMessages.length - 1].role !== 'user') {
        claudeMessages.push({ role: 'user', content: prompt });
      }

      const response = await this.client.post<ClaudeResponse>(
        '/messages',
        {
          model: this.config.model,
          max_tokens: options?.maxTokens || this.config.maxTokens,
          temperature: options?.temperature ?? this.config.temperature,
          stream: true,
          system: this.config.systemPrompt,
          messages: claudeMessages,
        },
        {
          responseType: 'stream',
        }
      );

      let fullContent = '';
      let totalTokens = 0;

      return new Promise((resolve, reject) => {
        response.data.on('data', (chunk: Buffer) => {
          const text = chunk.toString();
          const lines = text.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const json = JSON.parse(line.substring(6));
                if (json.type === 'content_block_delta') {
                  const delta = json.delta?.text;
                  if (delta) {
                    fullContent += delta;
                    onChunk?.(delta);
                  }
                } else if (json.type === 'message_delta' && json.usage) {
                  totalTokens = json.usage.output_tokens;
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        });

        response.data.on('end', () => {
          resolve({
            content: fullContent,
            usage: {
              promptTokens: 0, // Not available in stream
              completionTokens: totalTokens,
              totalTokens: totalTokens,
            },
            stopReason: 'end_turn',
            model: this.config.model,
            timestamp: new Date(),
          });
        });

        response.data.on('error', reject);
      });
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Try a simple completion to verify API key works
      const response = await this.client.post<ClaudeResponse>('/messages', {
        model: this.config.model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say "ok".' }],
      });
      return response.status === 200;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  async getQuota(): Promise<{ remaining: number; limit: number; resetAt?: Date }> {
    // Claude doesn't expose quota via API, return approximation
    return {
      remaining: -1, // Unknown
      limit: -1,
    };
  }

  private mapStopReason(
    claudeStopReason: string
  ): 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | string {
    const mapping: Record<string, any> = {
      end_turn: 'end_turn',
      max_tokens: 'max_tokens',
      stop_sequence: 'stop_sequence',
      tool_use: 'tool_use',
    };
    return mapping[claudeStopReason] || claudeStopReason;
  }

  private handleError(error: any): Error {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data as any;

      if (status === 401 || status === 403) {
        return new AIAuthError(`Claude API authentication failed: ${data?.error?.message}`);
      }

      if (status === 429) {
        return new AIRateLimitError(`Claude API rate limit exceeded: ${data?.error?.message}`);
      }

      if (status === 400 || status === 422) {
        return new AIModelError(`Claude API validation error: ${data?.error?.message}`);
      }

      return new AIModelError(
        `Claude API error (${status}): ${data?.error?.message || error.message}`
      );
    }

    return error instanceof Error ? error : new AIModelError(String(error));
  }
}

// Register Claude provider
import { AIProviderFactory } from './ai-provider';
AIProviderFactory.register('claude', (config: AIModelConfig) => new ClaudeAIProvider(config));
