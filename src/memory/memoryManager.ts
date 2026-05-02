import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../core/utils/Logger';
import { VectorStore } from './index/vectorStore';
import { MetadataStore } from './index/metadataStore';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const LOGS_DIR = path.join(DATA_DIR, 'logs');
const ENRICHED_LOGS_DIR = path.join(LOGS_DIR, 'enriched');
const INDEX_DIR = path.join(DATA_DIR, 'index');
const SUMMARIES_DIR = path.join(DATA_DIR, 'summaries');

export interface MemoryEntry {
    id: string;
    content: string;
    source: string;
    projectId?: string;
    timestamp: Date;
}

export interface MemoryEntryEnrichment {
    classification: string;
    tags: string[];
    relevance: number;
    entities: string[];
    suggestedAction: string;
}

export interface EnrichedMemoryEntry {
    raw: MemoryEntry;
    enriched: MemoryEntryEnrichment;
    inference: {
        provider: string;
        command: string;
        rawText: string;
        exitCode: number | null;
    };
    enrichedAt: string;
}

/**
 * MemoryManager
 *
 * Central manager for the agent's memory layer:
 * - Appends structured log entries to daily log files
 * - Maintains an in-memory vector index for semantic search
 * - Stores arbitrary metadata via MetadataStore
 */
export class MemoryManager {
    private static _instance: MemoryManager;

    readonly vectors = new VectorStore();
    readonly metadata = new MetadataStore();

    private logger = Logger.getInstance('MemoryManager');
    private ready = false;

    private constructor() { }

    static getInstance(): MemoryManager {
        if (!MemoryManager._instance) {
            MemoryManager._instance = new MemoryManager();
        }
        return MemoryManager._instance;
    }

    async init(): Promise<void> {
        if (this.ready) return;
        await fs.mkdir(LOGS_DIR, { recursive: true });
        await fs.mkdir(ENRICHED_LOGS_DIR, { recursive: true });
        await fs.mkdir(INDEX_DIR, { recursive: true });
        await fs.mkdir(SUMMARIES_DIR, { recursive: true });
        this.ready = true;
        this.logger.info('MemoryManager initialised — data dirs ready');
    }

    async log(entry: MemoryEntry): Promise<void> {
        if (!this.ready) await this.init();
        const dateStr = new Date().toISOString().slice(0, 10);
        const logFile = path.join(LOGS_DIR, `${dateStr}.log`);
        const line = JSON.stringify(entry) + '\n';
        await fs.appendFile(logFile, line, 'utf8');
    }

    async readLog(date: string): Promise<MemoryEntry[]> {
        const logFile = path.join(LOGS_DIR, `${date}.log`);
        try {
            const raw = await fs.readFile(logFile, 'utf8');
            return raw
                .trim()
                .split('\n')
                .filter(Boolean)
                .map((l) => JSON.parse(l) as MemoryEntry);
        } catch {
            return [];
        }
    }

    async appendEnriched(entry: EnrichedMemoryEntry): Promise<void> {
        if (!this.ready) await this.init();
        const dateStr = new Date(entry.raw.timestamp).toISOString().slice(0, 10);
        const logFile = path.join(ENRICHED_LOGS_DIR, `${dateStr}.enriched.log`);
        const line = JSON.stringify(entry) + '\n';
        await fs.appendFile(logFile, line, 'utf8');
    }

    async appendEnrichedBatch(entries: EnrichedMemoryEntry[]): Promise<void> {
        for (const entry of entries) {
            await this.appendEnriched(entry);
        }
    }

    async readEnrichedLog(date: string): Promise<EnrichedMemoryEntry[]> {
        const logFile = path.join(ENRICHED_LOGS_DIR, `${date}.enriched.log`);
        try {
            const raw = await fs.readFile(logFile, 'utf8');
            return raw
                .trim()
                .split('\n')
                .filter(Boolean)
                .map((l) => JSON.parse(l) as EnrichedMemoryEntry);
        } catch {
            return [];
        }
    }
}

export const memoryManager = MemoryManager.getInstance();
