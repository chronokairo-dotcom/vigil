import * as fs from 'fs/promises';
import * as path from 'path';
import { BaseAction, ActionMeta } from './baseAction';

export interface WriteFilePayload {
    filePath: string;
    content: string;
    encoding?: BufferEncoding;
}

export interface ReadFilePayload {
    filePath: string;
    encoding?: BufferEncoding;
}

/**
 * WriteFileAction — writes content to a file, creating directories as needed.
 */
export class WriteFileAction extends BaseAction {
    constructor(private payload: WriteFilePayload, meta: Omit<ActionMeta, 'createdAt' | 'type'>) {
        super({ ...meta, type: 'code:write-file' });
    }

    protected async execute(): Promise<unknown> {
        const { filePath, content, encoding = 'utf8' } = this.payload;
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content, encoding);
        return { filePath, bytesWritten: Buffer.byteLength(content) };
    }
}

/**
 * ReadFileAction — reads a file and returns its contents.
 */
export class ReadFileAction extends BaseAction {
    constructor(private payload: ReadFilePayload, meta: Omit<ActionMeta, 'createdAt' | 'type'>) {
        super({ ...meta, type: 'code:read-file' });
    }

    protected async execute(): Promise<unknown> {
        const { filePath, encoding = 'utf8' } = this.payload;
        const content = await fs.readFile(filePath, encoding);
        return { filePath, content };
    }
}

/**
 * DeleteFileAction — deletes a file if it exists.
 */
export class DeleteFileAction extends BaseAction {
    constructor(private filePath: string, meta: Omit<ActionMeta, 'createdAt' | 'type'>) {
        super({ ...meta, type: 'code:delete-file' });
    }

    protected async execute(): Promise<unknown> {
        await fs.unlink(this.filePath);
        return { filePath: this.filePath };
    }
}
