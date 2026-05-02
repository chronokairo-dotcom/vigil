import { Logger } from '../../core/utils/Logger';

export interface VectorEntry {
    id: string;
    text: string;
    vector: number[];
    metadata?: Record<string, unknown>;
    createdAt: Date;
}

/**
 * In-memory vector store for semantic similarity lookups.
 * Uses cosine similarity for nearest-neighbour search.
 */
export class VectorStore {
    private entries: VectorEntry[] = [];
    private logger = Logger.getInstance('VectorStore');

    add(entry: VectorEntry): void {
        this.entries.push(entry);
    }

    search(queryVector: number[], topK = 5): VectorEntry[] {
        return this.entries
            .map((e) => ({ entry: e, score: cosineSimilarity(queryVector, e.vector) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, topK)
            .map((r) => r.entry);
    }

    delete(id: string): boolean {
        const before = this.entries.length;
        this.entries = this.entries.filter((e) => e.id !== id);
        return this.entries.length < before;
    }

    count(): number {
        return this.entries.length;
    }

    clear(): void {
        this.entries = [];
        this.logger.info('VectorStore cleared');
    }
}

function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
}
