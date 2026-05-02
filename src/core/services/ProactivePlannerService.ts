import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import { CliInferenceService, type LlmCliProvider } from '../llm-cli';
import { memoryManager, type EnrichedMemoryEntry } from '../../memory';
import { ApprovalFlow } from '../../policies/approvalFlow';
import { Logger } from '../utils/Logger';

const proactivePlanSchema = z.object({
    risks: z.array(z.object({
        title: z.string().min(1),
        severity: z.enum(['low', 'medium', 'high', 'critical']),
        evidence: z.string().min(1),
        recommendedAction: z.string().min(1),
    })).max(20),
    opportunities: z.array(z.object({
        title: z.string().min(1),
        impact: z.enum(['low', 'medium', 'high']),
        evidence: z.string().min(1),
        suggestedAction: z.string().min(1),
    })).max(20),
    taskCandidates: z.array(z.object({
        title: z.string().min(1),
        description: z.string().min(1),
        priority: z.enum(['low', 'medium', 'high']),
        rationale: z.string().min(1),
        sensitivity: z.enum(['low', 'medium', 'high']),
        requiresApproval: z.boolean().optional(),
    })).max(30),
    recommendations: z.array(z.object({
        title: z.string().min(1),
        rationale: z.string().min(1),
        action: z.string().min(1),
    })).max(30),
});

export type ProactivePlan = z.infer<typeof proactivePlanSchema>;

export interface ProactivePlannerServiceOptions {
    preferredProvider?: LlmCliProvider;
    fallbackProviders?: LlmCliProvider[];
    intervalMs?: number;
    recentWindowDays?: number;
    maxEvents?: number;
    dataDir?: string;
    requireApprovalForSensitiveTasks?: boolean;
    approvalRequester?: string;
    approvalFlow?: ApprovalFlow;
    onPlanGenerated?: (result: ProactivePlannerRunResult) => void | Promise<void>;
}

export interface ProactivePlannerRunResult {
    projectId: string;
    generatedAt: string;
    provider: string;
    command: string;
    exitCode: number | null;
    inputEvents: number;
    plan: ProactivePlan;
    pendingApprovals: Array<{
        requestId: string;
        taskTitle: string;
        reason: string;
    }>;
    outputFile: string;
}

export class ProactivePlannerService {
    private static instance: ProactivePlannerService | null = null;

    private readonly logger = Logger.getInstance('ProactivePlannerService');
    private readonly preferredProvider: LlmCliProvider;
    private readonly fallbackProviders: LlmCliProvider[];
    private readonly intervalMs: number;
    private readonly recentWindowDays: number;
    private readonly maxEvents: number;
    private readonly dataDir: string;
    private readonly requireApprovalForSensitiveTasks: boolean;
    private readonly approvalRequester: string;
    private readonly approvalFlow?: ApprovalFlow;
    private readonly onPlanGenerated?: (result: ProactivePlannerRunResult) => void | Promise<void>;

    private timer: ReturnType<typeof setInterval> | null = null;
    private latestPlan: ProactivePlannerRunResult | null = null;

    constructor(
        private readonly inference = new CliInferenceService(),
        options: ProactivePlannerServiceOptions = {},
    ) {
        this.preferredProvider = options.preferredProvider ?? 'gemini';
        this.fallbackProviders = options.fallbackProviders ?? ['claude', 'copilot', 'codex'];
        this.intervalMs = Math.max(30_000, options.intervalMs ?? 5 * 60_000);
        this.recentWindowDays = Math.max(1, options.recentWindowDays ?? 2);
        this.maxEvents = Math.max(20, options.maxEvents ?? 200);
        this.dataDir = options.dataDir ?? path.join(process.cwd(), 'data', 'proactive');
        this.requireApprovalForSensitiveTasks = options.requireApprovalForSensitiveTasks ?? true;
        this.approvalRequester = options.approvalRequester ?? 'proactive-planner';
        this.approvalFlow = options.approvalFlow;
        this.onPlanGenerated = options.onPlanGenerated;
    }

    static getInstance(options?: ProactivePlannerServiceOptions): ProactivePlannerService {
        if (!ProactivePlannerService.instance) {
            ProactivePlannerService.instance = new ProactivePlannerService(undefined, options);
        }
        return ProactivePlannerService.instance;
    }

    async start(projectId: string = 'system'): Promise<void> {
        if (this.timer) return;

        await this.runNow(projectId);
        this.timer = setInterval(() => {
            void this.runNow(projectId).catch((error: unknown) => {
                const message = error instanceof Error ? error.message : String(error);
                this.logger.warn(`Periodic proactive planning failed: ${message}`);
            });
        }, this.intervalMs);

        this.logger.info(`Proactive planner started with interval ${this.intervalMs}ms`);
    }

    stop(): void {
        if (!this.timer) return;
        clearInterval(this.timer);
        this.timer = null;
        this.logger.info('Proactive planner stopped');
    }

    getLatestPlan(): ProactivePlannerRunResult | null {
        return this.latestPlan;
    }

    async runNow(projectId: string = 'system'): Promise<ProactivePlannerRunResult> {
        const events = await this.loadRecentEnrichedEvents();
        const prompt = this.buildPrompt(projectId, events);

        const result = await this.inference.executePrompt({
            prompt,
            preferredProvider: this.preferredProvider,
            fallbackProviders: this.fallbackProviders,
        });

        const parsedPlan = this.parseModelOutput(result.rawText || result.stdout || '');
        const pendingApprovals = this.routeTaskApprovals(parsedPlan.taskCandidates);
        const generatedAt = new Date().toISOString();
        const outputFile = await this.persistRun(projectId, {
            generatedAt,
            provider: result.provider,
            command: result.command,
            exitCode: result.exitCode,
            inputEvents: events.length,
            plan: parsedPlan,
            pendingApprovals,
        });

        const runResult: ProactivePlannerRunResult = {
            projectId,
            generatedAt,
            provider: result.provider,
            command: result.command,
            exitCode: result.exitCode,
            inputEvents: events.length,
            plan: parsedPlan,
            pendingApprovals,
            outputFile,
        };

        this.latestPlan = runResult;
        await this.onPlanGenerated?.(runResult);
        return runResult;
    }

