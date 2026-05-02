import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe.sequential('README concept tests', () => {
    const originalCwd = process.cwd();
    let tempRoot = '';
    const envBackup = { ...process.env };

    const withFreshRuntime = async () => {
        vi.resetModules();
        const memoryModule = await import('../memory/memoryManager');
        const observationModule = await import('../observation/EventBus');
        const sleepConsolidatorModule = await import('../sleep/consolidator');
        const sleepSummarizerModule = await import('../sleep/summarizer');
        const sleepPruningModule = await import('../sleep/pruning');
        const rankingModule = await import('../recall/ranking');
        const autoSyncModule = await import('../core/services/AutoSyncService');
        const featureFlagsModule = await import('../config/featureFlags');

        return {
            MemoryManager: memoryModule.MemoryManager,
            getEventBus: observationModule.getEventBus,
            Consolidator: sleepConsolidatorModule.Consolidator,
            Summarizer: sleepSummarizerModule.Summarizer,
            Pruning: sleepPruningModule.Pruning,
            rank: rankingModule.rank,
            AutoSyncService: autoSyncModule.AutoSyncService,
            featureFlags: featureFlagsModule.featureFlags,
        };
    };

    beforeEach(async () => {
        tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vigil-readme-tests-'));
        process.chdir(tempRoot);
    });

    afterEach(async () => {
        process.chdir(originalCwd);
        if (tempRoot) {
            await fs.rm(tempRoot, { recursive: true, force: true });
        }
        for (const key of Object.keys(process.env)) {
            if (!(key in envBackup)) {
                delete process.env[key];
            }
        }
        Object.assign(process.env, envBackup);
    });

    it('keeps daemon capabilities behind runtime feature flags', async () => {
        delete process.env.VIGIL_FEATURE_SLEEP;
        delete process.env.VIGIL_FEATURE_MULTIMODAL;

        const defaults = await withFreshRuntime();
        expect(defaults.featureFlags.enableSleepConsolidation).toBe(true);
        expect(defaults.featureFlags.enableMultimodalAgents).toBe(false);

        process.env.VIGIL_FEATURE_SLEEP = 'false';
        process.env.VIGIL_FEATURE_MULTIMODAL = 'true';

        const overridden = await withFreshRuntime();
        expect(overridden.featureFlags.enableSleepConsolidation).toBe(false);
        expect(overridden.featureFlags.enableMultimodalAgents).toBe(true);
    });

    it('persists append-only memory logs', async () => {
        const { MemoryManager } = await withFreshRuntime();
        const manager = MemoryManager.getInstance();

        const firstEntry = {
            id: 'evt-1',
            content: 'file changed',
            source: 'code-observer',
            projectId: 'project-a',
            timestamp: new Date('2026-04-25T10:00:00.000Z'),
        };

        const secondEntry = {
            id: 'evt-2',
            content: 'command executed',
            source: 'terminal-observer',
            projectId: 'project-a',
            timestamp: new Date('2026-04-25T10:05:00.000Z'),
        };

        await manager.log(firstEntry);
        await manager.log(secondEntry);

        const today = new Date().toISOString().slice(0, 10);
        const entries = await manager.readLog(today);
        expect(entries).toHaveLength(2);
        expect(entries.map((entry) => entry.id)).toEqual(['evt-1', 'evt-2']);

        const logFile = path.join(process.cwd(), 'data', 'logs', `${today}.log`);
        const fileContent = await fs.readFile(logFile, 'utf8');
        expect(fileContent.trim().split('\n')).toHaveLength(2);
    });

    it('supports continuous observation via event bus subscriptions', async () => {
        const { getEventBus } = await withFreshRuntime();
        const bus = getEventBus('readme-observer');

        const received: Array<{ type: string; payload: string }> = [];
        const unsubscribe = bus.on('fs:change', (event) => {
            received.push({ type: event.type, payload: event.data.filePath });
        });

        await bus.emit('fs:change', { filePath: 'src/main.ts' });
        unsubscribe();
        await bus.emit('fs:change', { filePath: 'src/ignored.ts' });

        expect(received).toEqual([{ type: 'fs:change', payload: 'src/main.ts' }]);
    });

    it('behaves as a long-lived daemon process until explicitly stopped', async () => {
        const { AutoSyncService, getEventBus } = await withFreshRuntime();
        const daemonBus = getEventBus('auto-sync');

        const lifecycleEvents: string[] = [];
        const unsubStarted = daemonBus.on('auto-sync:started', () => lifecycleEvents.push('started'));
        const unsubStopped = daemonBus.on('auto-sync:stopped', () => lifecycleEvents.push('stopped'));
        const unsubSynced = daemonBus.on('auto-sync:synced', () => lifecycleEvents.push('synced'));

        const daemon = AutoSyncService.getInstance(undefined, {
            projectPath: process.cwd(),
            workspaceId: 'workspace-daemon',
            projectId: 'project-daemon',
            debounceMs: 50,
            watchPatterns: ['**/*.md'],
            ignorePatterns: ['**/node_modules/**', '**/.git/**'],
        });

        await daemon.start();
        expect(daemon.isServiceRunning()).toBe(true);

        const syncResult = await daemon.sync();
        expect(syncResult).toBe(true);

        await daemon.stop();
        expect(daemon.isServiceRunning()).toBe(false);

        unsubStarted();
        unsubStopped();
        unsubSynced();

        expect(lifecycleEvents).toContain('started');
        expect(lifecycleEvents).toContain('synced');
        expect(lifecycleEvents).toContain('stopped');
    });

    it('builds sleep-cycle artifacts and prunes old files', async () => {
        const { MemoryManager, Consolidator, Summarizer, Pruning } = await withFreshRuntime();
        const manager = MemoryManager.getInstance();

        const date = new Date().toISOString().slice(0, 10);
        await manager.log({
            id: 'evt-1',
            content: 'first event',
            source: 'api-observer',
            projectId: 'project-x',
            timestamp: new Date(),
        });
        await manager.log({
            id: 'evt-2',
            content: 'second event',
            source: 'api-observer',
            projectId: 'project-y',
            timestamp: new Date(),
        });
        await manager.log({
            id: 'evt-3',
            content: 'third event',
            source: 'code-observer',
            projectId: 'project-x',
            timestamp: new Date(),
        });

        const consolidator = new Consolidator();
        const consolidated = await consolidator.consolidate(date);
        expect(consolidated.totalEntries).toBe(3);
        expect(consolidated.bySource['api-observer']).toBe(2);
        expect(consolidated.byProject['project-x']).toBe(2);

        const summarizer = new Summarizer();
        const summary = await summarizer.summarize(date);
        expect(summary.headline).toContain('3 events recorded');

        const summaryFile = path.join(process.cwd(), 'data', 'summaries', 'daily', `${date}.md`);
        const summaryMd = await fs.readFile(summaryFile, 'utf8');
        expect(summaryMd).toContain('Events by Source');

        const oldDate = new Date('2020-01-01T00:00:00.000Z');
        const logFile = path.join(process.cwd(), 'data', 'logs', `${date}.log`);
        await fs.utimes(logFile, oldDate, oldDate);
        await fs.utimes(summaryFile, oldDate, oldDate);

        const pruning = new Pruning({ logRetentionDays: 1, summaryRetentionDays: 1 });
        const result = await pruning.run();
        expect(result.logsRemoved).toBeGreaterThanOrEqual(1);
        expect(result.summariesRemoved).toBeGreaterThanOrEqual(1);
    });

    it('prioritizes contextual recall relevance in ranking', async () => {
        const { rank } = await withFreshRuntime();

        const ranked = rank(
            [
                {
                    id: '1',
                    key: 'database migration',
                    value: 'plan migration and schema updates',
                    category: 'architecture',
                    priority: 5,
                    projectId: 'project-a',
                    score: 0.3,
                },
                {
                    id: '2',
                    key: 'migration checklist',
                    value: 'migration migration migration',
                    category: 'operations',
                    priority: 4,
                    projectId: 'project-a',
                    score: 0.2,
                },
            ],
            'migration'
        );

        expect(ranked[0].id).toBe('2');
        expect(ranked[0].rank).toBe(1);
        expect(ranked[0].finalScore).toBeGreaterThan(ranked[1].finalScore);
    });
});
