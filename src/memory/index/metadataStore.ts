import { Logger } from '../../core/utils/Logger';

export interface MetadataRecord {
    key: string;
    value: unknown;
    tags?: string[];
    updatedAt: Date;
}

/**
 * Key-value metadata store with optional tag-based filtering.
 */
export class MetadataStore {
    private store = new Map<string, MetadataRecord>();
    private logger = Logger.getInstance('MetadataStore');

    set(key: string, value: unknown, tags?: string[]): void {
        this.store.set(key, { key, value, tags, updatedAt: new Date() });
    }

    get(key: string): MetadataRecord | undefined {
        return this.store.get(key);
    }

    getByTag(tag: string): MetadataRecord[] {
        const results: MetadataRecord[] = [];
        for (const record of this.store.values()) {
            if (record.tags?.includes(tag)) results.push(record);
        }
        return results;
    }

    delete(key: string): boolean {
        return this.store.delete(key);
    }

    keys(): string[] {
        return Array.from(this.store.keys());
    }

    clear(): void {
        this.store.clear();
        this.logger.info('MetadataStore cleared');
    }
}
