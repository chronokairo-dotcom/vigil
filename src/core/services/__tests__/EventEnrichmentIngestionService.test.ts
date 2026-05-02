import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function makeEntry(id: string) {
    return {
        id,
        content: `event-${id}`,
        source: 'test-observer',
        projectId: 'project-a',
        timestamp: new Date('2026-04-26T10:00:00.000Z'),
    };
}

describe.sequential('EventEnrichmentIngestionService', () => {
    const originalCwd = process.cwd();
    let tempRoot = '';

    beforeEach(async () => {
        tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vigil-enrichment-ingestion-'));
        process.chdir(tempRoot);
        vi.useFakeTimers();
        vi.resetModules();
    });

    afterEach(async () => {
        vi.useRealTimers();
        process.chdir(originalCwd);
        if (tempRoot) {
            await fs.rm(tempRoot, { recursive: true, force: true });
        }
    });

    it('flushes immediately when batch size is reached', async () => {
        const fakeEnricher = { enrichBatch: vi.fn().mockResolvedValue([]) };
        const { EventEnrichmentIngestionService } = await import('../EventEnrichmentIngestionService');

        const ingestion = new EventEnrichmentIngestionService(fakeEnricher as any, {
            batchSize: 2,
            flushIntervalMs: 5000,
            minSignalForEnrichment: 'normal',
        });

        await ingestion.ingest(makeEntry('evt-1'));
        expect(fakeEnricher.enrichBatch).toHaveBeenCalledTimes(0);

        await ingestion.ingest(makeEntry('evt-2'));

        expect(fakeEnricher.enrichBatch).toHaveBeenCalledTimes(1);
        const [batchArg, optionsArg] = fakeEnricher.enrichBatch.mock.calls[0];
        expect(batchArg).toHaveLength(2);
        expect(optionsArg).toEqual({ persist: true });
    });

    it('flushes pending entries when timer elapses', async () => {
        const fakeEnricher = { enrichBatch: vi.fn().mockResolvedValue([]) };
        const { EventEnrichmentIngestionService } = await import('../EventEnrichmentIngestionService');

        const ingestion = new EventEnrichmentIngestionService(fakeEnricher as any, {
            batchSize: 5,
            flushIntervalMs: 100,
            minSignalForEnrichment: 'normal',
        });

        await ingestion.ingest(makeEntry('evt-3'));
        expect(ingestion.getPendingCount()).toBe(1);

        await vi.advanceTimersByTimeAsync(120);

        expect(fakeEnricher.enrichBatch).toHaveBeenCalledTimes(1);
        expect(ingestion.getPendingCount()).toBe(0);
    });

    it('writes raw append-only logs while queueing for enrichment', async () => {
        const fakeEnricher = { enrichBatch: vi.fn().mockResolvedValue([]) };
        const { EventEnrichmentIngestionService } = await import('../EventEnrichmentIngestionService');

        const ingestion = new EventEnrichmentIngestionService(fakeEnricher as any, {
            batchSize: 10,
            flushIntervalMs: 5_000,
        });

        await ingestion.ingest(makeEntry('evt-4'));

        const logFile = path.join(process.cwd(), 'data', 'logs', '2026-04-26.log');
        const content = await fs.readFile(logFile, 'utf8');
        expect(content).toContain('"id":"evt-4"');

        await ingestion.stop();
        expect(fakeEnricher.enrichBatch).toHaveBeenCalledTimes(0);
    });

    it('prioritizes critical events ahead of lower priority events', async () => {
        const fakeEnricher = { enrichBatch: vi.fn().mockResolvedValue([]) };
        const { EventEnrichmentIngestionService } = await import('../EventEnrichmentIngestionService');

        const ingestion = new EventEnrichmentIngestionService(fakeEnricher as any, {
            batchSize: 2,
            flushIntervalMs: 5_000,
            minSignalForEnrichment: 'normal',
        });

        await ingestion.ingest({
            ...makeEntry('evt-5'),
            content: 'processo finalizado com código 0',
        });
        await ingestion.ingest({
            ...makeEntry('evt-6'),
            content: 'API call GET /health -> 500 (120ms) failure',
        });

        expect(fakeEnricher.enrichBatch).toHaveBeenCalledTimes(1);
        const [batchArg] = fakeEnricher.enrichBatch.mock.calls[0];
        expect(batchArg).toHaveLength(1);
        expect(batchArg[0].id).toBe('evt-6');
    });

    it('sends only high-signal events to enrichment by default', async () => {
        const fakeEnricher = { enrichBatch: vi.fn().mockResolvedValue([]) };
        const { EventEnrichmentIngestionService } = await import('../EventEnrichmentIngestionService');

        const ingestion = new EventEnrichmentIngestionService(fakeEnricher as any, {
            batchSize: 3,
            flushIntervalMs: 5_000,
        });

        await ingestion.ingest({ ...makeEntry('evt-7'), content: 'Code changed: src/foo.ts' });
        await ingestion.ingest({ ...makeEntry('evt-8'), content: 'heartbeat ok' });
        await ingestion.ingest({ ...makeEntry('evt-9'), content: 'terminal error timeout denied' });

        expect(fakeEnricher.enrichBatch).toHaveBeenCalledTimes(1);
        const [batchArg] = fakeEnricher.enrichBatch.mock.calls[0];
        expect(batchArg).toHaveLength(1);
        expect(batchArg[0].id).toBe('evt-9');
    });

    it('detects recurring anomalies and emits semantic alert callback', async () => {
        const fakeEnricher = { enrichBatch: vi.fn().mockResolvedValue([]) };
        const onSemanticAlert = vi.fn();
        const { EventEnrichmentIngestionService } = await import('../EventEnrichmentIngestionService');

        const ingestion = new EventEnrichmentIngestionService(fakeEnricher as any, {
            batchSize: 10,
            flushIntervalMs: 5_000,
            anomalyThreshold: 3,
            minSignalForEnrichment: 'high',
            onSemanticAlert,
        });

        await ingestion.ingest({ ...makeEntry('evt-10'), content: 'timeout while calling upstream service' });
        await ingestion.ingest({ ...makeEntry('evt-11'), content: 'timeout while calling upstream service' });
        await ingestion.ingest({ ...makeEntry('evt-12'), content: 'timeout while calling upstream service' });

        expect(onSemanticAlert).toHaveBeenCalledTimes(1);
        const alert = onSemanticAlert.mock.calls[0][0];
        expect(alert.type).toBe('recurring-anomaly');
        expect(alert.signature).toBe('timeout');
        expect(alert.explanation).toContain('Recurring anomaly detected');

        const alerts = ingestion.getRecentAlerts(10);
        expect(alerts).toHaveLength(1);
        expect(alerts[0].signature).toBe('timeout');
    });
});
