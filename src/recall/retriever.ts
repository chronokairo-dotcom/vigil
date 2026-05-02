import { DataSource } from 'typeorm';
import { ContextEntry } from '../core/entities/ContextEntry';
import { Logger } from '../core/utils/Logger';
import { VectorStore } from '../memory/index/vectorStore';
import { buildVocabulary, termFrequencyVector, cosineSimilarity } from '../utils/embeddings';

export interface RetrievedItem {
    id: string;
    key: string;
    value: string;
    category: string;
    priority: number;
    projectId: string;
    score: number;
}

/**
 * Retriever
 *
 * Retrieves relevant context entries from the database
 * using keyword search and priority ordering.
 */
export class Retriever {
    private repo;
    private logger = Logger.getInstance('Retriever');

    constructor(private db: DataSource) {
        this.repo = db.getRepository(ContextEntry);
    }

    async retrieve(projectId: string, query: string, limit = 20): Promise<RetrievedItem[]> {
        const rows = await this.repo
            .createQueryBuilder('ctx')
            .where('ctx.projectId = :projectId', { projectId })
            .andWhere('(ctx.key LIKE :q OR ctx.value LIKE :q)', { q: `%${query}%` })
            .orderBy('ctx.priority', 'DESC')
            .limit(limit)
            .getMany();

        return rows.map((r) => ({
            id: r.id,
            key: r.key,
            value: r.value,
            category: r.category,
            priority: r.priority,
            projectId: (r as any).projectId ?? projectId,
            score: r.priority / 10,
        }));
    }

    async retrieveSemantic(projectId: string, query: string, limit = 20): Promise<RetrievedItem[]> {
        const rows = await this.repo
            .createQueryBuilder('ctx')
            .where('ctx.projectId = :projectId', { projectId })
            .orderBy('ctx.priority', 'DESC')
            .limit(Math.max(limit * 5, 50))
            .getMany();

        if (!rows.length) {
            return [];
        }

        const corpus = rows.map((row) => `${row.key} ${row.value}`);
        const vocabulary = buildVocabulary([query, ...corpus], 512);
        const queryVector = termFrequencyVector(query, vocabulary);

        const store = new VectorStore();
        for (const row of rows) {
            const text = `${row.key} ${row.value}`;
            store.add({
                id: row.id,
                text,
                vector: termFrequencyVector(text, vocabulary),
                metadata: {
                    key: row.key,
                    value: row.value,
                    category: row.category,
                    priority: row.priority,
                    projectId: (row as any).projectId ?? projectId,
                },
                createdAt: new Date(),
            });
        }

        const nearest = store.search(queryVector, limit);
        return nearest.map((entry) => {
            const metadata = entry.metadata as {
                key: string;
                value: string;
                category: string;
                priority: number;
                projectId: string;
            };

            const similarity = cosineSimilarity(queryVector, entry.vector);
            return {
                id: entry.id,
                key: metadata.key,
                value: metadata.value,
                category: metadata.category,
                priority: metadata.priority,
                projectId: metadata.projectId,
                score: Math.max(similarity, metadata.priority / 10),
            } satisfies RetrievedItem;
        });
    }

    async retrieveByCategory(projectId: string, category: string, limit = 10): Promise<RetrievedItem[]> {
        const rows = await this.repo.find({
            where: { category, project: { id: projectId } } as any,
            order: { priority: 'DESC' },
            take: limit,
        });

        return rows.map((r) => ({
            id: r.id,
            key: r.key,
            value: r.value,
            category: r.category,
            priority: r.priority,
            projectId,
            score: r.priority / 10,
        }));
    }
}
