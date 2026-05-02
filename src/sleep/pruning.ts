import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../core/utils/Logger';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const LOGS_DIR = path.join(DATA_DIR, 'logs');
const SUMMARIES_DIR = path.join(DATA_DIR, 'summaries');

export interface PruningPolicy {
    logRetentionDays: number;
    summaryRetentionDays: number;
}

const DEFAULT_POLICY: PruningPolicy = {
    logRetentionDays: 30,
    summaryRetentionDays: 90,
};

export interface PruningResult {
    logsRemoved: number;
    summariesRemoved: number;
    prunedAt: Date;
}

/**
 * Pruning
 *
 * Removes old log and summary files that exceed the retention policy.
 */
export class Pruning {
    private logger = Logger.getInstance('Pruning');
    private policy: PruningPolicy;

    constructor(policy: Partial<PruningPolicy> = {}) {
        this.policy = { ...DEFAULT_POLICY, ...policy };
    }

    async run(): Promise<PruningResult> {
        const now = Date.now();
        const logsRemoved = await this.pruneDir(LOGS_DIR, this.policy.logRetentionDays, now);
        const summariesRemoved = await this.pruneDir(SUMMARIES_DIR, this.policy.summaryRetentionDays, now, true);

        const result: PruningResult = { logsRemoved, summariesRemoved, prunedAt: new Date() };
        this.logger.info(`Pruning complete — logs: ${logsRemoved}, summaries: ${summariesRemoved}`);
        return result;
    }

    private async pruneDir(dir: string, retentionDays: number, now: number, recursive = false): Promise<number> {
        let removed = 0;
        const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;

        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory() && recursive) {
                    removed += await this.pruneDir(full, retentionDays, now, true);
                    continue;
                }
                if (!entry.isFile()) continue;
                const stat = await fs.stat(full);
                if (stat.mtimeMs < cutoff) {
                    await fs.unlink(full);
                    removed++;
                }
            }
        } catch {
            // directory may not exist yet — that is fine
        }
        return removed;
    }
}
