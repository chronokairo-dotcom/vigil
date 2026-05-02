/**
 * Agentic task types.

 */

export type AgentTaskStatus = 'planning' | 'running' | 'completed' | 'failed' | 'idle';

export interface PlanStep {
    step: number;
    description: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
}

export interface AgentTask {
    id: string;
    title: string;
    description: string;
    status: AgentTaskStatus;
    plan: PlanStep[] | null;
    projectPath: string | null;
    createdAt: number;
    updatedAt: number;
}

// ─── Event types emitted by TaskRunner ─────────────────────────

export type AgentTaskEvent =
    | { type: 'text'; content: string }
    | { type: 'plan'; steps: PlanStep[] }
    | { type: 'step_start'; step: number; description: string }
    | { type: 'step_done'; step: number }
    | { type: 'tool_start'; tool: string; input: Record<string, unknown> }
    | { type: 'tool_end'; tool: string; result: string; success: boolean }
    | { type: 'turn_complete'; turn: number }
    | { type: 'done'; totalTurns: number }
    | { type: 'error'; message: string };

// ─── Tool call structures (Anthropic-style) ────────────────────

export interface ToolUse {
    id: string;
    name: string;
    input: Record<string, unknown>;
}

export interface ToolResult {
    toolUseId: string;
    content: string;
    isError?: boolean;
}

// ─── Agent message ─────────────────────────────────────────────

export interface AgentMessage {
    role: 'user' | 'assistant';
    content: string | ContentBlock[];
}

export type ContentBlock =
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
    | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };
