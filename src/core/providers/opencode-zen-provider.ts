/**
 * OpenCode Zen Provider
 * 
 * Anonymous, free cloud AI provider using OpenCode's public Zen endpoint.
 * No API key required - completely free and open access.
 * 
 * Supported free models:
 * - minimax-m2.5-free (default)
 * - hy3-preview-free
 * - nemotron-3-super-free
 */

import axios, { AxiosInstance } from 'axios';
import {
  IAIProvider,
  AIModelConfig,
  AICompletionOptions,
  AICompletionResult,
  AIReasoningResult,
  AIMessage,
  AIModelError,
} from './ai-provider';

export const OPENCODE_ZEN_FREE_MODELS = [
  'minimax-m2.5-free',
  'hy3-preview-free',
  'nemotron-3-super-free',
] as const;

export type OpenCodeZenModel = typeof OPENCODE_ZEN_FREE_MODELS[number];

interface OpenCodeZenMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface OpenCodeZenResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      reasoning?: string | null;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenCodeZenProvider implements IAIProvider {
  private client: AxiosInstance;
  private config: AIModelConfig;
  readonly vendor = 'opencode-zen';
  private baseUrl = 'https://opencode.ai/zen/v1';

  constructor(config: AIModelConfig = { model: 'minimax-m2.5-free' }) {
    this.config = {
      ...config,
      model: config.model || 'minimax-m2.5-free',
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 4096,
      topP: config.topP ?? 1,
    };

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: config.timeout || 60000,
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
      const zenMessages: OpenCodeZenMessage[] = messages
        ? messages.map((m) => ({
            role: m.role,
            content: m.content,
          }))
        : [
            { role: 'system', content: this.config.systemPrompt || 'You are a helpful assistant.' },
            { role: 'user', content: prompt },
          ];

      if (!zenMessages.some((m) => m.role === 'user')) {
        zenMessages.push({ role: 'user', content: prompt });
      }

      const response = await this.client.post<OpenCodeZenResponse>('/chat/completions', {
        model: this.config.model,
        max_tokens: options?.maxTokens || this.config.maxTokens,
        temperature: options?.temperature ?? this.config.temperature,
        top_p: options?.topP ?? this.config.topP,
        messages: zenMessages,
      });

      const data = response.data;
      if (!data.choices || !data.choices[0]) {
        throw new AIModelError('No choices in response');
      }

      const message = data.choices[0].message;
      let content = message.content || '';

      if (!content && message.reasoning) {
        content = message.reasoning;
      }

      return {
        content,
        usage: {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        },
        stopReason: data.choices[0].finish_reason || 'stop',
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
      const systemPrompt = `You are an expert problem solver.
When solving problems, think step-by-step and explain your reasoning.
Format your response with:
1. Understanding: What you understand about the problem
2. Approach: Your approach to solving it
3. Solution: The actual solution
4. Confidence: Your confidence level (0-1)`;

      const prompt = context
        ? `Problem: ${problem}\n\nContext: ${JSON.stringify(context)}\n\nPlease provide a detailed solution.`
        : `Problem: ${problem}\n\nPlease provide a detailed solution.`;

      const messages: OpenCodeZenMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ];

      const startTime = Date.now();
      const response = await this.client.post<OpenCodeZenResponse>('/chat/completions', {
        model: this.config.model,
        max_tokens: options?.maxTokens || this.config.maxTokens || 4096,
        temperature: options?.temperature ?? 0.7,
        top_p: options?.topP ?? 0.95,
        messages,
      });
      const thinkingTime = Date.now() - startTime;

      const data = response.data;
      if (!data.choices || !data.choices[0]) {
        throw new AIModelError('No choices in response');
      }

      let content = data.choices[0].message.content || '';
      if (!content && data.choices[0].message.reasoning) {
        content = data.choices[0].message.reasoning;
      }

      let confidenceScore = 0.7;
      const confidenceMatch = content.match(/confidence[:\s]+([0-9.]+)/i);
      if (confidenceMatch) {
        confidenceScore = Math.min(1, Math.max(0, parseFloat(confidenceMatch[1])));
      }

      return {
        content,
        reasoning: content,
        thinkingTime,
        confidenceScore,
        usage: {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        },
        stopReason: data.choices[0].finish_reason || 'stop',
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
      const systemPrompt = `You are an expert code generator.
Generate clean, efficient, and well-commented code.
Only output the code, no explanations or markdown formatting.
Do not include \`\`\` or language markers.`;

      const prompt = context
        ? `Generate ${language} code to: ${description}\n\nContext: ${context}`
        : `Generate ${language} code to: ${description}`;

      const messages: OpenCodeZenMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ];

      return await this.complete(prompt, messages, options);
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
        security: `Analyze this ${language} code for SECURITY vulnerabilities.
Identify:
- Injection vulnerabilities
- Authentication/Authorization issues
- Sensitive data exposure
- Cross-site scripting (XSS)
- Insecure deserialization
- SQL injection
- Other security issues

Format: Issue | Severity (Critical/High/Medium/Low) | Fix`,

        performance: `Analyze this ${language} code for PERFORMANCE issues.
Identify:
- Time complexity problems
- Space complexity issues
- Unnecessary iterations
- Database query inefficiencies
- Memory leaks
- Blocking operations
- Caching opportunities`,

        quality: `Analyze this ${language} code for CODE QUALITY.
Check:
- Code readability
- Best practices compliance
- Design patterns
- Naming conventions
- Documentation
- DRY principle
- SOLID principles`,

        all: `Perform a comprehensive analysis of this ${language} code.
Include sections for:
1. Security issues (with severity)
2. Performance improvements
3. Code quality recommendations
4. Best practices
5. Overall score (1-10)`,
      };

