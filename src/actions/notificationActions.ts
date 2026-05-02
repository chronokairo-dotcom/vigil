import { BaseAction, ActionMeta } from './baseAction';
import { EventBus } from '../observation/EventBus';

export interface NotifyPayload {
    message: string;
    level?: 'info' | 'warn' | 'error';
    channel?: string;
}

/**
 * LogNotificationAction — emits a notification event to the event bus.
 */
export class LogNotificationAction extends BaseAction {
    constructor(
        private payload: NotifyPayload,
        private bus: EventBus,
        meta: Omit<ActionMeta, 'createdAt' | 'type'>,
    ) {
        super({ ...meta, type: 'notification:log' });
    }

    protected async execute(): Promise<unknown> {
        const { message, level = 'info', channel = 'notifications' } = this.payload;
        const eventType = `notification:${level}`;
        await this.bus.emit(eventType, { message, channel });
        return { type: eventType, message, channel };
    }
}
