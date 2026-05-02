/**
 * Chat with tools — connects a free-form conversation to the agent tool loop.
 *
 * Orchestrates:
 *  - ConversationStore  (history persistence)
 *  - SkillsManager      (auto-inject skills into system prompt)
 *  - McpClientManager   (inject connected MCP tools into the tool list)
 *  - TaskRunner         (multi-turn agent loop)
 *  - toolRegistry       (built-in tool dispatch)
 */

import type { MultiProviderSettings } from '../providers/multi-provider';
import type { AgentTaskEvent } from '../tasks/types';
import { TaskRunner } from '../tasks/TaskRunner';
import type { ToolDefinition } from '../tasks/TaskRunner';
import {
    addMessage,
    getMessages,
    updateConversationTitle,
} from '../../memory/conversations/ConversationStore';
import { buildSkillsPrompt } from '../skills/SkillsManager';
import { mcpManager } from '../mcp-client/McpClientManager';
import { BUILTIN_TOOL_DEFINITIONS, createBuiltinHandler } from './toolRegistry';
import type { ToolContext } from '../tools/file-tools';

// ─── Public API ─────────────────────────────────────────────────

export interface ChatWithToolsOptions {
    /** An existing conversation id (from ConversationStore). */
    conversationId: string;
    /** The new user message to send. */
    message: string;
    /** AI provider settings (model, API key, etc.). */
    settings: MultiProviderSettings;
    /** Absolute path to the project workspace root. Defaults to process.cwd(). */
    workspaceRoot?: string;
    /** Optional extra system prompt text. */
    systemPrompt?: string;
    /** Stream events to the caller (text, tool_start, tool_end, done, error …). */
    onEvent: (event: AgentTaskEvent) => void;
}

/**
 * Run a single user turn in a conversation, with full tool access.
 *
 * Saves both the user message and the resulting assistant reply to
 * ConversationStore so history survives across calls.
 */
export async function chatWithTools(options: ChatWithToolsOptions): Promise<void> {
    const {
        conversationId,
        message,
        settings,
        workspaceRoot = process.cwd(),
        systemPrompt: extraSystemPrompt,
        onEvent,
    } = options;

    // ── 1. Persist user message ──────────────────────────────────
    addMessage(conversationId, 'user', message);

    // ── 2. Load history and convert to AgentMessage format ───────
    const stored = getMessages(conversationId);
    const history = stored.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
    }));

    // ── 3. Build system prompt ────────────────────────────────────
    const skillsSection = buildSkillsPrompt();

    const basePrompt = [
        'You are Vigil, an autonomous AI agent with access to a set of tools.',
        'Use tools when they help you complete the task. Always reason step by step.',
        extraSystemPrompt,
        skillsSection,
    ].filter(Boolean).join('\n\n');

    // ── 4. Collect tool definitions (built-in + MCP) ──────────────
    const mcpTools = mcpManager.getAllTools();
    const mcpToolDefs: ToolDefinition[] = mcpTools.map(t => ({
        // Prefix name with serverId so the handler can route back to the right server
        name: `${t.serverId}__${t.name}`,
        description: `[MCP:${t.serverId}] ${t.description}`,
        inputSchema: t.inputSchema,
    }));

    const allToolDefs: ToolDefinition[] = [...BUILTIN_TOOL_DEFINITIONS, ...mcpToolDefs];

    // ── 5. Build a minimal ToolContext for built-in tools ─────────
    const ctx: ToolContext = {
        workspaceRoot,
        pipelineId: conversationId,
        phaseIndex: 0,
        phaseName: 'chat',
        taskId: conversationId,
        agentRole: 'chat-agent',
        dryRun: false,
    };

    // ── 6. Create tool handler ────────────────────────────────────
    const mcpDispatch = async (
        toolName: string,
        serverId: string,
        input: Record<string, unknown>
    ): Promise<string> => {
        const result = await mcpManager.executeTool({ serverId, toolName, parameters: input });
        if (!result.success) return `MCP error: ${result.error}`;
        return typeof result.result === 'string'
            ? result.result
            : JSON.stringify(result.result, null, 2);
    };

    const toolHandler = createBuiltinHandler(ctx, mcpDispatch);

    // ── 7. Run agent loop ─────────────────────────────────────────
    const runner = new TaskRunner({
        settings,
        systemPrompt: basePrompt,
        tools: allToolDefs,
        toolHandler,
        maxTurns: 30,
    });

    // Remove the last message from history (it's the user message we just added)
    // so we pass everything except the latest turn as history, then send the new message
    const previousHistory = history.slice(0, -1);

    const messages = previousHistory.length > 0
        ? await runner.runWithHistory(history, onEvent)
        : await runner.run(message, onEvent);

    // ── 8. Persist assistant reply ────────────────────────────────
    // Extract the last assistant turn(s) from the returned message list
    const lastAssistantMessages = extractAssistantTexts(messages);
    for (const text of lastAssistantMessages) {
        addMessage(conversationId, 'assistant', text);
    }

    // ── 9. Auto-title conversation from the first user message ────
    if (stored.length === 1) {
        // First turn — generate a short title from the message
        const title = message.slice(0, 60).replace(/\n/g, ' ').trim();
        updateConversationTitle(conversationId, title);
    }
}

// ─── Helpers ───────────────────────────────────────────────────

import type { AgentMessage, ContentBlock } from '../tasks/types';

function extractAssistantTexts(messages: AgentMessage[]): string[] {
    const results: string[] = [];

    // Walk from the end and collect assistant messages added in the latest run
    // We look for all assistant messages that have text content
    for (const msg of messages) {
        if (msg.role !== 'assistant') continue;
        if (typeof msg.content === 'string') {
            if (msg.content.trim()) results.push(msg.content);
        } else if (Array.isArray(msg.content)) {
            const text = (msg.content as ContentBlock[])
                .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
                .map(b => b.text)
                .join('');
            if (text.trim()) results.push(text);
        }
    }

    // Return only the last assistant message (avoid duplicating history)
    return results.length > 0 ? [results[results.length - 1]] : [];
}
