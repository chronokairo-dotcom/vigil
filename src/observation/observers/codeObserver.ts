import { Logger } from '../../core/utils/Logger';
import { getEventBus } from '../EventBus';

/**
 * CodeObserver
 *
 * Listens for file-system events on source files and
 * re-emits enriched code-change events.
 */
export class CodeObserver {
    private bus = getEventBus('code-observer');
    private logger = Logger.getInstance('CodeObserver');
    private unsubscribers: Array<() => void> = [];

    start(): void {
        const fsBus = getEventBus('file-watcher');

        const unsub = fsBus.on('fs:change', async (event) => {
            const filePath: string = event.data?.filePath ?? '';
            if (!this.isSourceFile(filePath)) return;
            await this.bus.emit('code:changed', { filePath, timestamp: event.timestamp });
            this.logger.debug(`code:changed ${filePath}`);
        });

        this.unsubscribers.push(unsub);
        this.logger.info('CodeObserver started');
    }

    stop(): void {
        for (const unsub of this.unsubscribers) unsub();
        this.unsubscribers = [];
        this.logger.info('CodeObserver stopped');
    }

    private isSourceFile(filePath: string): boolean {
        return /\.(ts|tsx|js|jsx|py|go|rs|java|cs)$/.test(filePath);
    }
}
