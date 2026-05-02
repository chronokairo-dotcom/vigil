import { DataSource } from 'typeorm';
import { Logger } from '../utils/Logger';
import chokidar from 'chokidar';
import { getEventBus } from '../events';

/**
 * Auto-Sync Service
 * 
 * Gerencia sincronização automática de contexto entre:
 * - Diretório do projeto (workspace)
 * - Banco de dados (SQLite)
 * - VS Code (mediante EventBus)
 * 
 * Monitora mudanças em arquivos e sincroniza automaticamente
 * com debounce para evitar múltiplas sincronizações simultâneas.
 */

export interface AutoSyncConfig {
  projectPath: string;
  workspaceId: string;
  projectId: string;
  debounceMs?: number;
  watchPatterns?: string[];
  ignorePatterns?: string[];
}

export interface SyncEvent {
  type: 'file-changed' | 'sync-started' | 'sync-completed' | 'sync-error';
  projectId: string;
  workspaceId: string;
  timestamp: Date;
  data?: any;
}

export class AutoSyncService {
  private static instance: AutoSyncService;
  private logger = Logger.getInstance();
  private bus = getEventBus('auto-sync');
  private isRunning: boolean = false;
  private watcher: chokidar.FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private debounceMs: number;
  private watchPatterns: string[];
  private ignorePatterns: string[];
  private config: AutoSyncConfig;
  private syncSchedule: NodeJS.Timer | null = null;
  private lastSyncTime: number = 0;
  private syncInProgress: boolean = false;

  private constructor(
    private db?: DataSource,
    config?: Partial<AutoSyncConfig>
  ) {
    this.config = {
      projectPath: config?.projectPath || process.cwd(),
      workspaceId: config?.workspaceId || 'default',
      projectId: config?.projectId || 'default',
      debounceMs: config?.debounceMs || 1000,
    };

    this.debounceMs = this.config.debounceMs!;
    this.watchPatterns = config?.watchPatterns || ['**/*.ts', '**/*.tsx', '**/*.md', '**/*.json'];
    this.ignorePatterns = config?.ignorePatterns || [
      '**/node_modules/**',
      '**/.git/**',
      '**/.vscode/**',
      '**/dist/**',
      '**/.Vigil/**',
    ];

    this.logger.info('[AutoSync] Service initialized', {
      projectPath: this.config.projectPath,
      workspaceId: this.config.workspaceId,
    });
  }

  public static getInstance(
    db?: DataSource,
    config?: Partial<AutoSyncConfig>
  ): AutoSyncService {
    if (!AutoSyncService.instance) {
      AutoSyncService.instance = new AutoSyncService(db, config);
    }
    return AutoSyncService.instance;
  }

