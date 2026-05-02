/**
 * Agentic task runner — multi-turn agent loop.

 *
 * Supports Anthropic tool-use messages (Claude) as the primary format.
 * Emits strongly-typed events via a callback so callers can stream progress.
 */

import type { MultiProviderSettings } from '../providers/multi-provider';
import type {
    AgentMessage,
    AgentTaskEvent,
    ContentBlock,
    PlanStep,
    ToolResult,
    ToolUse,
} from './types';

// ─── Tool handler ───────────────────────────────────────────────

export type ToolHandler = (name: string, input: Record<string, unknown>) => Promise<string>;

// ─── Runner config ──────────────────────────────────────────────

export interface TaskRunnerConfig {
    settings: MultiProviderSettings;
    providerId?: string;
    systemPrompt?: string;
    maxTurns?: number;
    tools?: ToolDefinition[];
    toolHandler?: ToolHandler;
}

export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}

// ─── Runner ────────────────────────────────────────────────────

export class TaskRunner {
    private config: TaskRunnerConfig;
    private maxTurns: number;

    constructor(config: TaskRunnerConfig) {
        this.config = config;
        this.maxTurns = config.maxTurns ?? 20;
    }

    /**
     * Run the agent loop for an initial user message.
     * Events are delivered synchronously via the onEvent callback.
     */
    async run(
        initialMessage: string,
        onEvent: (event: AgentTaskEvent) => void
    ): Promise<AgentMessage[]> {
        const messages: AgentMessage[] = [
            { role: 'user', content: initialMessage },
        ];
        return this.runWithHistory(messages, onEvent);
    }

    /**
     * Run with existing conversation history.
     */
    async runWithHistory(
        messages: AgentMessage[],
        onEvent: (event: AgentTaskEvent) => void
    ): Promise<AgentMessage[]> {
        let turn = 0;

        while (true) {
            turn++;

            if (turn > this.maxTurns) {
                onEvent({ type: 'error', message: `Reached maximum turns (${this.maxTurns})` });
                break;
            }

            // Build request
            const response = await this.sendRequest(messages, onEvent);
            if (!response) break;

            const { textContent, toolUses } = this.parseResponse(response);

            // Emit plan if present in the text
            const planSteps = parsePlan(textContent);
            if (planSteps.length > 0) onEvent({ type: 'plan', steps: planSteps });

            // Emit step markers
            emitStepMarkers(textContent, onEvent);

            if (textContent) onEvent({ type: 'text', content: textContent });

            // Build assistant message
            const assistantBlocks: ContentBlock[] = [];
            if (textContent) assistantBlocks.push({ type: 'text', text: textContent });
            for (const tu of toolUses) {
                assistantBlocks.push({ type: 'tool_use', id: tu.id, name: tu.name, input: tu.input });
            }

            messages.push({
                role: 'assistant',
                content: assistantBlocks.length === 1 && assistantBlocks[0].type === 'text'
                    ? textContent
                    : assistantBlocks,
            });

            if (toolUses.length === 0) {
                onEvent({ type: 'done', totalTurns: turn });
                break;
            }

            // Execute tools
            const toolResults: ToolResult[] = [];
            for (const tu of toolUses) {
                onEvent({ type: 'tool_start', tool: tu.name, input: tu.input });

                let resultContent: string;
                let isError = false;

                try {
                    if (this.config.toolHandler) {
                        resultContent = await this.config.toolHandler(tu.name, tu.input);
                    } else {
                        resultContent = `Tool "${tu.name}" has no handler registered.`;
                        isError = true;
                    }
                } catch (err) {
                    resultContent = err instanceof Error ? err.message : String(err);
                    isError = true;
                }

                onEvent({ type: 'tool_end', tool: tu.name, result: resultContent, success: !isError });
                toolResults.push({ toolUseId: tu.id, content: resultContent, isError });
            }

            // Add tool results as user message (Anthropic format)
            const resultBlocks: ContentBlock[] = toolResults.map(r => ({
                type: 'tool_result' as const,
                tool_use_id: r.toolUseId,
                content: r.content,
                is_error: r.isError,
            }));

            messages.push({ role: 'user', content: resultBlocks });
            onEvent({ type: 'turn_complete', turn });
        }

        return messages;
    }

    // ─── HTTP request ─────────────────────────────────────────────

