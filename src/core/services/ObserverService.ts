import { Logger } from '../utils/Logger';
import { FileWatcher } from '@/src/observation/fileWatcher';
import { CodeObserver } from '@/src/observation/observers/codeObserver';
import { TerminalObserver } from '@/src/observation/observers/terminalObserver';
import { ApiObserver } from '@/src/observation/observers/apiObserver';
import { getEventBus } from '@/src/observation/EventBus';
import { randomUUID } from 'node:crypto';
import { EventEnrichmentIngestionService } from './EventEnrichmentIngestionService';
import type { MemoryEntry } from '@/src/memory';
import type { SemanticAlert } from './EventEnrichmentIngestionService';
import type { PersistentEventStore } from './PersistentEventStore';
import { getPersistentEventBus, type PersistentEventBus } from '@/src/observation/PersistentEventBus';

export interface ObserverStatus {
  id: string;
  title: string;
  status: 'Active' | 'Paused' | 'Error';
  subtitle: string;
  active: boolean;
  lastEvent?: string;
  eventCount?: number;
}

/**
 * ObserverService - Manages all system observers with real state
 */
export class ObserverService {
  private static instance: ObserverService;
  private logger = Logger.getInstance('ObserverService');
  private fileWatcher: FileWatcher;
  private codeObserver: CodeObserver;
  private terminalObserver: TerminalObserver;
  private apiObserver: ApiObserver;
  private eventCounts: Map<string, number> = new Map();
  private lastEvents: Map<string, string> = new Map();
  private semanticAlerts: SemanticAlert[] = [];
  private persistentStore?: PersistentEventStore;
  private persistentBus?: PersistentEventBus;
  private recentEvents = new Map<string, Array<{ timestamp: string; message: string }>>();
  private enrichmentIngestion = new EventEnrichmentIngestionService(undefined, {
    onSemanticAlert: async (alert) => {
      await this.onSemanticAlert(alert);
    },
  });

  private activeObservers: Set<string> = new Set();
  private settingsService: any = null;

  private constructor() {
    this.fileWatcher = new FileWatcher();
    this.codeObserver = new CodeObserver();
    this.terminalObserver = new TerminalObserver();
    this.apiObserver = new ApiObserver();

    this.setupEventTracking();
    this.setupEnrichmentIngestion();
  }

  static getInstance(): ObserverService {
    if (!ObserverService.instance) {
      ObserverService.instance = new ObserverService();
    }
    return ObserverService.instance;
  }

  async setSettingsService(settingsService: any) {
    this.settingsService = settingsService;
    await this.loadPersistedState();
  }

  setPersistentEventStore(store: PersistentEventStore): void {
    this.persistentStore = store;
    this.persistentBus = getPersistentEventBus('observer-service', store, {
      workspaceId: 'system',
      projectId: 'system',
    });
  }

  private async loadPersistedState() {
    if (!this.settingsService) return;
    try {
      const workspaceId = 'system'; // Using 'system' for global observer states
      const setting = await this.settingsService.getSetting(workspaceId, 'observers.active');
      if (setting && setting.value) {
        const activeIds = JSON.parse(setting.value);
        if (Array.isArray(activeIds)) {
          for (const id of activeIds) {
            await this.startObserver(id);
          }
        }
      } else {
        // Defaults if no settings exist
        await this.startObserver('fs');
        await this.startObserver('terminal');
      }
    } catch (error) {
      this.logger.error(`Failed to load persisted observer state: ${error}`);
    }
  }

  private async persistState() {
    if (!this.settingsService) return;
    try {
      const workspaceId = 'system';
      await this.settingsService.setSetting(
        workspaceId,
        'observers.active',
        JSON.stringify(Array.from(this.activeObservers)),
        'json',
        'List of active observer IDs',
        true
      );
    } catch (error) {
      this.logger.error(`Failed to persist observer state: ${error}`);
    }
  }

  private setupEventTracking(): void {
    const bus = getEventBus('default');

    // Track all events for observer statistics
    const originalEmit = (bus as any).emit?.bind(bus);
    if (typeof originalEmit === 'function') {
      (bus as any).emit = async (eventType: string, data?: unknown) => {
        this.updateEventStats(eventType);
        return originalEmit(eventType, data);
      };
    }
  }

