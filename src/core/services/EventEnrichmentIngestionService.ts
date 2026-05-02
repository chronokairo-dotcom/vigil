import type { MemoryEntry } from '../../memory';
import { memoryManager } from '../../memory';
import { Logger } from '../utils/Logger';
import { EventEnrichmentService } from './EventEnrichmentService';

interface Enricher {
    enrichBatch(entries: MemoryEntry[], options?: { persist?: boolean }): Promise<unknown>;
}

type SignalLevel = 'critical' | 'high' | 'normal' | 'trivial';

export interface SemanticAlert {
    id: string;
    type: 'recurring-anomaly';
    severity: Extract<SignalLevel, 'critical' | 'high'>;
    source: string;
    signature: string;
    occurrences: number;
    firstSeen: string;
    lastSeen: string;
    explanation: string;
    sample: string;
}

interface QueuedEvent {
    entry: MemoryEntry;
    signal: SignalLevel;
    priority: number;
    insertedAt: number;
}

export interface EventEnrichmentIngestionOptions {
    batchSize?: number;
    flushIntervalMs?: number;
    persistEnrichment?: boolean;
    minSignalForEnrichment?: SignalLevel;
    anomalyWindowMs?: number;
    anomalyThreshold?: number;
    onSemanticAlert?: (alert: SemanticAlert) => void | Promise<void>;
}

export class EventEnrichmentIngestionService {
    private readonly logger = Logger.getInstance('EventEnrichmentIngestionService');
    private readonly batchSize: number;
    private readonly flushIntervalMs: number;
    private readonly persistEnrichment: boolean;
    private readonly minSignalForEnrichment: SignalLevel;
    private readonly anomalyWindowMs: number;
    private readonly anomalyThreshold: number;
    private readonly onSemanticAlert?: (alert: SemanticAlert) => void | Promise<void>;

    private pending: QueuedEvent[] = [];
    private flushTimer: ReturnType<typeof setTimeout> | null = null;
    private flushing = false;
    private anomalyMap = new Map<string, {
        source: string;
        signal: Extract<SignalLevel, 'critical' | 'high'>;
        occurrences: number;
        firstSeen: number;
        lastSeen: number;
        sample: string;
    }>();
    private recentAlerts: SemanticAlert[] = [];

    constructor(
        private readonly enricher: Enricher = new EventEnrichmentService(),
        options: EventEnrichmentIngestionOptions = {},
    ) {
        this.batchSize = Math.max(1, options.batchSize ?? 5);
        this.flushIntervalMs = Math.max(100, options.flushIntervalMs ?? 2_000);
        this.persistEnrichment = options.persistEnrichment ?? true;
        this.minSignalForEnrichment = options.minSignalForEnrichment ?? 'high';
        this.anomalyWindowMs = Math.max(1_000, options.anomalyWindowMs ?? 15 * 60 * 1000);
        this.anomalyThreshold = Math.max(2, options.anomalyThreshold ?? 3);
        this.onSemanticAlert = options.onSemanticAlert;
    }

    async ingest(entry: MemoryEntry): Promise<void> {
        await memoryManager.log(entry);
        const queued = this.toQueuedEvent(entry);
        await this.detectRecurringAnomaly(queued);
        this.pending.push(queued);
        this.pending.sort((a, b) => {
            if (a.priority === b.priority) {
                return a.insertedAt - b.insertedAt;
            }
            return b.priority - a.priority;
        });

        if (this.pending.length >= this.batchSize) {
            this.clearTimer();
            await this.flush();
            return;
        }

        this.ensureTimer();
    }