    private async loadRecentEnrichedEvents(): Promise<EnrichedMemoryEntry[]> {
        const now = new Date();
        const all: EnrichedMemoryEntry[] = [];

        for (let i = 0; i < this.recentWindowDays; i += 1) {
            const date = new Date(now);
            date.setDate(now.getDate() - i);
            const dateKey = date.toISOString().slice(0, 10);
            const entries = await memoryManager.readEnrichedLog(dateKey);
            all.push(...entries);
        }

        return all
            .sort((a, b) => new Date(String(b.raw.timestamp)).getTime() - new Date(String(a.raw.timestamp)).getTime())
            .slice(0, this.maxEvents);
    }

    private buildPrompt(projectId: string, events: EnrichedMemoryEntry[]): string {
        const compactEvents = events.map((entry) => ({
            id: entry.raw.id,
            source: entry.raw.source,
            timestamp: new Date(String(entry.raw.timestamp)).toISOString(),
            content: entry.raw.content.slice(0, 500),
            classification: entry.enriched.classification,
            relevance: entry.enriched.relevance,
            tags: entry.enriched.tags.slice(0, 8),
            suggestedAction: entry.enriched.suggestedAction,
        }));

        return [
            'You are a proactive planning engine for an autonomous engineering assistant.',
            'Analyze recent enriched events and produce ONLY one JSON object in the exact schema below.',
            '{"risks":[{"title":"...","severity":"low|medium|high|critical","evidence":"...","recommendedAction":"..."}],"opportunities":[{"title":"...","impact":"low|medium|high","evidence":"...","suggestedAction":"..."}],"taskCandidates":[{"title":"...","description":"...","priority":"low|medium|high","rationale":"...","sensitivity":"low|medium|high","requiresApproval":false}],"recommendations":[{"title":"...","rationale":"...","action":"..."}]}',
            'Rules:',
            '- Keep output concise, concrete, and implementation-oriented.',
            '- Include at most 10 items per array.',
            '- Mark requiresApproval=true for potentially sensitive tasks.',
            '- Use sensitivity=high only for tasks touching secrets, auth, permissions, or destructive actions.',
            '',
            `PROJECT_ID=${projectId}`,
            `EVENTS=${JSON.stringify(compactEvents)}`,
        ].join('\n');
    }

    private parseModelOutput(rawText: string): ProactivePlan {
        const candidate = this.extractJsonObject(rawText);
        if (!candidate) {
            return this.fallbackPlan('Model output did not contain JSON');
        }

        try {
            const parsed = JSON.parse(candidate);
            const validated = proactivePlanSchema.safeParse(parsed);
            if (validated.success) {
                return validated.data;
            }
        } catch {
            // fallback below
        }

        return this.fallbackPlan('Model output failed schema validation');
    }

    private extractJsonObject(rawText: string): string | null {
        const fenced = rawText.match(/```json\s*([\s\S]*?)\s*```/i);
        if (fenced?.[1]) return fenced[1].trim();

        const first = rawText.indexOf('{');
        const last = rawText.lastIndexOf('}');
        if (first === -1 || last <= first) return null;
        return rawText.slice(first, last + 1).trim();
    }

    private fallbackPlan(reason: string): ProactivePlan {
        return {
            risks: [],
            opportunities: [],
            taskCandidates: [],
            recommendations: [{
                title: 'Manual review required',
                rationale: reason,
                action: 'Inspect recent enriched events and run planner again.',
            }],
        };
    }

    private routeTaskApprovals(tasks: ProactivePlan['taskCandidates']): Array<{ requestId: string; taskTitle: string; reason: string }> {
        const pendingApprovals: Array<{ requestId: string; taskTitle: string; reason: string }> = [];

        for (const task of tasks) {
            const needsApproval = this.requireApprovalForSensitiveTasks
                && (task.requiresApproval === true || task.sensitivity === 'high');
            if (!needsApproval) continue;

            const requestId = `proactive-task-${Date.now()}-${this.slug(task.title).slice(0, 30)}`;
            const reason = `Sensitive proactive task requires approval: ${task.title}`;

            if (this.approvalFlow) {
                const req = this.approvalFlow.request({
                    id: requestId,
                    actionType: 'proactive-task',
                    description: reason,
                    requestedBy: this.approvalRequester,
                });

                if (req.status !== 'approved') {
                    pendingApprovals.push({ requestId, taskTitle: task.title, reason });
                }
                continue;
            }

            pendingApprovals.push({ requestId, taskTitle: task.title, reason });
        }

        return pendingApprovals;
    }

    private slug(input: string): string {
        return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }

    private async persistRun(
        projectId: string,
        payload: Omit<ProactivePlannerRunResult, 'projectId' | 'outputFile'>,
    ): Promise<string> {
        const dateKey = new Date(payload.generatedAt).toISOString().slice(0, 10);
        const dayDir = path.join(this.dataDir, dateKey);
        await fs.mkdir(dayDir, { recursive: true });

        const safeProject = this.slug(projectId || 'system') || 'system';
        const stamp = payload.generatedAt.replace(/[:.]/g, '-');
        const outputFile = path.join(dayDir, `${safeProject}-${stamp}.json`);

        await fs.writeFile(outputFile, JSON.stringify({ projectId, ...payload }, null, 2), 'utf8');
        return outputFile;
    }
}
