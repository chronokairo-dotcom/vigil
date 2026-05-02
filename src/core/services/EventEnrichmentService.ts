import { z } from 'zod';
import type { CliInferenceRequest, LlmCliProvider } from '../llm-cli';
import { CliInferenceService } from '../llm-cli';
import { memoryManager, type EnrichedMemoryEntry, type MemoryEntry } from '../../memory';

const enrichmentItemSchema = z.object({
    id: z.string().min(1),
    classification: z.string().min(1),
    tags: z.array(z.string().min(1)).max(12),
    relevance: z.number().min(0).max(1),
    entities: z.array(z.string().min(1)).max(12),
    suggestedAction: z.string().min(1),
});

const enrichmentBatchSchema = z.array(enrichmentItemSchema);

type EnrichmentItem = z.infer<typeof enrichmentItemSchema>;

export interface EventEnrichmentOptions {
    preferredProvider?: LlmCliProvider;
    fallbackProviders?: LlmCliProvider[];
    persist?: boolean;
}

export class EventEnrichmentService {
    constructor(
        private readonly inference = new CliInferenceService(),
    ) { }

    async enrichBatch(entries: MemoryEntry[], options: EventEnrichmentOptions = {}): Promise<EnrichedMemoryEntry[]> {
        if (!entries.length) return [];

        const prompt = this.buildPrompt(entries);
        const request: CliInferenceRequest = {
            prompt,
            preferredProvider: options.preferredProvider ?? 'gemini',
            fallbackProviders: options.fallbackProviders ?? ['claude', 'copilot', 'codex'],
        };

        const result = await this.inference.executePrompt(request);
        const modelItems = this.parseModelOutput(result.rawText || result.stdout || '');
        const byId = new Map(modelItems.map(item => [item.id, item]));

        const enriched = entries.map((entry) => {
            const item = byId.get(entry.id) ?? this.createFallbackItem(entry);
            return {
                raw: entry,
                enriched: {
                    classification: item.classification,
                    tags: item.tags,
                    relevance: this.clampRelevance(item.relevance),
                    entities: item.entities,
                    suggestedAction: item.suggestedAction,
                },
                inference: {
                    provider: result.provider,
                    command: result.command,
                    rawText: result.rawText,
                    exitCode: result.exitCode,
                },
                enrichedAt: new Date().toISOString(),
            } satisfies EnrichedMemoryEntry;
        });

        if (options.persist) {
            await memoryManager.appendEnrichedBatch(enriched);
        }

        return enriched;
    }

    private buildPrompt(entries: MemoryEntry[]): string {
        const payload = entries.map((entry) => ({
            id: entry.id,
            source: entry.source,
            projectId: entry.projectId ?? '',
            content: entry.content,
            timestamp: new Date(entry.timestamp).toISOString(),
        }));

        return [
            'You are an event enrichment engine.',
            'Classify each event and return ONLY a JSON array with one object per input event.',
            'Do not include markdown, comments, or extra text.',
            'Each object must follow this shape exactly:',
            '{"id":"...","classification":"...","tags":["..."],"relevance":0.0,"entities":["..."],"suggestedAction":"..."}',
            'Rules:',
            '- Keep relevance between 0 and 1.',
            '- Keep tags and entities concise and practical.',
            '- Keep suggestedAction short and actionable.',
            '',
            `INPUT_EVENTS=${JSON.stringify(payload)}`,
        ].join('\n');
    }

    private parseModelOutput(rawText: string): EnrichmentItem[] {
        const jsonCandidate = this.extractJsonCandidate(rawText);
        if (!jsonCandidate) {
            return [];
        }

        try {
            const parsed = JSON.parse(jsonCandidate);
            const validated = enrichmentBatchSchema.safeParse(parsed);
            if (!validated.success) {
                return [];
            }
            return validated.data;
        } catch {
            return [];
        }
    }

    private extractJsonCandidate(rawText: string): string | null {
        const fenced = rawText.match(/```json\s*([\s\S]*?)\s*```/i);
        if (fenced?.[1]) {
            return fenced[1].trim();
        }

        const firstBracket = rawText.indexOf('[');
        const lastBracket = rawText.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket > firstBracket) {
            return rawText.slice(firstBracket, lastBracket + 1).trim();
        }

        return null;
    }

    private createFallbackItem(entry: MemoryEntry): EnrichmentItem {
        const sourceTag = entry.source.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
        return {
            id: entry.id,
            classification: 'unclassified-event',
            tags: ['needs-review', sourceTag].filter(Boolean),
            relevance: 0.5,
            entities: entry.projectId ? [entry.projectId] : [],
            suggestedAction: 'Review event manually for categorization',
        };
    }

    private clampRelevance(value: number): number {
        if (Number.isNaN(value)) return 0;
        return Math.max(0, Math.min(1, value));
    }
}
