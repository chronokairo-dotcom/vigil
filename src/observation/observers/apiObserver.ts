import { Logger } from '../../core/utils/Logger';
import { getEventBus } from '../EventBus';

export interface ApiCallRecord {
    method: string;
    path: string;
    statusCode: number;
    durationMs: number;
    timestamp: Date;
}

/**
 * ApiObserver
 *
 * Records API calls and emits `api:call` events for
 * monitoring and replay purposes.
 */
export class ApiObserver {
    private bus = getEventBus('api-observer');
    private logger = Logger.getInstance('ApiObserver');

    record(record: Omit<ApiCallRecord, 'timestamp'>): void {
        const event: ApiCallRecord = { ...record, timestamp: new Date() };
        this.bus.emit('api:call', event);
        if (record.statusCode >= 500) {
            this.logger.error(`api:call ${record.method} ${record.path} -> ${record.statusCode} (${record.durationMs}ms)`);
        } else {
            this.logger.debug(`api:call ${record.method} ${record.path} -> ${record.statusCode} (${record.durationMs}ms)`);
        }
    }

    onCall(callback: (record: ApiCallRecord) => void): () => void {
        return this.bus.on('api:call', (event) => {
            callback(event.data as ApiCallRecord);
        });
    }
}
