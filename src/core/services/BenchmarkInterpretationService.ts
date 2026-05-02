import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import { CliInferenceService, type LlmCliProvider } from '../llm-cli';
import { ModelBenchmarkService, type BenchmarkReport } from './ModelBenchmarkService';
import { MetricsService } from './MetricsService';

const taskTypeSchema = z.enum([
    'summarization',
    'enrichment',
    'reranking',
    'proactive-planning',
    'sleep-cycle',
    'code-task',
    'deep-analysis',
    'general',
]);

    const routingRuleSchema = z.object({
        taskType: taskTypeSchema,
        preferredProvider: z.enum(['gemini', 'claude', 'copilot', 'codex', 'opencode']),
        fallbackProviders: z.array(z.enum(['gemini', 'claude', 'copilot', 'codex', 'opencode'])).max(4),
        rationale: z.string().min(1),
        confidence: z.number().min(0).max(1),
    });

const interpretationSchema = z.object({
    modelExplanations: z.array(z.object({
        modelId: z.string().min(1),
        strengths: z.array(z.string().min(1)).max(6),
        weaknesses: z.array(z.string().min(1)).max(6),
        bestUseCases: z.array(z.string().min(1)).max(8),
    })).max(20),
    routingPolicy: z.array(routingRuleSchema).max(20),
    summary: z.string().min(1),
});

export type BenchmarkRoutingTaskType = z.infer<typeof taskTypeSchema>;
export type RoutingRule = z.infer<typeof routingRuleSchema>;
export type BenchmarkInterpretation = z.infer<typeof interpretationSchema>;

export interface BenchmarkInterpretationResult {
    generatedAt: string;
    provider: string;
    command: string;
    exitCode: number | null;
    period: 'hour' | 'day' | 'week';
    benchmark: BenchmarkReport;
    interpretation: BenchmarkInterpretation;
    outputFile: string;
}

export interface BenchmarkInterpretationServiceOptions {
    preferredProvider?: LlmCliProvider;
    fallbackProviders?: LlmCliProvider[];
    dataDir?: string;
}

export class BenchmarkInterpretationService {
    private static instance: BenchmarkInterpretationService | null = null;

    private readonly preferredProvider: LlmCliProvider;
    private readonly fallbackProviders: LlmCliProvider[];
    private readonly dataDir: string;
    private latest: BenchmarkInterpretationResult | null = null;

    constructor(
        private readonly inference: Pick<CliInferenceService, 'executePrompt'> = new CliInferenceService(),
        private readonly benchmarkService: Pick<ModelBenchmarkService, 'generateReport'> = ModelBenchmarkService.getInstance(MetricsService.getInstance()),
        options: BenchmarkInterpretationServiceOptions = {},
    ) {
        this.preferredProvider = options.preferredProvider ?? 'gemini';
        this.fallbackProviders = options.fallbackProviders ?? ['claude', 'copilot', 'codex', 'opencode'];
        this.dataDir = options.dataDir ?? path.join(process.cwd(), 'data', 'benchmark-interpretation');
    }

    static getInstance(options?: BenchmarkInterpretationServiceOptions): BenchmarkInterpretationService {
        if (!BenchmarkInterpretationService.instance) {
            BenchmarkInterpretationService.instance = new BenchmarkInterpretationService(undefined, undefined, options);
        }
        return BenchmarkInterpretationService.instance;
    }

    getLatest(): BenchmarkInterpretationResult | null {
        return this.latest;
    }

    async run(period: 'hour' | 'day' | 'week' = 'day'): Promise<BenchmarkInterpretationResult> {
        const benchmark = this.benchmarkService.generateReport(period);
        const prompt = this.buildPrompt(benchmark, period);

        const result = await this.inference.executePrompt({
            prompt,
            preferredProvider: this.preferredProvider,
            fallbackProviders: this.fallbackProviders,
        });

        const interpretation = this.parseOutput(result.rawText || result.stdout || '', benchmark);
        const generatedAt = new Date().toISOString();
        const outputFile = await this.persistResult({
            generatedAt,
            provider: result.provider,
            command: result.command,
            exitCode: result.exitCode,
            period,
            benchmark,
            interpretation,
        });

        const payload: BenchmarkInterpretationResult = {
            generatedAt,
            provider: result.provider,
            command: result.command,
            exitCode: result.exitCode,
            period,
            benchmark,
            interpretation,
            outputFile,
        };

        this.latest = payload;
        return payload;
    }

    async getLatestOrRun(period: 'hour' | 'day' | 'week' = 'day'): Promise<BenchmarkInterpretationResult> {
        if (this.latest && this.latest.period === period) {
            return this.latest;
        }
        return this.run(period);
    }

    async recommendForObjective(objective: string): Promise<RoutingRule | null> {
        const latest = await this.getLatestOrRun('day');
        const taskType = this.classifyTaskType(objective);
        const direct = latest.interpretation.routingPolicy.find((item) => item.taskType === taskType);
        if (direct) return direct;
        return latest.interpretation.routingPolicy.find((item) => item.taskType === 'general') ?? null;
    }