  /**
   * Iniciar serviço de sincronização automática
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('[AutoSync] Service already running');
      return;
    }

    try {
      this.logger.info('[AutoSync] Starting auto-sync service', {
        projectPath: this.config.projectPath,
      });

      this.isRunning = true;

      // Iniciar file watcher
      this.startFileWatcher();

      // Iniciar scheduled sync a cada 5 minutos
      this.startScheduledSync();

      // Emitir evento de inicialização
      await this.bus.emit('auto-sync:started', {
        type: 'sync-started',
        projectId: this.config.projectId,
        workspaceId: this.config.workspaceId,
        timestamp: new Date(),
      });

      this.logger.info('[AutoSync] Service started successfully');
    } catch (error) {
      this.logger.error('[AutoSync] Failed to start service', { error });
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Parar serviço de sincronização automática
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      this.logger.info('[AutoSync] Stopping auto-sync service');

      this.isRunning = false;

      // Fechar file watcher
      if (this.watcher) {
        await this.watcher.close();
        this.watcher = null;
      }

      // Parar scheduled sync
      if (this.syncSchedule) {
        clearInterval(this.syncSchedule as any);
        this.syncSchedule = null;
      }

      // Limpar debounce timer
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }

      await this.bus.emit('auto-sync:stopped', {
        type: 'sync-completed',
        projectId: this.config.projectId,
        workspaceId: this.config.workspaceId,
        timestamp: new Date(),
      });

      this.logger.info('[AutoSync] Service stopped');
    } catch (error) {
      this.logger.error('[AutoSync] Error stopping service', { error });
      throw error;
    }
  }

  /**
   * Verificar se o serviço está rodando
   */
  isServiceRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Executar sincronização manual
   */
  async sync(): Promise<boolean> {
    if (this.syncInProgress) {
      this.logger.debug('[AutoSync] Sync already in progress, skipping');
      return false;
    }

    try {
      this.syncInProgress = true;
      this.lastSyncTime = Date.now();

      this.logger.info('[AutoSync] Starting manual sync', {
        projectPath: this.config.projectPath,
      });

      // Aqui seria chamado o serviço de sincronização real
      // Por enquanto, apenas emitir evento
      await this.bus.emit('auto-sync:syncing', {
        type: 'sync-started',
        projectId: this.config.projectId,
        workspaceId: this.config.workspaceId,
        timestamp: new Date(),
      });

      // Simular delay de sincronização
      await new Promise(resolve => setTimeout(resolve, 500));

      await this.bus.emit('auto-sync:synced', {
        type: 'sync-completed',
        projectId: this.config.projectId,
        workspaceId: this.config.workspaceId,
        timestamp: new Date(),
      });

      this.logger.info('[AutoSync] Sync completed successfully');
      return true;
    } catch (error) {
      this.logger.error('[AutoSync] Sync failed', { error });
      await this.bus.emit('auto-sync:error', {
        type: 'sync-error',
        projectId: this.config.projectId,
        workspaceId: this.config.workspaceId,
        timestamp: new Date(),
        data: { error: String(error) },
      });
      return false;
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Iniciar file watcher para detectar mudanças
   */
  private startFileWatcher(): void {
    try {
      this.watcher = chokidar.watch(this.watchPatterns, {
        cwd: this.config.projectPath,
        ignored: this.ignorePatterns,
        ignoreInitial: true,
        persistent: true,
        awaitWriteFinish: {
          stabilityThreshold: 500,
          pollInterval: 100,
        },
      });

      // Eventos de mudança de arquivo
      this.watcher
        .on('add', (file) => this.onFileChanged(file, 'add'))
        .on('change', (file) => this.onFileChanged(file, 'change'))
        .on('unlink', (file) => this.onFileChanged(file, 'unlink'))
        .on('error', (error) => {
          this.logger.error('[AutoSync] File watcher error', { error });
        });

      this.logger.debug('[AutoSync] File watcher started');
    } catch (error) {
      this.logger.error('[AutoSync] Failed to start file watcher', { error });
      throw error;
    }
  }

  /**
   * Handler para mudanças em arquivos (com debounce)
   */
  private onFileChanged(file: string, type: string): void {
    this.logger.debug('[AutoSync] File changed', { file, type });

    // Emitir evento de mudança
    this.bus.emit('auto-sync:file-changed', {
      type: 'file-changed',
      projectId: this.config.projectId,
      workspaceId: this.config.workspaceId,
      timestamp: new Date(),
      data: { file, changeType: type },
    }).catch(err => {
      this.logger.error('[AutoSync] Failed to emit file change event', { error: err });
    });

    // Debounce: aguardar antes de sincronizar
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.sync().catch(error => {
        this.logger.error('[AutoSync] Auto-sync after file change failed', { error });
      });
    }, this.debounceMs);
  }

  /**
   * Iniciar scheduled sync periódico (a cada 5 minutos)
   */
  private startScheduledSync(): void {
    // Sync a cada 5 minutos
    const syncIntervalMs = 5 * 60 * 1000;

    this.syncSchedule = setInterval(() => {
      if (!this.syncInProgress) {
        this.sync().catch(error => {
          this.logger.error('[AutoSync] Scheduled sync failed', { error });
        });
      }
    }, syncIntervalMs);

    this.logger.debug('[AutoSync] Scheduled sync started', { intervalMs: syncIntervalMs });
  }

  /**
   * Obter status do serviço
   */
  getStatus(): {
    isRunning: boolean;
    lastSyncTime: number;
    syncInProgress: boolean;
    projectPath: string;
    workspaceId: string;
  } {
    return {
      isRunning: this.isRunning,
      lastSyncTime: this.lastSyncTime,
      syncInProgress: this.syncInProgress,
      projectPath: this.config.projectPath,
      workspaceId: this.config.workspaceId,
    };
  }
}