  private setupEnrichmentIngestion(): void {
    const codeBus = getEventBus('code-observer');
    const terminalBus = getEventBus('terminal-observer');
    const apiBus = getEventBus('api-observer');
    const syncBus = getEventBus('auto-sync');

    codeBus.on('code:changed', (event) => {
      const filePath = String(event.data?.filePath || 'unknown');
      this.pushRecentEvent('fs', `Code changed: ${filePath}`, event.timestamp);
      void this.enqueueForEnrichment({
        id: randomUUID(),
        source: 'code-observer',
        content: `Code changed: ${filePath}`,
        timestamp: event.timestamp,
      });
    });

    terminalBus.on('terminal:output', (event) => {
      const sessionId = String(event.data?.sessionId || 'unknown');
      const raw = String(event.data?.data || '');
      const compact = raw.length > 1200 ? `${raw.slice(0, 1200)}...` : raw;
      this.pushRecentEvent('terminal', `Terminal output [${sessionId}]`, event.timestamp);
      void this.enqueueForEnrichment({
        id: randomUUID(),
        source: 'terminal-observer',
        content: `Terminal output [${sessionId}]: ${compact}`,
        timestamp: event.timestamp,
      });
    });

    apiBus.on('api:call', (event) => {
      const method = String(event.data?.method || 'UNKNOWN');
      const route = String(event.data?.path || 'unknown');
      const statusCode = Number(event.data?.statusCode || 0);
      const durationMs = Number(event.data?.durationMs || 0);
      this.pushRecentEvent('api', `API call ${method} ${route} -> ${statusCode}`, event.timestamp);
      void this.enqueueForEnrichment({
        id: randomUUID(),
        source: 'api-observer',
        content: `API call ${method} ${route} -> ${statusCode} (${durationMs}ms)`,
        timestamp: event.timestamp,
      });
    });

    syncBus.on('auto-sync:error', (event) => {
      const message = String(event.data?.data?.error || 'Auto-sync error');
      this.pushRecentEvent('fs', `Auto-sync error: ${message}`, event.timestamp);
      void this.enqueueForEnrichment({
        id: randomUUID(),
        source: 'auto-sync',
        content: `Auto-sync error: ${message}`,
        timestamp: event.timestamp,
      });
    });

    syncBus.on('auto-sync:file-changed', (event) => {
      const file = String(event.data?.data?.file || 'unknown');
      this.pushRecentEvent('fs', `Auto-sync file changed: ${file}`, event.timestamp);
      void this.enqueueForEnrichment({
        id: randomUUID(),
        source: 'auto-sync',
        content: `Auto-sync file changed: ${file}`,
        timestamp: event.timestamp,
      });
    });
  }

  private async enqueueForEnrichment(entry: MemoryEntry): Promise<void> {
    try {
      await this.enrichmentIngestion.ingest(entry);
    } catch (error) {
      this.logger.warn(`Failed to enqueue event enrichment: ${error}`);
    }
  }

  private async onSemanticAlert(alert: SemanticAlert): Promise<void> {
    this.semanticAlerts.unshift(alert);
    if (this.semanticAlerts.length > 500) {
      this.semanticAlerts = this.semanticAlerts.slice(0, 500);
    }

    const defaultBus = getEventBus('default');
    await defaultBus.emit('observer:semantic-alert', alert);

    if (this.persistentBus) {
      await this.persistentBus.emit('observer:semantic-alert', alert);
      return;
    }

    if (this.persistentStore) {
      await this.persistentStore.saveEvent({
        type: 'observer:semantic-alert',
        sourceId: 'observer-service',
        data: alert,
        timestamp: new Date(),
        projectId: 'system',
        workspaceId: 'system',
      });
    }
  }

  private pushRecentEvent(observerId: string, message: string, timestamp: Date): void {
    const bucket = this.recentEvents.get(observerId) || [];
    bucket.unshift({ timestamp: timestamp.toISOString(), message });
    this.recentEvents.set(observerId, bucket.slice(0, 200));
  }

  private updateEventStats(eventType: string): void {
    const observerId = this.getObserverIdFromEvent(eventType);
    if (observerId) {
      this.eventCounts.set(observerId, (this.eventCounts.get(observerId) || 0) + 1);
      this.lastEvents.set(observerId, `${eventType} - ${new Date().toISOString()}`);
    }
  }

  private getObserverIdFromEvent(eventType: string): string | null {
    if (eventType.startsWith('fs:') || eventType.startsWith('code:')) return 'fs';
    if (eventType.startsWith('terminal:')) return 'terminal';
    if (eventType.startsWith('api:')) return 'api';
    return null;
  }

