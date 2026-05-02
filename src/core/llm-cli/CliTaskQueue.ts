import { randomUUID } from 'node:crypto';
import { Logger } from '../utils/Logger';
import { CliInferenceService } from './CliInferenceService';
import type {
    CliInferenceRequest,
    CliTask,
    CliTaskQueueOptions,
} from './types';

export class CliTaskQueue {
    private logger = Logger.getInstance('CliTaskQueue');
    private concurrency: number;
    private running = 0;
    private pending: string[] = [];
    private tasks = new Map<string, CliTask>();

    constructor(
        private inference: CliInferenceService,
        options?: CliTaskQueueOptions,
    ) {
        this.concurrency = Math.max(1, options?.concurrency ?? 2);
    }

    enqueue(request: CliInferenceRequest): string {
        const id = randomUUID();
        const task: CliTask = {
            id,
            request,
            status: 'queued',
            enqueuedAt: new Date().toISOString(),
        };

        this.tasks.set(id, task);
        this.pending.push(id);
        this.processNext();
        return id;
    }

    getTask(id: string): CliTask | undefined {
        return this.tasks.get(id);
    }

    listTasks(): CliTask[] {
        return Array.from(this.tasks.values()).sort((a, b) =>
            a.enqueuedAt.localeCompare(b.enqueuedAt),
        );
    }

    stats(): { queued: number; running: number; completed: number; failed: number } {
        const all = Array.from(this.tasks.values());
        return {
            queued: all.filter((t) => t.status === 'queued').length,
            running: all.filter((t) => t.status === 'running').length,
            completed: all.filter((t) => t.status === 'completed').length,
            failed: all.filter((t) => t.status === 'failed').length,
        };
    }

    private processNext(): void {
        while (this.running < this.concurrency && this.pending.length > 0) {
            const taskId = this.pending.shift();
            if (!taskId) {
                return;
            }

            const task = this.tasks.get(taskId);
            if (!task || task.status !== 'queued') {
                continue;
            }

            this.running++;
            task.status = 'running';
            task.startedAt = new Date().toISOString();

            this.inference.executePrompt(task.request)
                .then((result) => {
                    task.status = 'completed';
                    task.result = result;
                    task.endedAt = new Date().toISOString();
                })
                .catch((error: unknown) => {
                    task.status = 'failed';
                    task.error = error instanceof Error ? error.message : String(error);
                    task.endedAt = new Date().toISOString();
                    this.logger.warn(`[CliTaskQueue] Task failed: ${task.id}`, task.error);
                })
                .finally(() => {
                    this.running--;
                    this.processNext();
                });
        }
    }
}
