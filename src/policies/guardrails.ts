export {
    validateCommand,
} from '../core/guardrails/command-validator';
export type { CommandValidationResult } from '../core/guardrails/command-validator';

/**
 * Convenience helper used by systemActions to check a command is safe to run.
 * Returns `{ safe, reason }` for quick inline checks.
 */
export function isCommandSafe(command: string): { safe: boolean; reason?: string } {
    const { allowed, requiresConfirmation, reason, riskLevel } = validateCommand(command);
    if (!allowed) return { safe: false, reason };
    if (requiresConfirmation) return { safe: false, reason: reason ?? `Risk level: ${riskLevel}` };
    return { safe: true };
}