    classifyTaskType(objective: string): BenchmarkRoutingTaskType {
        const text = objective.toLowerCase();
        if (/summar|resumo|synthesize/.test(text)) return 'summarization';
        if (/enrich|tag|classif/.test(text)) return 'enrichment';
        if (/rerank|recall|context/.test(text)) return 'reranking';
        if (/proactive|risk|opportunit|plan/.test(text)) return 'proactive-planning';
        if (/sleep|daily|consolidat|facts/.test(text)) return 'sleep-cycle';
        if (/code|refactor|implement|bug|fix/.test(text)) return 'code-task';
        if (/analysis|deep|investig|diagnos/.test(text)) return 'deep-analysis';
        return 'general';
    }

    private buildPrompt(report: BenchmarkReport, period: 'hour' | 'day' | 'week'): string {
        return [
            'You are a benchmark interpretation engine for multi-provider LLM routing.',
            'Return ONLY one JSON object with this exact schema:',
            '{"modelExplanations":[{"modelId":"...","strengths":["..."],"weaknesses":["..."],"bestUseCases":["..."]}],"routingPolicy":[{"taskType":"summarization|enrichment|reranking|proactive-planning|sleep-cycle|code-task|deep-analysis|general","preferredProvider":"gemini|claude|copilot|codex","fallbackProviders":["gemini|claude|copilot|codex"],"rationale":"...","confidence":0.0}],"summary":"..."}',
            'Rules:',
            '- Keep confidence between 0 and 1.',
            '- Use concise rationale grounded in benchmark data.',
            '- Include a general fallback routingPolicy entry.',
            '',
            `PERIOD=${period}`,
            `BENCHMARK=${JSON.stringify(report)}`,
        ].join('\n');
    }

    private parseOutput(raw: string, report: BenchmarkReport): BenchmarkInterpretation {
        const candidate = this.extractJson(raw);
        if (candidate) {
            try {
                const parsed = JSON.parse(candidate);
                const validated = interpretationSchema.safeParse(parsed);
                if (validated.success) {
                    return validated.data;
                }
            } catch {
                // fallback below
            }
        }

        const defaultProvider = this.mapModelToProvider(report.bestModel.bySuccessRate);
        return {
            modelExplanations: report.models.map((item) => ({
                modelId: item.id,
                strengths: [`Success rate ${item.metrics.successRate.toFixed(1)}%`],
                weaknesses: [`Avg duration ${(item.metrics.avgDuration / 1000).toFixed(2)}s`],
                bestUseCases: ['general'],
            })),
            routingPolicy: [
                {
                    taskType: 'general',
                    preferredProvider: defaultProvider,
                    fallbackProviders: this.defaultFallback(defaultProvider),
                    rationale: 'Fallback policy derived from quantitative benchmark winner.',
                    confidence: 0.65,
                },
            ],
            summary: 'Fallback interpretation generated from quantitative report due to invalid model output.',
        };
    }

    private extractJson(raw: string): string | null {
        const fenced = raw.match(/```json\s*([\s\S]*?)\s*```/i);
        if (fenced?.[1]) return fenced[1].trim();

        const first = raw.indexOf('{');
        const last = raw.lastIndexOf('}');
        if (first === -1 || last <= first) return null;
        return raw.slice(first, last + 1).trim();
    }

    private mapModelToProvider(modelId: string): LlmCliProvider {
        const id = String(modelId || '').toLowerCase();
        if (id.includes('claude')) return 'claude';
        if (id.includes('copilot')) return 'copilot';
        if (id.includes('codex')) return 'codex';
        return 'gemini';
    }

    private defaultFallback(preferred: LlmCliProvider): LlmCliProvider[] {
        const ordered: LlmCliProvider[] = ['gemini', 'claude', 'copilot', 'codex'];
        return ordered.filter((item) => item !== preferred);
    }

    private async persistResult(payload: Omit<BenchmarkInterpretationResult, 'outputFile'>): Promise<string> {
        const day = payload.generatedAt.slice(0, 10);
        const dayDir = path.join(this.dataDir, day);
        await fs.mkdir(dayDir, { recursive: true });

        const stamp = payload.generatedAt.replace(/[:.]/g, '-');
        const outputFile = path.join(dayDir, `benchmark-interpretation-${stamp}.json`);
        await fs.writeFile(outputFile, JSON.stringify(payload, null, 2), 'utf8');

        const policyFile = path.join(this.dataDir, 'current-routing-policy.json');
        await fs.writeFile(policyFile, JSON.stringify({
            generatedAt: payload.generatedAt,
            period: payload.period,
            routingPolicy: payload.interpretation.routingPolicy,
            summary: payload.interpretation.summary,
        }, null, 2), 'utf8');

        return outputFile;
    }
}
