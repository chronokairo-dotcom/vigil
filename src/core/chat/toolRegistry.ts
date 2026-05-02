/**
 * Tool registry for the chat-with-tools agent loop.
 *
 * Exports:
 *  - BUILTIN_TOOL_DEFINITIONS — JSON-schema tool definitions sent to the LLM
 *  - createBuiltinHandler(ctx)  — dispatch function that routes calls to actual implementations
 */

import path from 'path';
import {
    readFile,
    writeFile,
    editFile,
    deleteFile,
    listFiles,
    searchCode,
    type ToolContext,
} from '../tools/file-tools';
import { globFiles, grepFiles, formatGrepMatches } from '../tools/search-tools';
import { runCommand } from '../tools/run-command';
import { dockerRun, dockerList, dockerImages } from '../tools/docker-tools';
import { extractPdfText } from '../../utils/pdf';
import type { ToolDefinition, ToolHandler } from '../tasks/TaskRunner';

// ─── Built-in tool schemas ──────────────────────────────────────

export const BUILTIN_TOOL_DEFINITIONS: ToolDefinition[] = [
    {
        name: 'read_file',
        description: 'Read the contents of a file in the workspace. Supports optional line range.',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Relative path to the file' },
                start_line: { type: 'number', description: 'First line to read (1-based, inclusive)' },
                end_line: { type: 'number', description: 'Last line to read (1-based, inclusive)' },
            },
            required: ['path'],
        },
    },
    {
        name: 'write_file',
        description: 'Create or overwrite a file with the given content. Creates parent directories as needed.',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Relative path to the file' },
                content: { type: 'string', description: 'File content to write' },
            },
            required: ['path', 'content'],
        },
    },
    {
        name: 'edit_file',
        description: 'Search-and-replace inside a file. Fails if the search string is not found, or matches multiple times (unless replace_all is true).',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Relative path to the file' },
                old_string: { type: 'string', description: 'Exact text to replace (include surrounding context for uniqueness)' },
                new_string: { type: 'string', description: 'Replacement text' },
                replace_all: { type: 'boolean', description: 'Replace every occurrence (default: false)' },
            },
            required: ['path', 'old_string', 'new_string'],
        },
    },
    {
        name: 'delete_file',
        description: 'Delete a file or directory from the workspace.',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Relative path to delete' },
            },
            required: ['path'],
        },
    },
    {
        name: 'list_files',
        description: 'List files and directories under a path.',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Relative directory path (default: workspace root)' },
                recursive: { type: 'boolean', description: 'List recursively (default: false)' },
            },
            required: ['path'],
        },
    },
    {
        name: 'search_code',
        description: 'Search for a regex pattern across workspace files.',
        inputSchema: {
            type: 'object',
            properties: {
                pattern: { type: 'string', description: 'Regex pattern to search' },
                file_glob: { type: 'string', description: 'Optional glob to restrict files (e.g. **/*.ts)' },
            },
            required: ['pattern'],
        },
    },
    {
        name: 'glob_files',
        description: 'Find files matching a glob pattern (supports ** wildcards).',
        inputSchema: {
            type: 'object',
            properties: {
                pattern: { type: 'string', description: 'Glob pattern e.g. src/**/*.ts' },
                path: { type: 'string', description: 'Base directory (default: workspace root)' },
                limit: { type: 'number', description: 'Max results (default: 100)' },
            },
            required: ['pattern'],
        },
    },
    {
        name: 'grep_files',
        description: 'Search file contents with a regex, showing context lines around each match.',
        inputSchema: {
            type: 'object',
            properties: {
                pattern: { type: 'string', description: 'Regex pattern' },
                path: { type: 'string', description: 'Directory to search (default: workspace root)' },
                file_pattern: { type: 'string', description: 'Glob to restrict which files to search' },
                context_lines: { type: 'number', description: 'Lines of context around each match (default: 2)' },
            },
            required: ['pattern'],
        },
    },
    {
        name: 'run_command',
        description: 'Run a shell command in the workspace. Destructive commands require confirmation.',
        inputSchema: {
            type: 'object',
            properties: {
                command: { type: 'string', description: 'Shell command to execute' },
                cwd: { type: 'string', description: 'Working directory (relative to workspace root, default: workspace root)' },
                timeout: { type: 'number', description: 'Timeout in milliseconds (default: 30000)' },
            },
            required: ['command'],
        },
    },
    {
        name: 'read_pdf',
        description: 'Extract plain text from a PDF file.',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Absolute or workspace-relative path to the PDF file' },
            },
            required: ['path'],
        },
    },
    {
        name: 'docker_run',
        description: 'Run a command inside a Docker container.',
        inputSchema: {
            type: 'object',
            properties: {
                image: { type: 'string', description: 'Docker image name' },
                command: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Command and arguments to run inside the container',
                },
                env: {
                    type: 'object',
                    additionalProperties: { type: 'string' },
                    description: 'Environment variables',
                },
            },
            required: ['image'],
        },
    },
    {
        name: 'docker_list',
        description: 'List running Docker containers.',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'docker_images',
        description: 'List available Docker images.',
        inputSchema: { type: 'object', properties: {} },
    },
];

