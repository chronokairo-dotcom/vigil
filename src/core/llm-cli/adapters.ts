import { spawnSync } from 'node:child_process';
import type {
    LlmCliAdapter,
    LlmCliMode,
    LlmCliPromptOptions,
    LlmCliSpawnCommand,
} from './types';

function commandExists(command: string): boolean {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    const result = spawnSync(checker, [command], { stdio: 'ignore' });
    return result.status === 0;
}

function wrapForPlatform(command: string, args: string[]): LlmCliSpawnCommand {
    if (process.platform !== 'win32') {
        return {
            file: command,
            args,
            resolvedCommand: command,
            resolvedArgs: args,
        };
    }

    const comspec = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';
    return {
        file: comspec,
        // Keep command and args split so cmd.exe preserves argument boundaries.
        args: ['/d', '/c', command, ...args],
        resolvedCommand: command,
        resolvedArgs: args,
    };
}

function firstAvailable(commands: string[]): string {
    for (const command of commands) {
        if (commandExists(command)) {
            return command;
        }
    }
    return commands[0];
}

abstract class BaseCliAdapter implements LlmCliAdapter {
    abstract readonly provider: LlmCliAdapter['provider'];

    protected abstract getCandidates(): string[];

    protected abstract getInteractiveArgs(command: string): string[];

    protected abstract getPromptArgs(command: string, options: LlmCliPromptOptions): string[];

    isAvailable(): boolean {
        return this.getCandidates().some((command) => commandExists(command));
    }

    getSpawnCommand(mode: LlmCliMode, options?: LlmCliPromptOptions): LlmCliSpawnCommand {
        const command = firstAvailable(this.getCandidates());
        const args = mode === 'interactive'
            ? this.getInteractiveArgs(command)
            : this.getPromptArgs(command, options || { prompt: '' });

        return wrapForPlatform(command, args);
    }
}

export class GeminiCliAdapter extends BaseCliAdapter {
    readonly provider = 'gemini' as const;

    protected getCandidates(): string[] {
        return ['gemini', 'gemini-cli'];
    }

    protected getInteractiveArgs(): string[] {
        return [];
    }

    protected getPromptArgs(_: string, options: LlmCliPromptOptions): string[] {
        return ['-p', options.prompt];
    }
}

export class ClaudeCliAdapter extends BaseCliAdapter {
    readonly provider = 'claude' as const;

    protected getCandidates(): string[] {
        return ['claude', 'claude-code', 'claude-ai'];
    }

    protected getInteractiveArgs(): string[] {
        return [];
    }

    protected getPromptArgs(_: string, options: LlmCliPromptOptions): string[] {
        return ['--print', options.prompt];
    }
}

export class CopilotCliAdapter extends BaseCliAdapter {
    readonly provider = 'copilot' as const;

    protected getCandidates(): string[] {
        return ['copilot', 'gh'];
    }

    protected getInteractiveArgs(command: string): string[] {
        if (command === 'copilot') {
            return [];
        }
        return ['copilot'];
    }

    protected getPromptArgs(command: string, options: LlmCliPromptOptions): string[] {
        if (command === 'copilot') {
            return ['-s', '-p', options.prompt];
        }
        return ['copilot', '--', '-s', '-p', options.prompt];
    }
}

export class CodexCliAdapter extends BaseCliAdapter {
    readonly provider = 'codex' as const;

    protected getCandidates(): string[] {
        return ['codex'];
    }

    protected getInteractiveArgs(): string[] {
        return [];
    }

    protected getPromptArgs(_: string, options: LlmCliPromptOptions): string[] {
        return [options.prompt];
    }
}

export class OpenCodeCliAdapter extends BaseCliAdapter {
    readonly provider = 'opencode' as const;

    protected getCandidates(): string[] {
        return ['opencode', 'oc'];
    }

    protected getInteractiveArgs(): string[] {
        return [];
    }

    protected getPromptArgs(_: string, options: LlmCliPromptOptions): string[] {
        return ['run', options.prompt];
    }
}
