/**
 * embeddings.ts — Minimal embedding utilities.
 *
 * Provides a simple bag-of-words term-frequency vector for local
 * similarity search without requiring an external API.
 * Replace with a real embedding provider when needed.
 */

/** Generates a term-frequency vector from a text string. */
export function termFrequencyVector(text: string, vocabulary: string[]): number[] {
    const words = text.toLowerCase().split(/\W+/).filter(Boolean);
    const freq = new Map<string, number>();
    for (const w of words) {
        freq.set(w, (freq.get(w) ?? 0) + 1);
    }
    return vocabulary.map((term) => (freq.get(term) ?? 0) / Math.max(words.length, 1));
}

/** Builds a vocabulary from a corpus of texts. */
export function buildVocabulary(texts: string[], maxTerms = 512): string[] {
    const counts = new Map<string, number>();
    for (const text of texts) {
        const words = text.toLowerCase().split(/\W+/).filter(Boolean);
        for (const w of words) {
            counts.set(w, (counts.get(w) ?? 0) + 1);
        }
    }
    return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxTerms)
        .map(([term]) => term);
}

/** Cosine similarity between two vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom === 0 ? 0 : dot / denom;
}
