import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import { CliInferenceService, type LlmCliProvider } from '../llm-cli';
import { MetricsService, type MetricsSnapshot } from './MetricsService';
import { ModelBenchmarkService, type BenchmarkReport } from './ModelBenchmarkService';
import { Logger } from '../utils/Logger';

const optimizationSchema = z.object({
    configImprovements: z.array(z.object({
        title: z.string().min(1),
        settingKey: z.string().min(1),
        proposedValue: z.string().min(1),
        rationale: z.string().min(1),
        expectedImpact: z.string().min(1),
    })).max(20),
    policyChanges: z.array(z.object({
        title: z.string().min(1),
        policyArea: z.string().min(1),
        change: z.string().min(1),
        rationale: z.string().min(1),
        riskLevel: z.enum(['low', 'medium', 'high']),
    })).max(20),
    routingChanges: z.array(z.object({
        taskType: z.string().min(1),
        recommendedProvider: z.enum(['gemini', 'claude', 'copilot', 'codex']),
        rationale: z.string().min(1),
        confidence: z.number().min(0).max(1),
    })).max(20),
});

export type SelfOptimizationPlan = z.infer<typeof optimizationSchema>;

export interface OptimizationSuggestion {
    id: string;
    category: 'config' | 'policy' | 'routing';
    title: string;
    summary: string;
    status: 'pending' | 'accepted' | 'rejected';
    createdAt: string;
}

export interface OptimizationDecision {
    suggestionId: string;
    decision: 'accepted' | 'rejected';
    reason?: string;
    actor: string;
    timestamp: string;
}

export interface SelfOptimizationRunResult {
    generatedAt: string;
    provider: string;
    command: string;
    exitCode: number | null;
    metricsSnapshot: MetricsSnapshot;
    benchmarkReport: BenchmarkReport;
    plan: SelfOptimizationPlan;
    suggestions: OptimizationSuggestion[];
    outputFile: string;
}

export interface SelfOptimizationServiceOptions {
    preferredProvider?: LlmCliProvider;
    fallbackProviders?: LlmCliProvider[];
    intervalMs?: number;
    dataDir?: string;
}

export class SelfOptimizationService {
    private static instance: SelfOptimizationService | null = null;

    private readonly logger = Logger.getInstance('SelfOptimizationService');
    private readonly preferredProvider: LlmCliProvider;
    private readonly fallbackProviders: LlmCliProvider[];
    private readonly intervalMs: number;
    private readonly dataDir: string;

    private latest: SelfOptimizationRunResult | null = null;
    private timer: ReturnType<typeof setInterval> | null = null;

    constructor(
        private readonly inference: Pick<CliInferenceService, 'executePrompt'> = new CliInferenceService(),
        private readonly metricsService: Pick<MetricsService, 'getMetrics'> = MetricsService.getInstance(),
        private readonly benchmarkService: Pick<ModelBenchmarkService, 'generateReport'> = ModelBenchmarkService.getInstance(MetricsService.getInstance()),
        options: SelfOptimizationServiceOptions = {},
    ) {
        this.preferredProvider = options.preferredProvider ?? 'gemini';
        this.fallbackProviders = options.fallbackProviders ?? ['claude', 'copilot', 'codex'];
        this.intervalMs = Math.max(60_000, options.intervalMs ?? 10 * 60_000);
        this.dataDir = options.dataDir ?? path.join(process.cwd(), 'data', 'self-optimization');
    }

    static getInstance(options?: SelfOptimizationServiceOptions): SelfOptimizationService {
        if (!SelfOptimizationService.instance) {
            SelfOptimizationService.instance = new SelfOptimizationService(undefined, undefined, undefined, options);
        }
        return SelfOptimizationService.instance;
    }

    async start(): Promise<void> {
        if (this.timer) return;
        await this.runNow();

        this.timer = setInterval(() => {
            void this.runNow().catch((error: unknown) => {
                const message = error instanceof Error ? error.message : String(error);
                this.logger.warn(`Periodic self-optimization failed: ${message}`);
            });
        }, this.intervalMs);

        this.logger.info(`Self-optimization started with interval ${this.intervalMs}ms`);
    }

    stop(): void {
        if (!this.timer) return;
        clearInterval(this.timer);
        this.timer = null;
        this.logger.info('Self-optimization stopped');
    }

    getLatestRun(): SelfOptimizationRunResult | null {
        return this.latest;
    }

    async runNow(): Promise<SelfOptimizationRunResult> {
        const metricsSnapshot = this.metricsService.getMetrics('day');
        const benchmarkReport = this.benchmarkService.generateReport('day');
        const prompt = this.buildPrompt(metricsSnapshot, benchmarkReport);

        const result = await this.inference.executePrompt({
            prompt,
            preferredProvider: this.preferredProvider,
            fallbackProviders: this.fallbackProviders,
        });

        const plan = this.parseOutput(result.rawText || result.stdout || '');
        const generatedAt = new Date().toISOString();
        const suggestions = this.buildSuggestions(plan, generatedAt);
        const outputFile = await this.persistRun({
            generatedAt,
            provider: result.provider,
            command: result.command,
            exitCode: result.exitCode,
            metricsSnapshot,
            benchmarkReport,
            plan,
            suggestions,
        });

        const run: SelfOptimizationRunResult = {
            generatedAt,
            provider: result.provider,
            command: result.command,
            exitCode: result.exitCode,
            metricsSnapshot,
            benchmarkReport,
            plan,
            suggestions,
            outputFile,
        };

        this.latest = run;
        return run;
    }

