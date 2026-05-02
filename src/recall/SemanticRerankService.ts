import { CliInferenceService, type LlmCliProvider } from '../core/llm-cli';
import { Logger } from '../core/utils/Logger';
import type { RankedItem } from './ranking';

interface RerankModelItem {
    id: string;
    semanticScore: number;
    reason: string;
}

export interface SemanticRerankOptions {
    topN?: number;
    preferredProvider?: LlmCliProvider;
    fallbackProviders?: LlmCliProvider[];
}

export class SemanticRerankService {
    private logger = Logger.getInstance('SemanticRerankService');

    constructor(private readonly inference = new CliInferenceService()) { }

    async rerank(
        items: RankedItem[],
        query: string,
        options: SemanticRerankOptions = {},
    ): Promise<RankedItem[]> {
        if (!items.length) return [];

        const topN = Math.max(1, Math.min(options.topN ?? 10, items.length));
        const candidates = items.slice(0, topN);
        const remaining = items.slice(topN);

        try {
            const prompt = this.buildPrompt(query, candidates);
            const result = await this.inference.executePrompt({
                preferredProvider: options.preferredProvider ?? 'gemini',
                fallbackProviders: options.fallbackProviders ?? ['claude', 'copilot', 'codex'],
                prompt,
            });

            const semantic = this.parseModelOutput(result.rawText || result.stdout || '');
            const byId = new Map(semantic.map((item) => [item.id, item]));

            const rerankedCandidates = candidates.map((item) => {
                const enriched = byId.get(item.id);
                if (!enriched) {
                    return {
                        ...item,
                        reason: 'Heuristic score retained (semantic reranker returned no item).',
                    } satisfies RankedItem;
                }

                const score = this.clamp01(enriched.semanticScore);
                const blended = (item.finalScore * 0.2) + (score * 0.8);
                return {
                    ...item,
                    finalScore: blended,
                    reason: enriched.reason || 'Semantically relevant to query intent.',
                } satisfies RankedItem;
            });

            const combined = [...rerankedCandidates, ...remaining]
                .sort((a, b) => b.finalScore - a.finalScore)
                .map((item, idx) => ({ ...item, rank: idx + 1 }));

            return combined;
        } catch (error) {
            this.logger.warn(`Semantic reranking failed; falling back to heuristic ranking: ${error}`);
            return items;
        }
    }

    private buildPrompt(query: string, candidates: RankedItem[]): string {
        const payload = candidates.map((item) => ({
            id: item.id,
            key: item.key,
            value: item.value,
            category: item.category,
            baseScore: item.finalScore,
        }));

        return [
            'You are a semantic reranking engine for retrieval context.',
            'Return ONLY a JSON array with this exact shape per item:',
            '[{"id":"...","semanticScore":0.0,"reason":"short reason"}]',
            'Rules:',
            '- Score must be between 0 and 1.',
            '- Keep reason short (max 12 words).',
            '- Only return IDs that exist in the input list.',
            '- Rank by semantic relevance to the query intent, not lexical overlap only.',
            '',
            `QUERY=${query}`,
            `CANDIDATES=${JSON.stringify(payload)}`,
        ].join('\n');
    }

    private parseModelOutput(rawText: string): RerankModelItem[] {
        const json = this.extractJsonArray(rawText);
        if (!json) return [];

        try {
            const parsed = JSON.parse(json) as unknown;
            if (!Array.isArray(parsed)) return [];

            const out: RerankModelItem[] = [];
            for (const row of parsed) {
                const id = typeof row?.id === 'string' ? row.id : '';
                const reason = typeof row?.reason === 'string' ? row.reason.trim() : '';
                const score = typeof row?.semanticScore === 'number' ? row.semanticScore : NaN;
                if (!id || Number.isNaN(score)) continue;
                out.push({
                    id,
                    semanticScore: this.clamp01(score),
                    reason: reason || 'Semantically relevant to query intent.',
                });
            }
            return out;
        } catch {
            return [];
        }
    }

    private extractJsonArray(rawText: string): string | null {
        const fenced = rawText.match(/```json\s*([\s\S]*?)\s*```/i);
        if (fenced?.[1]) {
            return fenced[1].trim();
        }

        const first = rawText.indexOf('[');
        const last = rawText.lastIndexOf(']');
        if (first !== -1 && last > first) {
            return rawText.slice(first, last + 1).trim();
        }
        return null;
    }

    private clamp01(value: number): number {
        return Math.max(0, Math.min(1, value));
    }
}
