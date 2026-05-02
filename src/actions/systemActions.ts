import { exec } from 'child_process';
import { promisify } from 'util';
import { BaseAction, ActionMeta } from './baseAction';
import { validateCommand } from '../policies/guardrails';

const execAsync = promisify(exec);

export interface RunCommandPayload {
    command: string;
    cwd?: string;
    timeoutMs?: number;
}

/**
 * RunCommandAction — runs a shell command after guardrail validation.
 * Dangerous commands are blocked unless the policy allows them.
 */
export class RunCommandAction extends BaseAction {
    constructor(
        private payload: RunCommandPayload,
        meta: Omit<ActionMeta, 'createdAt' | 'type'>,
    ) {
        super({ ...meta, type: 'system:run-command' });
    }

    protected async execute(): Promise<unknown> {
        const { command, cwd = process.cwd(), timeoutMs = 30_000 } = this.payload;

        const validation = validateCommand(command);
        if (!validation.allowed || validation.requiresConfirmation) {
            throw new Error(`Command blocked by guardrails: ${validation.reason ?? `risk level: ${validation.riskLevel}`}`);
        }

        const { stdout, stderr } = await execAsync(command, { cwd, timeout: timeoutMs });
        return { command, stdout, stderr };
    }
}

/**
 * SetEnvAction — sets an environment variable in the current process.
 * Only applies to non-sensitive, explicitly-scoped vars (VIGIL_*).
 */
export class SetEnvAction extends BaseAction {
    constructor(
        private key: string,
        private value: string,
        meta: Omit<ActionMeta, 'createdAt' | 'type'>,
    ) {
        super({ ...meta, type: 'system:set-env' });
        if (!key.startsWith('VIGIL_')) {
            throw new Error(`SetEnvAction only allows VIGIL_* environment variables, got: ${key}`);
        }
    }

    protected async execute(): Promise<unknown> {
        process.env[this.key] = this.value;
        return { key: this.key };
    }
}
