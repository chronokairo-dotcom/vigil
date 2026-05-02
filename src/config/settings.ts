/**
 * settings.ts — Application-wide settings with env-var overrides.
 */

export interface VigilSettings {
    env: 'development' | 'production' | 'test';
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    apiPort: number;
    dbPath: string;
    dataDir: string;
    maxAgentConcurrency: number;
    requestTimeoutMs: number;
}

function getSettings(): VigilSettings {
    return {
        env: (process.env.NODE_ENV as VigilSettings['env']) ?? 'development',
        logLevel: (process.env.LOG_LEVEL as VigilSettings['logLevel']) ?? 'info',
        apiPort: Number(process.env.VIGIL_API_PORT ?? 3000),
        dbPath: process.env.VIGIL_DB_PATH ?? 'vigil.sqlite',
        dataDir: process.env.VIGIL_DATA_DIR ?? 'data',
        maxAgentConcurrency: Number(process.env.VIGIL_MAX_CONCURRENCY ?? 4),
        requestTimeoutMs: Number(process.env.VIGIL_REQUEST_TIMEOUT_MS ?? 30_000),
    };
}

export const settings: VigilSettings = getSettings();
