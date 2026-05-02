/**
 * Docker tools for Vigil agents.

 *
 * Uses the local Docker CLI instead of the Bollard SDK since Node.js
 * does not need the native Docker socket binding.
 */

import { spawnSync } from 'child_process';

// ─── Types ─────────────────────────────────────────────────────

export interface DockerRunOptions {
    image: string;
    command?: string[];
    mounts?: Array<{ host: string; container: string; readOnly?: boolean }>;
    workdir?: string;
    env?: Record<string, string>;
    /** Remove container automatically after exit (default: true). */
    autoRemove?: boolean;
    /** Max seconds to wait (default: 60). */
    timeoutSeconds?: number;
}

export interface DockerRunResult {
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
    error?: string;
}

export interface DockerContainer {
    id: string;
    name: string;
    image: string;
    status: string;
    createdAt: string;
}

export interface DockerImage {
    id: string;
    repository: string;
    tag: string;
    size: string;
    createdAt: string;
}

// ─── Helpers ───────────────────────────────────────────────────

function dockerAvailable(): boolean {
    const result = spawnSync('docker', ['--version'], { encoding: 'utf8' });
    return result.status === 0;
}

// ─── Docker Run ────────────────────────────────────────────────

/**
 * Run a command inside a Docker container.

 */
export function dockerRun(options: DockerRunOptions): DockerRunResult {
    if (!dockerAvailable()) {
        return { success: false, stdout: '', stderr: '', exitCode: -1, error: 'Docker is not available' };
    }

    const args: string[] = ['run'];

    // Auto-remove
    if (options.autoRemove !== false) args.push('--rm');

    // Working directory
    if (options.workdir) args.push('-w', options.workdir);

    // Volume mounts
    if (options.mounts) {
        for (const m of options.mounts) {
            const ro = m.readOnly ? ':ro' : '';
            args.push('-v', `${m.host}:${m.container}${ro}`);
        }
    }

    // Environment variables
    if (options.env) {
        for (const [k, v] of Object.entries(options.env)) {
            args.push('-e', `${k}=${v}`);
        }
    }

    args.push(options.image);

    if (options.command && options.command.length > 0) {
        args.push(...options.command);
    }

    const timeoutMs = (options.timeoutSeconds ?? 60) * 1000;

    const result = spawnSync('docker', args, {
        encoding: 'utf8',
        timeout: timeoutMs,
    });

    return {
        success: result.status === 0,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        exitCode: result.status ?? -1,
        error: result.error?.message,
    };
}

// ─── Docker List ───────────────────────────────────────────────

/**
 * List running (or all) containers.

 */
export function dockerList(all = false): { success: boolean; containers: DockerContainer[]; error?: string } {
    if (!dockerAvailable()) {
        return { success: false, containers: [], error: 'Docker is not available' };
    }

    const args = [
        'ps',
        '--format',
        '{{json .}}',
        ...(all ? ['--all'] : []),
    ];

    const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 10000 });

    if (result.status !== 0) {
        return { success: false, containers: [], error: result.stderr || 'docker ps failed' };
    }

    const containers: DockerContainer[] = result.stdout
        .split('\n')
        .filter(l => l.trim())
        .map(line => {
            try {
                const obj = JSON.parse(line);
                return {
                    id: obj.ID ?? obj.Id ?? '',
                    name: obj.Names ?? obj.Name ?? '',
                    image: obj.Image ?? '',
                    status: obj.Status ?? '',
                    createdAt: obj.CreatedAt ?? '',
                };
            } catch {
                return null;
            }
        })
        .filter((c): c is DockerContainer => c !== null);

    return { success: true, containers };
}

// ─── Docker Images ─────────────────────────────────────────────

/**
 * List local Docker images.

 */
export function dockerImages(): { success: boolean; images: DockerImage[]; error?: string } {
    if (!dockerAvailable()) {
        return { success: false, images: [], error: 'Docker is not available' };
    }

    const result = spawnSync(
        'docker',
        ['images', '--format', '{{json .}}'],
        { encoding: 'utf8', timeout: 10000 }
    );

    if (result.status !== 0) {
        return { success: false, images: [], error: result.stderr || 'docker images failed' };
    }

    const images: DockerImage[] = result.stdout
        .split('\n')
        .filter(l => l.trim())
        .map(line => {
            try {
                const obj = JSON.parse(line);
                return {
                    id: obj.ID ?? '',
                    repository: obj.Repository ?? '',
                    tag: obj.Tag ?? '',
                    size: obj.Size ?? '',
                    createdAt: obj.CreatedAt ?? '',
                };
            } catch {
                return null;
            }
        })
        .filter((img): img is DockerImage => img !== null);

    return { success: true, images };
}