  async startObserver(id: string): Promise<void> {
    try {
      switch (id) {
        case 'fs':
          await this.startFileWatcher();
          break;
        case 'terminal':
          this.startTerminalObserver();
          break;
        case 'api':
          this.startApiObserver();
          break;
        default:
          throw new Error(`Unknown observer: ${id}`);
      }
      this.activeObservers.add(id);
      await this.persistState();
      this.logger.info(`Observer ${id} started`);
    } catch (error) {
      this.logger.error(`Failed to start observer ${id}: ${error}`);
      throw error;
    }
  }

  async stopObserver(id: string): Promise<void> {
    try {
      switch (id) {
        case 'fs':
          await this.fileWatcher.stop();
          this.codeObserver.stop();
          break;
        case 'terminal':
          // Terminal observer doesn't have a stop method, just clear subscriptions
          break;
        case 'api':
          // ApiObserver doesn't have a stop method - it's passive
          break;
        default:
          throw new Error(`Unknown observer: ${id}`);
      }
      this.activeObservers.delete(id);
      await this.persistState();
      this.logger.info(`Observer ${id} stopped`);
    } catch (error) {
      this.logger.error(`Failed to stop observer ${id}: ${error}`);
      throw error;
    }
  }

  private async startFileWatcher(): Promise<void> {
    const workspacePath = process.cwd(); // Could be made configurable per workspace
    this.fileWatcher.start([workspacePath]);
    this.codeObserver.start();
  }

  private startTerminalObserver(): void {
    // Real terminal integration would require shell hooks or PTY monitoring
    this.logger.info('Terminal observer ready for recording');
  }

  private startApiObserver(): void {
    // ApiObserver is passive - it just provides a recording interface
    // Real API monitoring would require middleware or request interceptors
    this.logger.info('API observer ready for recording');
  }

  getObserverStatuses(): ObserverStatus[] {
    return [
      {
        id: 'fs',
        title: 'FS Watcher',
        status: this.getObserverStatus('fs'),
        subtitle: process.cwd(),
        active: this.isObserverActive('fs'),
        lastEvent: this.lastEvents.get('fs'),
        eventCount: this.eventCounts.get('fs') || 0,
      },
      {
        id: 'terminal',
        title: 'Terminal',
        status: this.getObserverStatus('terminal'),
        subtitle: 'Shell hooks',
        active: this.isObserverActive('terminal'),
        lastEvent: this.lastEvents.get('terminal'),
        eventCount: this.eventCounts.get('terminal') || 0,
      },
      {
        id: 'api',
        title: 'API Monitor',
        status: this.getObserverStatus('api'),
        subtitle: 'REST Hooks',
        active: this.isObserverActive('api'),
        lastEvent: this.lastEvents.get('api'),
        eventCount: this.eventCounts.get('api') || 0,
      },
    ];
  }

  private getObserverStatus(id: string): 'Active' | 'Paused' | 'Error' {
    return this.isObserverActive(id) ? 'Active' : 'Paused';
  }

  private isObserverActive(id: string): boolean {
    return this.activeObservers.has(id);
  }

  async toggleObserver(id: string, active: boolean): Promise<ObserverStatus> {
    if (active) {
      await this.startObserver(id);
    } else {
      await this.stopObserver(id);
    }

    const statuses = this.getObserverStatuses();
    return statuses.find(s => s.id === id)!;
  }

  getRecentEvents(observerId: string, limit: number = 50): any[] {
    const safeLimit = Math.max(1, Math.min(limit, 200));
    return (this.recentEvents.get(observerId) || []).slice(0, safeLimit);
  }

  getSemanticAlerts(limit: number = 50): SemanticAlert[] {
    const safeLimit = Math.max(1, Math.min(limit, 200));
    return this.semanticAlerts.slice(0, safeLimit);
  }

  // Convenience method for terminal recording
  recordTerminalOutput(sessionId: string, data: string): void {
    this.terminalObserver.record({ sessionId, data });
  }

  // Initialize all observers on service start
  async initialize(): Promise<void> {
    this.logger.info('Initializing ObserverService');

    // Start default observers
    await this.startObserver('fs');
    this.startObserver('terminal');
    // API observer starts paused by default

    this.logger.info('ObserverService initialized');
  }
}
