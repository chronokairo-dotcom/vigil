/**
 * MCP server configuration types.

 */

export interface McpServerConfig {
    id: string;
    name: string;
    serverUrl: string;
    oauthClientId?: string;
    oauthClientSecret?: string;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface McpServerStatus {
    id: string;
    name: string;
    status: 'disconnected' | 'connecting' | 'connected' | 'error';
    tools: McpToolInfo[];
    lastError?: string;
}

export interface McpToolInfo {
    serverId: string;
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}

export interface McpToolCall {
    serverId: string;
    toolName: string;
    parameters: Record<string, unknown>;
}

export interface McpToolResult {
    success: boolean;
    result: unknown;
    error?: string;
}