    async flush(): Promise<void> {
        if (this.flushing) return;
        if (!this.pending.length) return;

        this.flushing = true;
        const batch = this.pending.splice(0, this.batchSize);
        const toEnrich = batch
            .filter((item) => this.meetsSignalThreshold(item.signal))
            .map((item) => item.entry);

        try {
            if (toEnrich.length > 0) {
                await this.enricher.enrichBatch(toEnrich, { persist: this.persistEnrichment });
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.warn(`Batch enrichment failed: ${message}`);
        } finally {
            this.flushing = false;
        }

        if (this.pending.length > 0) {
            this.ensureTimer();
        }
    }

    async stop(): Promise<void> {
        this.clearTimer();
        while (this.pending.length > 0) {
            await this.flush();
        }
    }

    getPendingCount(): number {
        return this.pending.length;
    }

    getRecentAlerts(limit: number = 50): SemanticAlert[] {
        const safe = Math.max(1, Math.min(limit, 200));
        return this.recentAlerts.slice(0, safe);
    }

    private toQueuedEvent(entry: MemoryEntry): QueuedEvent {
        const signal = this.classifySignal(entry);
        return {
            entry,
            signal,
            priority: this.signalToPriority(signal),
            insertedAt: Date.now(),
        };
    }

    private classifySignal(entry: MemoryEntry): SignalLevel {
        const content = entry.content.toLowerCase();

        const criticalPatterns = [
            /\b(5\d\d|panic|fatal|segmentation fault|data loss|unauthorized|forbidden)\b/u,
            /\b(exception|crash|out of memory)\b/u,
        ];
        if (criticalPatterns.some((pattern) => pattern.test(content))) {
            return 'critical';
        }

        const highPatterns = [
            /\b(error|failed|failure|timeout|denied|refused|rollback)\b/u,
            /\bsecurity|auth|permission|policy\b/u,
        ];
        if (highPatterns.some((pattern) => pattern.test(content))) {
            return 'high';
        }

        const trivialPatterns = [
            /\b(heartbeat|keepalive|noop|ok)\b/u,
            /processo finalizado com c[oó]digo 0/u,
        ];
        if (trivialPatterns.some((pattern) => pattern.test(content))) {
            return 'trivial';
        }

        return 'normal';
    }

    private signalToPriority(signal: SignalLevel): number {
        switch (signal) {
            case 'critical':
                return 100;
            case 'high':
                return 75;
            case 'normal':
                return 50;
            case 'trivial':
                return 10;
        }
    }

    private meetsSignalThreshold(signal: SignalLevel): boolean {
        const rank: Record<SignalLevel, number> = {
            critical: 4,
            high: 3,
            normal: 2,
            trivial: 1,
        };
        return rank[signal] >= rank[this.minSignalForEnrichment];
    }

    private async detectRecurringAnomaly(item: QueuedEvent): Promise<void> {
        if (item.signal !== 'critical' && item.signal !== 'high') {
            return;
        }

        const now = Date.now();
        this.evictOldAnomalies(now);

        const signature = this.buildSignature(item.entry.content);
        if (!signature) return;

        const current = this.anomalyMap.get(signature);
        if (!current) {
            this.anomalyMap.set(signature, {
                source: item.entry.source,
                signal: item.signal,
                occurrences: 1,
                firstSeen: now,
                lastSeen: now,
                sample: item.entry.content,
            });
            return;
        }

        current.occurrences += 1;
        current.lastSeen = now;

        if (current.occurrences < this.anomalyThreshold) {
            return;
        }

        const alert: SemanticAlert = {
            id: `${signature}-${now}`,
            type: 'recurring-anomaly',
            severity: current.signal,
            source: current.source,
            signature,
            occurrences: current.occurrences,
            firstSeen: new Date(current.firstSeen).toISOString(),
            lastSeen: new Date(current.lastSeen).toISOString(),
            explanation: `Recurring anomaly detected for ${signature}: observed ${current.occurrences} times in the recent window.`,
            sample: current.sample,
        };

        this.recentAlerts.unshift(alert);
        if (this.recentAlerts.length > 500) {
            this.recentAlerts = this.recentAlerts.slice(0, 500);
        }

        try {
            await this.onSemanticAlert?.(alert);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.warn(`Failed to emit semantic alert callback: ${message}`);
        }

        // Reset the counter after emitting an alert to avoid duplicate spam.
        current.occurrences = 0;
        current.firstSeen = now;
        current.lastSeen = now;
    }

    private evictOldAnomalies(now: number): void {
        for (const [key, state] of this.anomalyMap.entries()) {
            if (now - state.lastSeen > this.anomalyWindowMs) {
                this.anomalyMap.delete(key);
            }
        }
    }

    private buildSignature(content: string): string {
        const normalized = content
            .toLowerCase()
            .replace(/\b\d+\b/g, '#')
            .replace(/\s+/g, ' ')
            .trim();
        if (!normalized) return '';

        if (normalized.includes('timeout')) return 'timeout';
        if (normalized.includes('denied') || normalized.includes('forbidden') || normalized.includes('unauthorized')) return 'permission-denied';
        if (normalized.includes('error') || normalized.includes('failed') || normalized.includes('failure')) return 'execution-error';
        if (normalized.includes('panic') || normalized.includes('fatal')) return 'fatal-runtime';

        return normalized.slice(0, 120);
    }

    private ensureTimer(): void {
        if (this.flushTimer) return;

        this.flushTimer = setTimeout(async () => {
            this.flushTimer = null;
            await this.flush();
        }, this.flushIntervalMs);
    }

    private clearTimer(): void {
        if (!this.flushTimer) return;
        clearTimeout(this.flushTimer);
        this.flushTimer = null;
    }
}