    private async sendRequest(
        messages: AgentMessage[],
        onEvent: (event: AgentTaskEvent) => void
    ): Promise<unknown | null> {
        const { settings, providerId, systemPrompt, tools } = this.config;

        // Flatten messages to simple role/content for the API
        const flatMessages = messages.map(m => ({
            role: m.role,
            content: typeof m.content === 'string'
                ? m.content
                : JSON.stringify(m.content), // serialise block arrays
        }));

        const body: Record<string, unknown> = {
            model: settings.model,
            max_tokens: settings.maxTokens,
            stream: false,
            messages: flatMessages,
        };

        if (systemPrompt) body.system = systemPrompt;
        if (settings.temperature !== undefined) body.temperature = settings.temperature;

        // Anthropic tool definitions
        if (tools && tools.length > 0) {
            body.tools = tools.map(t => ({
                name: t.name,
                description: t.description,
                input_schema: t.inputSchema,
            }));
        }

        try {
            const isAnthropic = !providerId || providerId === 'anthropic';
            const url = isAnthropic
                ? `${settings.baseUrl}/v1/messages`
                : `${settings.baseUrl.replace(/\/$/, '')}/v1/chat/completions`;

            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };

            if (isAnthropic) {
                headers['x-api-key'] = settings.apiKey;
                headers['anthropic-version'] = '2023-06-01';
            } else {
                headers['Authorization'] = `Bearer ${settings.apiKey}`;
            }

            const resp = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });

            if (!resp.ok) {
                const txt = await resp.text().catch(() => '');
                onEvent({ type: 'error', message: `API error ${resp.status}: ${txt}` });
                return null;
            }

            return await resp.json();
        } catch (err) {
            onEvent({ type: 'error', message: err instanceof Error ? err.message : String(err) });
            return null;
        }
    }

    // ─── Response parsing ─────────────────────────────────────────

    private parseResponse(response: unknown): { textContent: string; toolUses: ToolUse[] } {
        const r = response as Record<string, unknown>;
        let textContent = '';
        const toolUses: ToolUse[] = [];

        // Anthropic format
        const content = r['content'] as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(content)) {
            for (const block of content) {
                if (block['type'] === 'text') {
                    textContent += (block['text'] as string) || '';
                } else if (block['type'] === 'tool_use') {
                    toolUses.push({
                        id: (block['id'] as string) || `tool-${Date.now()}`,
                        name: (block['name'] as string) || '',
                        input: (block['input'] as Record<string, unknown>) || {},
                    });
                }
            }
            return { textContent, toolUses };
        }

        // OpenAI format fallback
        const choices = r['choices'] as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(choices) && choices[0]) {
            const msg = choices[0]['message'] as Record<string, unknown> | undefined;
            textContent = (msg?.['content'] as string) || '';
            const calls = msg?.['tool_calls'] as Array<Record<string, unknown>> | undefined;
            if (Array.isArray(calls)) {
                for (const c of calls) {
                    const fn = c['function'] as Record<string, unknown> | undefined;
                    toolUses.push({
                        id: (c['id'] as string) || `tool-${Date.now()}`,
                        name: (fn?.['name'] as string) || '',
                        input: JSON.parse((fn?.['arguments'] as string) || '{}'),
                    });
                }
            }
        }

        return { textContent, toolUses };
    }
}

// ─── Plan parsing helpers ───────────────────────────────────────

const PLAN_REGEX = /<plan>([\s\S]*?)<\/plan>/;
const STEP_REGEX = /(\d+)\.\s+(.+)/g;

export function parsePlan(text: string): PlanStep[] {
    const match = PLAN_REGEX.exec(text);
    if (!match) return [];
    const planText = match[1];
    const steps: PlanStep[] = [];
    let m: RegExpExecArray | null;
    while ((m = STEP_REGEX.exec(planText)) !== null) {
        steps.push({ step: parseInt(m[1], 10), description: m[2].trim(), status: 'pending' });
    }
    return steps;
}

const STEP_START_REGEX = /<step_start[^>]*step="?(\d+)"?[^>]*>/g;
const STEP_DONE_REGEX = /<step_done[^>]*step="?(\d+)"?[^>]*>/g;

function emitStepMarkers(text: string, onEvent: (e: AgentTaskEvent) => void): void {
    let m: RegExpExecArray | null;
    while ((m = STEP_START_REGEX.exec(text)) !== null) {
        onEvent({ type: 'step_start', step: parseInt(m[1], 10), description: '' });
    }
    while ((m = STEP_DONE_REGEX.exec(text)) !== null) {
        onEvent({ type: 'step_done', step: parseInt(m[1], 10) });
    }
}