      const prompt = `${analysisPrompts[analysisType]}\n\nCode:\n\`\`\`${language}\n${code}\n\`\`\``;

      const messages: OpenCodeZenMessage[] = [
        { role: 'system', content: 'You are an expert code reviewer.' },
        { role: 'user', content: prompt },
      ];

      return await this.complete(prompt, messages, options);
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
      const systemPrompt = `You are a problem decomposition expert.
Break down complex problems into concrete, actionable steps.
Consider dependencies between steps.
Estimate token usage for each step.
Return valid JSON only.`;

      const prompt = context
        ? `Break down this problem:\n\nProblem: ${problem}\n\nContext: ${context}\n\nReturn JSON: { "steps": [{ "order": 1, "title": "...", "description": "...", "dependencies": [], "estimatedTokens": 100 }], "totalTokens": 1000 }`
        : `Break down this problem:\n\nProblem: ${problem}\n\nReturn JSON: { "steps": [{ "order": 1, "title": "...", "description": "...", "dependencies": [], "estimatedTokens": 100 }], "totalTokens": 1000 }`;

      const messages: OpenCodeZenMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ];

      const result = await this.complete(prompt, messages, options);

      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new AIModelError('Could not extract JSON from response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      parsed.totalTokens = result.usage.totalTokens + (parsed.totalTokens || 1000);

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
    const result = await this.complete(prompt, messages, options);
    if (onChunk && result.content) {
      const chunks = result.content.split('');

      for (let i = 0; i < chunks.length; i++) {
        onChunk(chunks[i]);
        if (i % 50 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
    }
    return result;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.post<OpenCodeZenResponse>('/chat/completions', {
        model: this.config.model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say "ok".' }],
      });
      return response.status === 200;
    } catch (error) {
      console.error('[OpenCodeZenProvider] Health check failed:', error);
      return false;
    }
  }

  async getQuota(): Promise<{ remaining: number; limit: number; resetAt?: Date }> {
    return {
      remaining: -1,
      limit: -1,
    };
  }

  private handleError(error: any): Error {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data as any;

      if (status === 400 || status === 422) {
        return new AIModelError(`OpenCode Zen validation error: ${data?.error?.message || error.message}`);
      }

      if (status === 429) {
        return new AIModelError(`OpenCode Zen rate limit: ${data?.error?.message}`);
      }

      return new AIModelError(`OpenCode Zen error (${status}): ${data?.error?.message || error.message}`);
    }

    return error instanceof Error ? error : new AIModelError(String(error));
  }
}

import { AIProviderFactory } from './ai-provider';
AIProviderFactory.register('opencode-zen', (config: AIModelConfig) => new OpenCodeZenProvider(config));