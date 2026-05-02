/**
 * Glob and enhanced grep tools.

 */

import fs from 'fs';
import path from 'path';
import { safePath } from '../utils/safe-path';
import type { ToolContext } from './file-tools';

// ─── Shared helpers ────────────────────────────────────────────

const IGNORE_DIRS = new Set([
    'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
    '.venv', 'venv', '.tox', 'coverage', '.nyc_output', '.cache',
    'target', 'bin', 'obj', '.gradle', '.Vigil',
]);

/** Very small glob matcher (handles **, *, ?, and literal segments). */
function matchGlob(pattern: string, filePath: string): boolean {
    // Normalise to forward-slashes
    const p = filePath.replace(/\\/g, '/');
    const pat = pattern.replace(/\\/g, '/');

    // Escape special regex chars except * and ?
    const escaped = pat
        .replace(/[.+^${}()|[\]]/g, '\\$&')
        .replace(/\*\*/g, '\u0000') // placeholder
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]')
        .replace(/\u0000/g, '.*');

    return new RegExp(`^${escaped}$`).test(p);
}

function* walkDir(dir: string): Generator<string> {
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch { return; }

    for (const e of entries) {
        if (IGNORE_DIRS.has(e.name)) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) yield* walkDir(full);
        else yield full;
    }
}

// ─── Glob ──────────────────────────────────────────────────────

export interface GlobInput {
    pattern: string;
    path?: string;
    limit?: number;
}

export interface GlobResult {
    success: boolean;
    matches: string[];
    error?: string;
}

/**
 * Find files matching a glob pattern inside the workspace.

 *
 * Patterns: use ** for multi-segment, * for single-segment, ? for one char.
 * Relative paths in the result are relative to ctx.workspaceRoot.
 */
export function globFiles(ctx: ToolContext, input: GlobInput): GlobResult {
    const limit = input.limit ?? 100;

    try {
        const baseDir = input.path
            ? safePath(ctx.workspaceRoot, input.path)
            : ctx.workspaceRoot;

        if (!fs.existsSync(baseDir)) {
            return { success: false, matches: [], error: `Path not found: ${input.path}` };
        }

        const matches: string[] = [];

        for (const filePath of walkDir(baseDir)) {
            if (matches.length >= limit) break;

            const rel = path.relative(ctx.workspaceRoot, filePath).replace(/\\/g, '/');
            const basename = path.basename(filePath);

            // Match against either the full relative path or just the filename
            if (matchGlob(input.pattern, rel) || matchGlob(input.pattern, basename)) {
                matches.push(rel);
            }
        }

        return { success: true, matches };
    } catch (err) {
        return {
            success: false,
            matches: [],
            error: `glob failed: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
}

// ─── Grep ──────────────────────────────────────────────────────

export interface GrepInput {
    pattern: string;
    path?: string;
    filePattern?: string;
    caseInsensitive?: boolean;
    contextLines?: number;
    limit?: number;
}

export interface GrepMatch {
    file: string;
    lineNumber: number;
    line: string;
    contextBefore: string[];
    contextAfter: string[];
}

export interface GrepResult {
    success: boolean;
    matches: GrepMatch[];
    error?: string;
}

/**
 * Recursive grep with context lines and file-pattern filtering.

 *
 * Returns matches with optional surrounding context lines.
 */
export function grepFiles(ctx: ToolContext, input: GrepInput): GrepResult {
    const limit = input.limit ?? 50;
    const contextLines = input.contextLines ?? 0;

    try {
        const baseDir = input.path
            ? safePath(ctx.workspaceRoot, input.path)
            : ctx.workspaceRoot;

        if (!fs.existsSync(baseDir)) {
            return { success: false, matches: [], error: `Path not found: ${input.path}` };
        }

        const flags = input.caseInsensitive ? 'i' : '';
        let regex: RegExp;
        try {
            regex = new RegExp(input.pattern, flags);
        } catch (e) {
            return {
                success: false,
                matches: [],
                error: `Invalid regex: ${e instanceof Error ? e.message : String(e)}`,
            };
        }

        const matches: GrepMatch[] = [];

        for (const filePath of walkDir(baseDir)) {
            if (matches.length >= limit) break;

            // File pattern filter
            if (input.filePattern) {
                const basename = path.basename(filePath);
                if (!matchGlob(input.filePattern, basename) && !matchGlob(input.filePattern, filePath.replace(/\\/g, '/'))) {
                    continue;
                }
            }

            let content: string;
            try {
                content = fs.readFileSync(filePath, 'utf8');
            } catch { continue; }

            const lines = content.split('\n');
            const rel = path.relative(ctx.workspaceRoot, filePath).replace(/\\/g, '/');

            for (let i = 0; i < lines.length; i++) {
                if (matches.length >= limit) break;
                if (!regex.test(lines[i])) continue;

                const before = contextLines > 0
                    ? lines.slice(Math.max(0, i - contextLines), i)
                    : [];
                const after = contextLines > 0
                    ? lines.slice(i + 1, Math.min(lines.length, i + 1 + contextLines))
                    : [];

                matches.push({
                    file: rel,
                    lineNumber: i + 1,
                    line: lines[i],
                    contextBefore: before,
                    contextAfter: after,
                });
            }
        }

        return { success: true, matches };
    } catch (err) {
        return {
            success: false,
            matches: [],
            error: `grep failed: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
}

/**
 * Format grep matches as a readable string (for agent responses).
 */
export function formatGrepMatches(matches: GrepMatch[]): string {
    if (matches.length === 0) return 'No matches found.';

    return matches.map(m => {
        const lines: string[] = [];
        if (m.contextBefore.length > 0) {
            m.contextBefore.forEach((l, i) => {
                lines.push(`${m.file}:${m.lineNumber - m.contextBefore.length + i}: ${l}`);
            });
        }
        lines.push(`${m.file}:${m.lineNumber}: ${m.line}`);
        if (m.contextAfter.length > 0) {
            m.contextAfter.forEach((l, i) => {
                lines.push(`${m.file}:${m.lineNumber + 1 + i}: ${l}`);
            });
        }
        return lines.join('\n');
    }).join('\n---\n');
}
