import type { RetrievedItem } from './retriever';

export interface RankedItem extends RetrievedItem {
    rank: number;
    finalScore: number;
    reason?: string;
}

/**
 * Ranking
 *
 * Scores and re-ranks retrieved items using a combination of:
 * - Base priority (from DB)
 * - Keyword hit weight
 * - Recency (not yet — kept for future)
 */
export function rank(items: RetrievedItem[], query: string): RankedItem[] {
    const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);

    const scored = items.map((item) => {
        let boost = 0;
        const haystack = `${item.key} ${item.value}`.toLowerCase();
        for (const term of queryTerms) {
            const occurrences = (haystack.match(new RegExp(term, 'g')) ?? []).length;
            boost += occurrences * 0.1;
        }
        return { ...item, finalScore: item.score + boost };
    });

    return scored
        .sort((a, b) => b.finalScore - a.finalScore)
        .map((item, idx) => ({ ...item, rank: idx + 1 }));
}
