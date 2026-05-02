import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../core/utils/Logger';
import { Consolidator, ConsolidatedLog } from './consolidator';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const SUMMARIES_DIR = path.join(DATA_DIR, 'summaries', 'daily');

export interface DailySummary {
    date: string;
    headline: string;
    stats: ConsolidatedLog;
    generatedAt: Date;
}

/**
 * Summarizer
 *
 * Generates human-readable daily summaries from consolidated logs.
 * Saves them as markdown files under data/summaries/daily/.
 */
export class Summarizer {
    private consolidator = new Consolidator();
    private logger = Logger.getInstance('Summarizer');

    async summarize(date?: string): Promise<DailySummary> {
        const stats = await this.consolidator.consolidate(date);

        const topSource = Object.entries(stats.bySource)
            .sort((a, b) => b[1] - a[1])[0];

        const headline = stats.totalEntries === 0
            ? 'No activity recorded.'
            : `${stats.totalEntries} events recorded. Most active source: ${topSource?.[0] ?? 'unknown'} (${topSource?.[1] ?? 0} events).`;

        const summary: DailySummary = {
            date: stats.date,
            headline,
            stats,
            generatedAt: new Date(),
        };

        await this.saveSummary(summary);
        this.logger.info(`Summary generated for ${stats.date}: ${headline}`);
        return summary;
    }

    private async saveSummary(summary: DailySummary): Promise<void> {
        await fs.mkdir(SUMMARIES_DIR, { recursive: true });
        const file = path.join(SUMMARIES_DIR, `${summary.date}.md`);
        const md = [
            `# Daily Summary — ${summary.date}`,
            '',
            `**${summary.headline}**`,
            '',
            `Generated: ${summary.generatedAt.toISOString()}`,
            '',
            '## Events by Source',
            ...Object.entries(summary.stats.bySource).map(([k, v]) => `- ${k}: ${v}`),
            '',
            '## Events by Project',
            ...Object.entries(summary.stats.byProject).map(([k, v]) => `- ${k}: ${v}`),
        ].join('\n');
        await fs.writeFile(file, md, 'utf8');
    }
}
