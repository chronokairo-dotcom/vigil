import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../core/utils/Logger';
import { memoryManager } from '../memory/memoryManager';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const LOGS_DIR = path.join(DATA_DIR, 'logs');
const SUMMARIES_DIR = path.join(DATA_DIR, 'summaries', 'daily');

/**
 * Consolidator
 *
 * Reads raw log entries for a given date and groups them
 * by source/project, producing a structured consolidation
 * that can be summarised or stored.
 */
export interface ConsolidatedLog {
    date: string;
    totalEntries: number;
    bySource: Record<string, number>;
    byProject: Record<string, number>;
    consolidatedAt: Date;
}

export class Consolidator {
    private logger = Logger.getInstance('Consolidator');

    async consolidate(date?: string): Promise<ConsolidatedLog> {
        const targetDate = date ?? new Date().toISOString().slice(0, 10);
        const entries = await memoryManager.readLog(targetDate);

        const bySource: Record<string, number> = {};
        const byProject: Record<string, number> = {};

        for (const e of entries) {
            bySource[e.source] = (bySource[e.source] ?? 0) + 1;
            if (e.projectId) {
                byProject[e.projectId] = (byProject[e.projectId] ?? 0) + 1;
            }
        }

        const result: ConsolidatedLog = {
            date: targetDate,
            totalEntries: entries.length,
            bySource,
            byProject,
            consolidatedAt: new Date(),
        };

        this.logger.info(`Consolidated ${entries.length} entries for ${targetDate}`);
        return result;
    }

    async saveConsolidation(log: ConsolidatedLog): Promise<void> {
        await fs.mkdir(SUMMARIES_DIR, { recursive: true });
        const file = path.join(SUMMARIES_DIR, `${log.date}.json`);
        await fs.writeFile(file, JSON.stringify(log, null, 2), 'utf8');
    }
}
