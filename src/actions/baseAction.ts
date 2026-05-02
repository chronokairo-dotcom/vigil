import { Logger } from '../core/utils/Logger';

export type ActionStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

export interface ActionResult {
    success: boolean;
    output?: unknown;
    error?: string;
    durationMs: number;
}

export interface ActionMeta {
    id: string;
    type: string;
    description: string;
    projectId?: string;
    pipelineId?: string;
    createdAt: Date;
}

/**
 * BaseAction
 *
 * Abstract base class for all agent actions.
 * Each action must implement `execute()` and expose metadata.
 */
export abstract class BaseAction {
    readonly meta: ActionMeta;
    status: ActionStatus = 'pending';
    protected logger = Logger.getInstance('Action');

    constructor(meta: Omit<ActionMeta, 'createdAt'>) {
        this.meta = { ...meta, createdAt: new Date() };
    }

    async run(): Promise<ActionResult> {
        const start = Date.now();
        this.status = 'running';
        this.logger.info(`Running action [${this.meta.type}] ${this.meta.id}`);
        try {
            const output = await this.execute();
            this.status = 'success';
            return { success: true, output, durationMs: Date.now() - start };
        } catch (err) {
            this.status = 'failed';
            const error = err instanceof Error ? err.message : String(err);
            this.logger.error(`Action [${this.meta.type}] failed: ${error}`);
            return { success: false, error, durationMs: Date.now() - start };
        }
    }

    protected abstract execute(): Promise<unknown>;
}
