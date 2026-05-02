import { watch, FSWatcher } from 'chokidar';
import { Logger } from '../core/utils/Logger';
import { getEventBus } from './EventBus';

export interface FileChangeEvent {
    type: 'add' | 'change' | 'unlink';
    filePath: string;
    timestamp: Date;
}

/**
 * FileWatcher
 *
 * Watches a set of paths for file-system changes and emits
 * events on the shared event bus.
 */
export class FileWatcher {
    private watcher: FSWatcher | null = null;
    private bus = getEventBus('file-watcher');
    private logger = Logger.getInstance('FileWatcher');

    start(paths: string | string[], ignored?: string | RegExp): void {
        if (this.watcher) {
            this.logger.warn('FileWatcher already running — call stop() first');
            return;
        }

        this.watcher = watch(paths, {
            persistent: false,
            ignoreInitial: true,
            ignorePermissionErrors: true,
            ignored: ignored ?? /(node_modules|\.git|dist|\.next)/,
        });

        const emit = (type: FileChangeEvent['type']) => (filePath: string) => {
            const event: FileChangeEvent = { type, filePath, timestamp: new Date() };
            this.bus.emit(`fs:${type}`, event);
            this.logger.debug(`fs:${type} ${filePath}`);
        };

        this.watcher
            .on('add', emit('add'))
            .on('change', emit('change'))
            .on('unlink', emit('unlink'))
            .on('error', (err) => this.logger.error(`FileWatcher error: ${err}`));

        this.logger.info(`FileWatcher started — watching: ${Array.isArray(paths) ? paths.join(', ') : paths}`);
    }

    async stop(): Promise<void> {
        if (this.watcher) {
            await this.watcher.close();
            this.watcher = null;
            this.logger.info('FileWatcher stopped');
        }
    }
}
