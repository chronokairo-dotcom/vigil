/**
 * OpenAI AI Provider (GPT-4, GPT-3.5, etc)
 * 
 * Integração com OpenAI API
 * Suporte para GPT-4, GPT-3.5-turbo com vision e tools
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

interface OpenAIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenAIProvider implements IAIProvider {
  private client: AxiosInstance;
  private config: AIModelConfig;
  private apiKey: string;
  private baseUrl = 'https://api.openai.com/v1';

  constructor(config: AIModelConfig, apiKey?: string) {
    this.config = {
      model: 'gpt-4-turbo',
      temperature: 0.7,
      maxTokens: 4096,
      topP: 1,
      ...config,
    };

    this.apiKey = apiKey || process.env.OPENAI_API_KEY || '';
    if (!this.apiKey) {
      throw new AIAuthError('OPENAI_API_KEY is not set');
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
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
      const openaiMessages: OpenAIMessage[] = messages
        ? messages.map((m) => ({
            role: m.role,
            content: m.content,
          }))
        : [{ role: 'system', content: this.config.systemPrompt || 'You are a helpful assistant.' },
            { role: 'user', content: prompt }];

      if (
        !openaiMessages.some((m) => m.role === 'user')
      ) {
        openaiMessages.push({ role: 'user', content: prompt });
      }

      const response = await this.client.post<OpenAIResponse>('/chat/completions', {
        model: this.config.model,
        max_tokens: options?.maxTokens || this.config.maxTokens,
        temperature: options?.temperature ?? this.config.temperature,
        top_p: options?.topP ?? this.config.topP,
        messages: openaiMessages,
      });

      const data = response.data;
      if (!data.choices || !data.choices[0]) {
        throw new AIModelError('No choices in response');
      }

      return {
        content: data.choices[0].message.content,
        usage: {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        },
        stopReason: this.mapStopReason(data.choices[0].finish_reason),
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

      const messages: OpenAIMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ];

      const startTime = Date.now();
      const response = await this.client.post<OpenAIResponse>('/chat/completions', {
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

      const content = data.choices[0].message.content;

      // Extract confidence from response if present
      let confidenceScore = 0.7;
      const confidenceMatch = content.match(/confidence[:\s]+([0-9.]+)/i);
      if (confidenceMatch) {
        confidenceScore = Math.min(1, Math.max(0, parseFloat(confidenceMatch[1])));
      }

      return {
        content,
        reasoning: content, // In GPT, the entire response is the reasoning
        thinkingTime,
        confidenceScore,
        usage: {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        },
        stopReason: this.mapStopReason(data.choices[0].finish_reason),
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

      const messages: OpenAIMessage[] = [
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

      const messages: OpenAIMessage[] = [
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

      const messages: OpenAIMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ];

      const result = await this.complete(prompt, messages, options);

      // Parse JSON from response
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
    try {
      const openaiMessages: OpenAIMessage[] = messages
        ? messages.map((m) => ({
            role: m.role,
            content: m.content,
          }))
        : [{ role: 'system', content: this.config.systemPrompt || 'You are a helpful assistant.' },
            { role: 'user', content: prompt }];

      if (!openaiMessages.some((m) => m.role === 'user')) {
        openaiMessages.push({ role: 'user', content: prompt });
      }

      const response = await this.client.post(
        '/chat/completions',
        {
          model: this.config.model,
          max_tokens: options?.maxTokens || this.config.maxTokens,
          temperature: options?.temperature ?? this.config.temperature,
          stream: true,
          messages: openaiMessages,
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
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const json = JSON.parse(line.substring(6));
                const delta = json.choices?.[0]?.delta?.content;
                if (delta) {
                  fullContent += delta;
                  onChunk?.(delta);
                }
                if (json.usage) {
                  totalTokens = json.usage.completion_tokens;
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
      const response = await this.client.post<OpenAIResponse>('/chat/completions', {
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
    // OpenAI doesn't expose quota via API, return approximation
    return {
      remaining: -1, // Unknown
      limit: -1,
    };
  }

  private mapStopReason(
    openaiStopReason: string
  ): 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | string {
    const mapping: Record<string, any> = {
      stop: 'end_turn',
      length: 'max_tokens',
      function_call: 'tool_use',
      tool_calls: 'tool_use',
    };
    return mapping[openaiStopReason] || openaiStopReason;
  }

  private handleError(error: any): Error {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data as any;

      if (status === 401 || status === 403) {
        return new AIAuthError(
          `OpenAI API authentication failed: ${data?.error?.message || 'Invalid API key'}`
        );
      }

      if (status === 429) {
        const resetAt = error.response?.headers['retry-after']
          ? new Date(Date.now() + parseInt(error.response.headers['retry-after']) * 1000)
          : undefined;
        return new AIRateLimitError(
          `OpenAI API rate limit exceeded: ${data?.error?.message}`,
          resetAt
        );
      }

      if (status === 400 || status === 422) {
        return new AIModelError(`OpenAI API validation error: ${data?.error?.message}`);
      }

      return new AIModelError(
        `OpenAI API error (${status}): ${data?.error?.message || error.message}`
      );
    }

    return error instanceof Error ? error : new AIModelError(String(error));
  }
}

// Register OpenAI provider
import { AIProviderFactory } from './ai-provider';
AIProviderFactory.register('openai', (config: AIModelConfig) => new OpenAIProvider(config));