// ─── Handler factory ────────────────────────────────────────────

/**
 * Creates a ToolHandler that dispatches tool calls to the actual implementations.
 * MCP tools can be injected via the optional `mcpHandler` parameter.
 */
export function createBuiltinHandler(
    ctx: ToolContext,
    mcpHandler?: (name: string, serverId: string, input: Record<string, unknown>) => Promise<string>
): ToolHandler {
    return async (name: string, input: Record<string, unknown>): Promise<string> => {
        switch (name) {
            case 'read_file': {
                const r = await readFile(ctx, {
                    path: str(input.path),
                    startLine: num(input.start_line),
                    endLine: num(input.end_line),
                });
                return r.success ? r.output : `Error: ${r.error}`;
            }

            case 'write_file': {
                const r = await writeFile(ctx, { path: str(input.path), content: str(input.content) });
                return r.success ? r.output : `Error: ${r.error}`;
            }

            case 'edit_file': {
                const r = await editFile(ctx, {
                    path: str(input.path),
                    oldString: str(input.old_string),
                    newString: str(input.new_string),
                    replaceAll: bool(input.replace_all),
                });
                return r.success ? r.output : `Error: ${r.error}`;
            }

            case 'delete_file': {
                const r = await deleteFile(ctx, { path: str(input.path) });
                return r.success ? r.output : `Error: ${r.error}`;
            }

            case 'list_files': {
                const r = await listFiles(ctx, {
                    path: str(input.path) || '.',
                    recursive: bool(input.recursive),
                });
                return r.success ? r.output : `Error: ${r.error}`;
            }

            case 'search_code': {
                const r = await searchCode(ctx, {
                    pattern: str(input.pattern),
                    fileGlob: input.file_glob ? str(input.file_glob) : undefined,
                });
                return r.success ? r.output : `Error: ${r.error}`;
            }

            case 'glob_files': {
                const r = globFiles(ctx, {
                    pattern: str(input.pattern),
                    path: input.path ? str(input.path) : undefined,
                    limit: num(input.limit),
                });
                return r.success
                    ? (r.matches.length ? r.matches.join('\n') : '(no matches)')
                    : `Error: ${r.error}`;
            }

            case 'grep_files': {
                const r = grepFiles(ctx, {
                    pattern: str(input.pattern),
                    path: input.path ? str(input.path) : undefined,
                    filePattern: input.file_pattern ? str(input.file_pattern) : undefined,
                    contextLines: num(input.context_lines),
                });
                if (!r.success) return `Error: ${r.error}`;
                if (r.matches.length === 0) return '(no matches)';
                return formatGrepMatches(r.matches);
            }

            case 'run_command': {
                const cwd = input.cwd ? path.join(ctx.workspaceRoot, str(input.cwd)) : ctx.workspaceRoot;
                const r = await runCommand(ctx, {
                    command: str(input.command),
                    cwd,
                    timeout: num(input.timeout),
                });
                return r.success ? r.output : `Error: ${r.error}`;
            }

            case 'read_pdf': {
                try {
                    const filePath = path.isAbsolute(str(input.path))
                        ? str(input.path)
                        : path.join(ctx.workspaceRoot, str(input.path));
                    const text = await extractPdfText(filePath);
                    return text || '(empty PDF)';
                } catch (err) {
                    return `Error: ${err instanceof Error ? err.message : String(err)}`;
                }
            }

            case 'docker_run': {
                const r = dockerRun({
                    image: str(input.image),
                    command: Array.isArray(input.command) ? (input.command as string[]) : undefined,
                    env: input.env ? (input.env as Record<string, string>) : undefined,
                });
                if (!r.success) return `Error: ${r.error ?? r.stderr}`;
                return [r.stdout, r.stderr].filter(Boolean).join('\n') || '(no output)';
            }

            case 'docker_list': {
                const r = dockerList();
                if (!r.success) return `Error: ${r.error}`;
                if (!r.containers.length) return '(no running containers)';
                return r.containers.map(c => `${c.id.slice(0, 12)}  ${c.name}  ${c.image}  ${c.status}`).join('\n');
            }

            case 'docker_images': {
                const r = dockerImages();
                if (!r.success) return `Error: ${r.error}`;
                if (!r.images.length) return '(no images)';
                return r.images.map(i => `${i.repository}:${i.tag}  ${i.size}`).join('\n');
            }

            default: {
                // Try MCP handler for unknown tool names (format: serverId__toolName)
                if (mcpHandler) {
                    const sep = name.indexOf('__');
                    if (sep > 0) {
                        const serverId = name.slice(0, sep);
                        const toolName = name.slice(sep + 2);
                        return mcpHandler(toolName, serverId, input);
                    }
                }
                return `Unknown tool: ${name}`;
            }
        }
    };
}

// ─── Input coercion helpers ─────────────────────────────────────

function str(v: unknown): string {
    return typeof v === 'string' ? v : String(v ?? '');
}

function num(v: unknown): number | undefined {
    if (v === undefined || v === null) return undefined;
    const n = Number(v);
    return isNaN(n) ? undefined : n;
}

function bool(v: unknown): boolean | undefined {
    if (v === undefined || v === null) return undefined;
    return Boolean(v);
}
