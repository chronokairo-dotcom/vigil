import { describe, expect, it } from 'vitest';
import { ApprovalFlow } from '../approvalFlow';

describe('ApprovalFlow', () => {
    it('lists requests by status and postpones pending approvals', () => {
        const flow = new ApprovalFlow();

        flow.request({
            id: 'req-1',
            actionType: 'proactive-task',
            description: 'Sensitive task',
            requestedBy: 'planner',
            ttlMs: 10_000,
        });

        const before = flow.get('req-1');
        expect(before?.status).toBe('pending');

        const postponed = flow.postpone('req-1', 'operator', 20_000);
        expect(postponed.status).toBe('pending');
        expect(postponed.expiresAt.getTime()).toBeGreaterThan((before?.expiresAt.getTime() || 0) - 1);

        const pending = flow.list('pending');
        expect(pending).toHaveLength(1);
        expect(pending[0].id).toBe('req-1');

        flow.approve('req-1', 'operator');
        expect(flow.list('approved')).toHaveLength(1);
        expect(flow.list('pending')).toHaveLength(0);
    });
});
