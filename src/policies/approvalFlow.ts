import { Logger } from '../core/utils/Logger';

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired';

export interface ApprovalRequest {
    id: string;
    actionType: string;
    description: string;
    requestedBy: string;
    requestedAt: Date;
    expiresAt: Date;
    status: ApprovalStatus;
    resolvedBy?: string;
    resolvedAt?: Date;
    reason?: string;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * ApprovalFlow
 *
 * Manages approval requests for sensitive actions.
 * Requests expire after TTL if not resolved.
 */
export class ApprovalFlow {
    private requests = new Map<string, ApprovalRequest>();
    private logger = Logger.getInstance('ApprovalFlow');

    request(params: {
        id: string;
        actionType: string;
        description: string;
        requestedBy: string;
        ttlMs?: number;
    }): ApprovalRequest {
        const { id, actionType, description, requestedBy, ttlMs = DEFAULT_TTL_MS } = params;
        const req: ApprovalRequest = {
            id,
            actionType,
            description,
            requestedBy,
            requestedAt: new Date(),
            expiresAt: new Date(Date.now() + ttlMs),
            status: 'pending',
        };
        this.requests.set(id, req);
        this.logger.info(`Approval requested [${id}]: ${actionType} — ${description}`);
        return req;
    }

    approve(id: string, approvedBy: string): ApprovalRequest {
        return this.resolve(id, 'approved', approvedBy);
    }

    deny(id: string, deniedBy: string, reason?: string): ApprovalRequest {
        return this.resolve(id, 'denied', deniedBy, reason);
    }

    get(id: string): ApprovalRequest | undefined {
        const req = this.requests.get(id);
        if (req && req.status === 'pending' && Date.now() > req.expiresAt.getTime()) {
            req.status = 'expired';
            this.logger.warn(`Approval request expired: ${id}`);
        }
        return req;
    }

    isPending(id: string): boolean {
        return this.get(id)?.status === 'pending';
    }

    list(status?: ApprovalStatus): ApprovalRequest[] {
        const all = Array.from(this.requests.values()).map((req) => this.get(req.id) ?? req);
        if (!status) {
            return all.sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());
        }

        return all
            .filter((req) => req.status === status)
            .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());
    }

    postpone(id: string, by: string, ttlMs: number = DEFAULT_TTL_MS): ApprovalRequest {
        const req = this.requests.get(id);
        if (!req) throw new Error(`Approval request not found: ${id}`);
        if (req.status !== 'pending') throw new Error(`Cannot postpone non-pending request: ${id}`);
        req.expiresAt = new Date(Date.now() + Math.max(5_000, ttlMs));
        req.reason = `Postponed by ${by}`;
        this.logger.info(`Approval postponed [${id}] by ${by}`);
        return req;
    }

    private resolve(id: string, status: 'approved' | 'denied', by: string, reason?: string): ApprovalRequest {
        const req = this.requests.get(id);
        if (!req) throw new Error(`Approval request not found: ${id}`);
        if (req.status !== 'pending') throw new Error(`Approval request is already ${req.status}: ${id}`);
        req.status = status;
        req.resolvedBy = by;
        req.resolvedAt = new Date();
        req.reason = reason;
        this.logger.info(`Approval ${status} [${id}] by ${by}`);
        return req;
    }
}
