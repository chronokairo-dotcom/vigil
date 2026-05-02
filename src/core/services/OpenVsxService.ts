export interface OpenVsxSearchEntry {
    id: string;
    namespace: string;
    name: string;
    version: string;
    displayName: string;
    description: string;
    verified: boolean;
    deprecated: boolean;
    downloadCount: number;
    averageRating?: number;
    reviewCount?: number;
    timestamp?: string;
    files?: {
        download?: string;
        icon?: string;
        manifest?: string;
        readme?: string;
    };
    url?: string;
}

export interface OpenVsxSearchResult {
    offset: number;
    totalSize: number;
    extensions: OpenVsxSearchEntry[];
}

export interface OpenVsxExtensionDetail {
    id: string;
    namespace: string;
    name: string;
    version: string;
    displayName: string;
    description: string;
    verified: boolean;
    deprecated: boolean;
    downloadCount: number;
    averageRating?: number;
    reviewCount?: number;
    timestamp?: string;
    files?: {
        download?: string;
        icon?: string;
        manifest?: string;
        readme?: string;
        changelog?: string;
        license?: string;
    };
    engines?: {
        vscode?: string;
    };
    categories?: string[];
    tags?: string[];
    extensionKind?: string[];
    url?: string;
}

interface OpenVsxSearchResponse {
    offset?: number;
    totalSize?: number;
    extensions?: any[];
}

interface OpenVsxExtensionResponse {
    namespace?: string;
    name?: string;
    version?: string;
    displayName?: string;
    description?: string;
    verified?: boolean;
    deprecated?: boolean;
    downloadCount?: number;
    averageRating?: number;
    reviewCount?: number;
    timestamp?: string;
    files?: Record<string, string>;
    engines?: { vscode?: string };
    categories?: string[];
    tags?: string[];
    extensionKind?: string[];
    url?: string;
}

function toNormalizedEntry(raw: any): OpenVsxSearchEntry {
    const namespace = String(raw?.namespace ?? '').trim();
    const name = String(raw?.name ?? '').trim();
    const displayName = String((raw?.displayName ?? name) || '').trim();

    return {
        id: `${namespace}.${name}`.toLowerCase(),
        namespace,
        name,
        version: String(raw?.version ?? '').trim(),
        displayName,
        description: String(raw?.description ?? '').trim(),
        verified: Boolean(raw?.verified),
        deprecated: Boolean(raw?.deprecated),
        downloadCount: Number(raw?.downloadCount ?? 0),
        averageRating: typeof raw?.averageRating === 'number' ? raw.averageRating : undefined,
        reviewCount: typeof raw?.reviewCount === 'number' ? raw.reviewCount : undefined,
        timestamp: typeof raw?.timestamp === 'string' ? raw.timestamp : undefined,
        files: {
            download: typeof raw?.files?.download === 'string' ? raw.files.download : undefined,
            icon: typeof raw?.files?.icon === 'string' ? raw.files.icon : undefined,
            manifest: typeof raw?.files?.manifest === 'string' ? raw.files.manifest : undefined,
            readme: typeof raw?.files?.readme === 'string' ? raw.files.readme : undefined,
        },
        url: typeof raw?.url === 'string' ? raw.url : undefined,
    };
}

function toNormalizedDetail(raw: OpenVsxExtensionResponse): OpenVsxExtensionDetail {
    const namespace = String(raw?.namespace ?? '').trim();
    const name = String(raw?.name ?? '').trim();
    const displayNameRaw = raw?.displayName ?? name;
    const displayName = String(displayNameRaw ?? '').trim();

    return {
        id: `${namespace}.${name}`.toLowerCase(),
        namespace,
        name,
        version: String(raw?.version ?? '').trim(),
        displayName,
        description: String(raw?.description ?? '').trim(),
        verified: Boolean(raw?.verified),
        deprecated: Boolean(raw?.deprecated),
        downloadCount: Number(raw?.downloadCount ?? 0),
        averageRating: typeof raw?.averageRating === 'number' ? raw.averageRating : undefined,
        reviewCount: typeof raw?.reviewCount === 'number' ? raw.reviewCount : undefined,
        timestamp: typeof raw?.timestamp === 'string' ? raw.timestamp : undefined,
        files: {
            download: typeof raw?.files?.download === 'string' ? raw.files.download : undefined,
            icon: typeof raw?.files?.icon === 'string' ? raw.files.icon : undefined,
            manifest: typeof raw?.files?.manifest === 'string' ? raw.files.manifest : undefined,
            readme: typeof raw?.files?.readme === 'string' ? raw.files.readme : undefined,
            changelog: typeof raw?.files?.changelog === 'string' ? raw.files.changelog : undefined,
            license: typeof raw?.files?.license === 'string' ? raw.files.license : undefined,
        },
        engines: raw?.engines,
        categories: Array.isArray(raw?.categories) ? raw.categories : undefined,
        tags: Array.isArray(raw?.tags) ? raw.tags : undefined,
        extensionKind: Array.isArray(raw?.extensionKind) ? raw.extensionKind : undefined,
        url: typeof raw?.url === 'string' ? raw.url : undefined,
    };
}

export class OpenVsxService {
    private static instance: OpenVsxService;
    private readonly baseUrl: string;

    private constructor() {
        this.baseUrl = process.env.OPEN_VSX_BASE_URL?.trim() || 'https://open-vsx.org';
    }

    static getInstance(): OpenVsxService {
        if (!OpenVsxService.instance) {
            OpenVsxService.instance = new OpenVsxService();
        }
        return OpenVsxService.instance;
    }

    private async requestJson<T>(path: string): Promise<T> {
        const url = `${this.baseUrl}${path}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        try {
            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    Accept: 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`Open VSX request failed (${response.status}) for ${path}`);
            }

            return await response.json() as T;
        } finally {
            clearTimeout(timeout);
        }
    }

    private async requestText(url: string): Promise<string> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        try {
            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    Accept: 'text/plain, text/markdown, */*',
                },
            });
            if (!response.ok) {
                throw new Error(`Open VSX text request failed (${response.status})`);
            }
            return await response.text();
        } finally {
            clearTimeout(timeout);
        }
    }

    async search(query: string, offset = 0, size = 24): Promise<OpenVsxSearchResult> {
        const params = new URLSearchParams({
            query,
            offset: String(Math.max(0, offset)),
            size: String(Math.max(1, Math.min(100, size))),
        });

        const payload = await this.requestJson<OpenVsxSearchResponse>(`/api/-/search?${params.toString()}`);
        const entries = Array.isArray(payload.extensions) ? payload.extensions.map(toNormalizedEntry) : [];

        return {
            offset: Number(payload.offset ?? 0),
            totalSize: Number(payload.totalSize ?? entries.length),
            extensions: entries,
        };
    }

    async getExtension(namespace: string, name: string): Promise<OpenVsxExtensionDetail> {
        const payload = await this.requestJson<OpenVsxExtensionResponse>(`/api/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`);
        return toNormalizedDetail(payload);
    }

    async getReadme(namespace: string, name: string): Promise<{ readmeUrl: string; content: string }> {
        const detail = await this.getExtension(namespace, name);
        const readmeUrl = detail.files?.readme;
        if (!readmeUrl) {
            throw new Error('Readme not available for this extension');
        }

        const content = await this.requestText(readmeUrl);
        return { readmeUrl, content };
    }
}
