import { DataSource, Repository } from 'typeorm';
import { SecuritySchedule, SecurityWebhook } from '../entities/SecuritySchedule';

export class SecurityScheduleService {
    private scheduleRepo: Repository<SecuritySchedule>;
    private webhookRepo: Repository<SecurityWebhook>;

    constructor(private db: DataSource) {
        this.scheduleRepo = db.getRepository(SecuritySchedule);
        this.webhookRepo = db.getRepository(SecurityWebhook);
    }

    async createSchedule(input: {
        workspaceId: string;
        scanType: 'code' | 'api' | 'dependency' | 'infrastructure' | 'system';
        targetName?: string;
        targetId?: string;
        frequency: string;
        options?: { deepScan?: boolean };
    }): Promise<SecuritySchedule> {
        const schedule = this.scheduleRepo.create({
            workspaceId: input.workspaceId,
            scanType: input.scanType,
            targetName: input.targetName || null,
            targetId: input.targetId || null,
            frequency: input.frequency,
            options: input.options || null,
            nextRun: this.calculateNextRun(input.frequency),
            enabled: true,
        });
        return this.scheduleRepo.save(schedule);
    }

    async listSchedules(workspaceId: string): Promise<SecuritySchedule[]> {
        return this.scheduleRepo.find({
            where: { workspaceId },
            order: { nextRun: 'ASC' },
        });
    }

    async getDueSchedules(): Promise<SecuritySchedule[]> {
        const now = new Date();
        return this.scheduleRepo
            .createQueryBuilder('s')
            .where('s.enabled = :enabled', { enabled: true })
            .andWhere('s.nextRun <= :now', { now })
            .getMany();
    }

    async markCompleted(scheduleId: string): Promise<void> {
        const schedule = await this.scheduleRepo.findOne({ where: { id: scheduleId } });
        if (schedule) {
            schedule.lastRun = new Date();
            schedule.nextRun = this.calculateNextRun(schedule.frequency);
            await this.scheduleRepo.save(schedule);
        }
    }

    async deleteSchedule(scheduleId: string): Promise<void> {
        await this.scheduleRepo.delete(scheduleId);
    }

    async toggleSchedule(scheduleId: string, enabled: boolean): Promise<void> {
        await this.scheduleRepo.update(scheduleId, { enabled });
    }

    private calculateNextRun(frequency: string): Date {
        const next = new Date();
        switch (frequency) {
            case 'daily':
                next.setDate(next.getDate() + 1);
                break;
            case 'weekly':
                next.setDate(next.getDate() + 7);
                break;
            case 'monthly':
                next.setMonth(next.getMonth() + 1);
                break;
            default:
                next.setDate(next.getDate() + 7);
        }
        next.setHours(0, 0, 0, 0);
        return next;
    }

    async createWebhook(input: {
        workspaceId: string;
        url: string;
        events: string[];
        secret?: string;
    }): Promise<SecurityWebhook> {
        const webhook = this.webhookRepo.create({
            workspaceId: input.workspaceId,
            url: input.url,
            events: input.events,
            secret: input.secret || null,
            enabled: true,
        });
        return this.webhookRepo.save(webhook);
    }

    async listWebhooks(workspaceId: string): Promise<SecurityWebhook[]> {
        return this.webhookRepo.find({
            where: { workspaceId },
            order: { createdAt: 'DESC' },
        });
    }

    async deleteWebhook(webhookId: string): Promise<void> {
        await this.webhookRepo.delete(webhookId);
    }

    async toggleWebhook(webhookId: string, enabled: boolean): Promise<void> {
        await this.webhookRepo.update(webhookId, { enabled });
    }

    async notify(event: string, data: any): Promise<void> {
        const webhooks = await this.webhookRepo.find({
            where: { enabled: true },
        });

        for (const webhook of webhooks) {
            if (!webhook.events.includes(event)) continue;

            try {
                const payload = JSON.stringify({
                    event,
                    timestamp: new Date().toISOString(),
                    data,
                });

                await fetch(webhook.url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(webhook.secret ? { 'X-Webhook-Secret': webhook.secret } : {}),
                    },
                    body: payload,
                });
            } catch (e) {
                console.error(`Failed to notify webhook ${webhook.id}:`, e);
            }
        }
    }
}