    async recordDecision(input: { suggestionId: string; decision: 'accepted' | 'rejected'; reason?: string; actor: string }): Promise<OptimizationDecision> {
        const latest = this.latest;
        if (!latest) {
            throw new Error('No optimization run available to register decision');
        }

        const suggestion = latest.suggestions.find((item) => item.id === input.suggestionId);
        if (!suggestion) {
            throw new Error(`Suggestion not found: ${input.suggestionId}`);
        }

        suggestion.status = input.decision;
        const decision: OptimizationDecision = {
            suggestionId: input.suggestionId,
            decision: input.decision,
            reason: input.reason,
            actor: input.actor,
            timestamp: new Date().toISOString(),
        };

        await fs.mkdir(this.dataDir, { recursive: true });
        const logFile = path.join(this.dataDir, 'decisions.log');
        await fs.appendFile(logFile, JSON.stringify(decision) + '\n', 'utf8');
        return decision;
    }

    async getDecisionHistory(limit: number = 100): Promise<OptimizationDecision[]> {
        const safeLimit = Math.max(1, Math.min(limit, 500));
        const logFile = path.join(this.dataDir, 'decisions.log');

        try {
            const raw = await fs.readFile(logFile, 'utf8');
            const rows = raw
                .split(/\r?\n/)
                .filter(Boolean)
                .map((line) => JSON.parse(line) as OptimizationDecision)
                .reverse();
            return rows.slice(0, safeLimit);
        } catch {
            return [];
        }
    }

    private buildPrompt(metrics: MetricsSnapshot, benchmark: BenchmarkReport): string {
        return [
            'You are a self-optimization engine for an autonomous coding platform.',
            'Return ONLY one JSON object using this exact schema:',
            '{"configImprovements":[{"title":"...","settingKey":"...","proposedValue":"...","rationale":"...","expectedImpact":"..."}],"policyChanges":[{"title":"...","policyArea":"...","change":"...","rationale":"...","riskLevel":"low|medium|high"}],"routingChanges":[{"taskType":"...","recommendedProvider":"gemini|claude|copilot|codex","rationale":"...","confidence":0.0}]}',
            'Rules:',
            '- Focus on actionable suggestions with measurable outcomes.',
            '- Keep confidence between 0 and 1.',
            '- If data is insufficient, return short conservative suggestions.',
            '',
            `METRICS_DAY=${JSON.stringify(metrics)}`,
            `BENCHMARK_DAY=${JSON.stringify(benchmark)}`,
        ].join('\n');
    }

    private parseOutput(raw: string): SelfOptimizationPlan {
        const candidate = this.extractJson(raw);
        if (!candidate) {
            return this.fallbackPlan('Model output did not contain valid JSON');
        }

        try {
            const parsed = JSON.parse(candidate);
            const validated = optimizationSchema.safeParse(parsed);
            if (validated.success) {
                return validated.data;
            }
        } catch {
            // fallback
        }

        return this.fallbackPlan('Model output failed schema validation');
    }

    private extractJson(raw: string): string | null {
        const fenced = raw.match(/```json\s*([\s\S]*?)\s*```/i);
        if (fenced?.[1]) return fenced[1].trim();

        const first = raw.indexOf('{');
        const last = raw.lastIndexOf('}');
        if (first === -1 || last <= first) return null;
        return raw.slice(first, last + 1).trim();
    }

    private fallbackPlan(reason: string): SelfOptimizationPlan {
        return {
            configImprovements: [{
                title: 'Conservative monitoring mode',
                settingKey: 'selfOptimization.intervalMs',
                proposedValue: '900000',
                rationale: reason,
                expectedImpact: 'Safer periodic analysis while data quality improves.',
            }],
            policyChanges: [],
            routingChanges: [],
        };
    }

    private buildSuggestions(plan: SelfOptimizationPlan, generatedAt: string): OptimizationSuggestion[] {
        const suggestions: OptimizationSuggestion[] = [];

        for (const item of plan.configImprovements) {
            suggestions.push({
                id: `cfg-${this.slug(item.settingKey)}-${suggestions.length + 1}`,
                category: 'config',
                title: item.title,
                summary: `${item.settingKey} -> ${item.proposedValue}. ${item.expectedImpact}`,
                status: 'pending',
                createdAt: generatedAt,
            });
        }

        for (const item of plan.policyChanges) {
            suggestions.push({
                id: `pol-${this.slug(item.policyArea)}-${suggestions.length + 1}`,
                category: 'policy',
                title: item.title,
                summary: `${item.change} (${item.riskLevel}). ${item.rationale}`,
                status: 'pending',
                createdAt: generatedAt,
            });
        }

        for (const item of plan.routingChanges) {
            suggestions.push({
                id: `rt-${this.slug(item.taskType)}-${suggestions.length + 1}`,
                category: 'routing',
                title: `Routing for ${item.taskType}`,
                summary: `Prefer ${item.recommendedProvider} (confidence ${(item.confidence * 100).toFixed(0)}%). ${item.rationale}`,
                status: 'pending',
                createdAt: generatedAt,
            });
        }

        return suggestions.slice(0, 50);
    }

    private slug(value: string): string {
        return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }

    private async persistRun(payload: Omit<SelfOptimizationRunResult, 'outputFile'>): Promise<string> {
        const dateKey = new Date(payload.generatedAt).toISOString().slice(0, 10);
        const dayDir = path.join(this.dataDir, dateKey);
        await fs.mkdir(dayDir, { recursive: true });

        const stamp = payload.generatedAt.replace(/[:.]/g, '-');
        const outputFile = path.join(dayDir, `self-optimization-${stamp}.json`);
        await fs.writeFile(outputFile, JSON.stringify(payload, null, 2), 'utf8');
        return outputFile;
    }
}
