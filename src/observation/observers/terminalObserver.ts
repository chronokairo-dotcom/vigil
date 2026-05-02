import { Logger } from '../../core/utils/Logger';
import { getEventBus } from '../EventBus';

export interface TerminalOutput {
    sessionId: string;
    data: string;
    timestamp: Date;
}

/**
 * TerminalObserver
 *
 * Provides a method to record terminal output and emits
 * `terminal:output` events for downstream consumers.
 */
export class TerminalObserver {
    private bus = getEventBus('terminal-observer');
    private logger = Logger.getInstance('TerminalObserver');

    record(output: Omit<TerminalOutput, 'timestamp'>): void {
        const event: TerminalOutput = { ...output, timestamp: new Date() };
        this.bus.emit('terminal:output', event);
        this.logger.debug(`terminal:output session=${event.sessionId} bytes=${event.data.length}`);
    }

    onOutput(callback: (output: TerminalOutput) => void): () => void {
        return this.bus.on('terminal:output', (event) => {
            callback(event.data as TerminalOutput);
        });
    }
}
