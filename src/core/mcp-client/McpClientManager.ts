/**
 * MCP client manager.

 *
 * Uses @modelcontextprotocol/sdk (already in package.json) instead of raw HTTP.
 * Persists server configs to data/mcp-servers.json.
 */

import fs from 'fs';
import path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type {
    McpServerConfig,
    McpServerStatus,
    McpToolInfo,
    McpToolCall,
    McpToolResult,
} from './types';

// ─── Storage helpers ────────────────────────────────────────────

const STORAGE_FILE = path.join(process.cwd(), 'data', 'mcp-servers.json');

function ensureDataDir(): void {
    const dir = path.dirname(STORAGE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadConfigs(): McpServerConfig[] {
    ensureDataDir();
    if (!fs.existsSync(STORAGE_FILE)) return [];
    try {
        return JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8')) as McpServerConfig[];
    } catch { return []; }
}

function saveConfigs(configs: McpServerConfig[]): void {
    ensureDataDir();
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(configs, null, 2), 'utf8');
}

// ─── Manager ───────────────────────────────────────────────────

interface ActiveConnection {
    client: Client;
    tools: McpToolInfo[];
}

export class McpClientManager {
    private connections = new Map<string, ActiveConnection>();
    private statuses = new Map<string, McpServerStatus>();

    // ── Config CRUD ──────────────────────────────────────────────

    listConfigs(): McpServerConfig[] {
        return loadConfigs();
    }

    saveConfig(config: McpServerConfig): void {
        const configs = loadConfigs();
        const idx = configs.findIndex(c => c.id === config.id);
        if (idx >= 0) configs[idx] = config;
        else configs.push(config);
        saveConfigs(configs);
    }

    deleteConfig(id: string): void {
        const configs = loadConfigs().filter(c => c.id !== id);
        saveConfigs(configs);
    }

    getConfig(id: string): McpServerConfig | undefined {
        return loadConfigs().find(c => c.id === id);
    }

    // ── Connection ───────────────────────────────────────────────

    /**
     * Connect to an MCP server and discover its tools.
     * Ported from MCPManager::connect_server in client.rs
     */
    async connect(config: McpServerConfig): Promise<void> {
        if (!config.enabled) throw new Error('Server is not enabled');

        this.setStatus(config.id, { ...this.emptyStatus(config), status: 'connecting' });

        // Normalise URL – ensure it ends with /mcp
        let serverUrl = config.serverUrl.replace(/\/$/, '');
        if (!serverUrl.endsWith('/mcp')) serverUrl = `${serverUrl}/mcp`;

        // Build optional OAuth bearer token
        let oauthToken: string | undefined;
        if (config.oauthClientId && config.oauthClientSecret) {
            oauthToken = await this.performOAuth(
                config.oauthClientId,
                config.oauthClientSecret,
                serverUrl,
            );
        }

        const headers: Record<string, string> = {};
        if (oauthToken) headers['Authorization'] = `Bearer ${oauthToken}`;

        const transport = new StreamableHTTPClientTransport(new URL(serverUrl), { requestInit: { headers } });
        const client = new Client({ name: 'vigil', version: '1.0.0' });

        try {
            await client.connect(transport);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.setStatus(config.id, { ...this.emptyStatus(config), status: 'error', lastError: msg });
            throw new Error(`Connection failed: ${msg}`);
        }

        // Discover tools
        const tools = await this.discoverTools(client, config.id);

        this.connections.set(config.id, { client, tools });
        this.setStatus(config.id, {
            id: config.id,
            name: config.name,
            status: 'connected',
            tools,
        });
    }

    async disconnect(id: string): Promise<void> {
        const conn = this.connections.get(id);
        if (conn) {
            try { await conn.client.close(); } catch { /* best effort */ }
            this.connections.delete(id);
        }
        const config = this.getConfig(id);
        this.setStatus(id, { ...this.emptyStatusById(id, config?.name ?? id), status: 'disconnected' });
    }

    /**
     * Connect all enabled servers from persisted config.
     */
    async connectAll(): Promise<void> {
        const configs = loadConfigs().filter(c => c.enabled);
        for (const c of configs) {
            try { await this.connect(c); } catch { /* continue */ }
        }
    }

    // ── Tool execution ───────────────────────────────────────────

    /**
     * Execute an MCP tool on a connected server.
     * Ported from MCPManager::execute_tool in client.rs
     */
    async executeTool(call: McpToolCall): Promise<McpToolResult> {
        const conn = this.connections.get(call.serverId);
        if (!conn) {
            return { success: false, result: null, error: `Server '${call.serverId}' not connected` };
        }
        try {
            const result = await conn.client.callTool({
                name: call.toolName,
                arguments: call.parameters,
            });
            return { success: true, result };
        } catch (err) {
            return {
                success: false,
                result: null,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }

    // ── Status / info ────────────────────────────────────────────

    getStatus(id: string): McpServerStatus | undefined {
        return this.statuses.get(id);
    }

    getAllStatuses(): McpServerStatus[] {
        return Array.from(this.statuses.values());
    }

    getAllTools(): McpToolInfo[] {
        return Array.from(this.connections.values()).flatMap(c => c.tools);
    }

    isConnected(id: string): boolean {
        return this.connections.has(id);
    }

    // ── Internals ────────────────────────────────────────────────

    private async discoverTools(client: Client, serverId: string): Promise<McpToolInfo[]> {
        try {
            const result = await client.listTools();
            return (result.tools ?? []).map(t => ({
                serverId,
                name: t.name,
                description: t.description ?? '',
                inputSchema: (t.inputSchema as Record<string, unknown>) ?? {},
            }));
        } catch {
            return [];
        }
    }

    private setStatus(id: string, status: McpServerStatus): void {
        this.statuses.set(id, status);
    }

    private emptyStatus(config: McpServerConfig): McpServerStatus {
        return { id: config.id, name: config.name, status: 'disconnected', tools: [] };
    }

    private emptyStatusById(id: string, name: string): McpServerStatus {
        return { id, name, status: 'disconnected', tools: [] };
    }

    /**
     * Minimal OAuth2 client-credentials flow.
     * Ported from MCPManager::perform_oauth_flow in client.rs
     */
    private async performOAuth(
        clientId: string,
        clientSecret: string,
        serverUrl: string,
    ): Promise<string> {
        // Derive token endpoint: strip /mcp, try /.well-known/oauth-authorization-server
        const base = serverUrl.replace(/\/mcp$/, '');

        // Step 1: discover token endpoint
        let tokenEndpoint = `${base}/oauth/token`;
        try {
            const meta = await fetch(`${base}/.well-known/oauth-authorization-server`, {
                signal: AbortSignal.timeout(5000),
            });
            if (meta.ok) {
                const json = await meta.json() as { token_endpoint?: string };
                if (json.token_endpoint) tokenEndpoint = json.token_endpoint;
            }
        } catch { /* use default */ }

        // Step 2: request token
        const resp = await fetch(tokenEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: clientId,
                client_secret: clientSecret,
            }).toString(),
        });

        if (!resp.ok) {
            const txt = await resp.text().catch(() => '');
            throw new Error(`OAuth token request failed (${resp.status}): ${txt}`);
        }

        const token = await resp.json() as { access_token?: string };
        if (!token.access_token) throw new Error('No access_token in OAuth response');
        return token.access_token;
    }
}

// ─── Singleton ──────────────────────────────────────────────────

export const mcpManager = new McpClientManager();
