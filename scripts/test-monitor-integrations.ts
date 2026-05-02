#!/usr/bin/env node

/*
 * Smoke test for Monitor/Painel integrations used by src/screens/Dashboard.tsx.
 * Executes route handlers directly and validates response envelopes/essential fields.
 */

import { GET as healthGet } from '@/app/api/health/route';
import { GET as metricsGet } from '@/app/api/v1/metrics/route';
import { GET as historyGet } from '@/app/api/chat/history/route';
import { GET as agentsStatsGet } from '@/app/api/v1/agents/stats/route';
import { GET as workflowsStatsGet } from '@/app/api/v1/workflows/stats/route';
import { GET as proactiveGet, POST as proactivePost } from '@/app/api/v1/proactive/insights/route';
import { GET as runsGet } from '@/app/api/v1/orchestrator/runs/route';

type JsonObject = Record<string, unknown>;

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message);
    }
}

async function readJson(response: Response): Promise<JsonObject> {
    const payload = (await response.json()) as JsonObject;
    return payload;
}

function request(url: string, init?: RequestInit): Request {
    return new Request(url, {
        headers: {
            'x-workspace-id': 'system',
            ...(init?.headers ?? {}),
        },
        ...init,
    });
}

async function runCheck(name: string, testFn: () => Promise<void>): Promise<void> {
    try {
        await testFn();
        console.log(`[PASS] ${name}`);
    } catch (error) {
        console.error(`[FAIL] ${name}:`, error instanceof Error ? error.message : String(error));
        throw error;
    }
}

async function main() {
    const checks: Array<() => Promise<void>> = [
        () => runCheck('health integration', async () => {
            const res = await healthGet();
            assert(res.ok, `Expected 2xx, got ${res.status}`);
            const payload = await readJson(res);
            assert(typeof payload.status === 'string', 'health.status must be string');
            assert(typeof payload.timestamp === 'string', 'health.timestamp must be string');
            assert(typeof payload.checks === 'object', 'health.checks must exist');
        }),
        () => runCheck('metrics integration', async () => {
            const res = await metricsGet();
            assert(res.ok, `Expected 2xx, got ${res.status}`);
            const payload = await readJson(res);
            const data = (payload.data ?? payload) as JsonObject;
            assert(typeof data.uptime === 'string', 'metrics.uptime must be string');
            assert(typeof data.memory === 'string', 'metrics.memory must be string');
            assert(typeof data.loadAvg === 'string', 'metrics.loadAvg must be string');
            assert(typeof data.threads === 'number', 'metrics.threads must be number');
        }),
        () => runCheck('chat history integration', async () => {
            const res = await historyGet(request('http://localhost/api/chat/history?limit=3') as any);
            assert(res.ok, `Expected 2xx, got ${res.status}`);
            const payload = await readJson(res);
            const data = (payload.data ?? payload) as JsonObject;
            assert(Array.isArray(data.items), 'history.items must be array');
            assert(typeof data.total === 'number', 'history.total must be number');
        }),
        () => runCheck('agents stats integration', async () => {
            const res = await agentsStatsGet(request('http://localhost/api/v1/agents/stats') as any);
            assert(res.ok, `Expected 2xx, got ${res.status}`);
            const payload = await readJson(res);
            const data = (payload.data ?? payload) as JsonObject;
            assert(typeof data.totalAgents === 'number', 'agents.totalAgents must be number');
            assert(typeof data.activeAgents === 'number', 'agents.activeAgents must be number');
        }),
        () => runCheck('workflows stats integration', async () => {
            const res = await workflowsStatsGet();
            assert(res.ok, `Expected 2xx, got ${res.status}`);
            const payload = await readJson(res);
            const data = (payload.data ?? payload) as JsonObject;
            assert(typeof data.total === 'number', 'workflows.total must be number');
            assert(typeof data.totalExecutions === 'number', 'workflows.totalExecutions must be number');
            assert(typeof data.successRate === 'number', 'workflows.successRate must be number');
        }),
        () => runCheck('proactive insights integration (GET)', async () => {
            const res = await proactiveGet(request('http://localhost/api/v1/proactive/insights') as any);
            assert(res.ok, `Expected 2xx, got ${res.status}`);
            const payload = await readJson(res);
            const data = (payload.data ?? payload) as JsonObject;
            assert(typeof data.generatedAt === 'string', 'proactive.generatedAt must be string');
            assert(typeof data.provider === 'string', 'proactive.provider must be string');
            assert(Array.isArray(data.pendingApprovals), 'proactive.pendingApprovals must be array');
        }),
        () => runCheck('proactive insights integration (POST refresh)', async () => {
            const res = await proactivePost(request('http://localhost/api/v1/proactive/insights', {
                method: 'POST',
                body: JSON.stringify({ action: 'refresh' }),
                headers: {
                    'content-type': 'application/json',
                },
            }) as any);
            assert(res.ok, `Expected 2xx, got ${res.status}`);
            const payload = await readJson(res);
            const data = (payload.data ?? payload) as JsonObject;
            assert(typeof data.refreshedAt === 'string', 'proactive.refresh.refreshedAt must be string');
        }),
        () => runCheck('orchestrator runs integration', async () => {
            const res = await runsGet(request('http://localhost/api/v1/orchestrator/runs?limit=20&workspaceId=system') as any);
            assert(res.ok, `Expected 2xx, got ${res.status}`);
            const payload = await readJson(res);
            const data = (payload.data ?? payload) as JsonObject;
            assert(Array.isArray(data.items), 'runs.items must be array');
            assert(typeof data.total === 'number', 'runs.total must be number');
        }),
    ];

    for (const check of checks) {
        await check();
    }

    console.log('\nAll monitor integration checks passed.');
    process.exit(0);
}

main().catch((error) => {
    console.error('\nMonitor integration checks failed.');
    console.error(error instanceof Error ? error.stack : String(error));
    process.exit(1);
});
