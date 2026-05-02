const SECRET_PATTERNS: RegExp[] = [
    /(api[_-]?key\s*[:=]\s*)([^\s"']+)/gi,
    /(token\s*[:=]\s*)([^\s"']+)/gi,
    /(password\s*[:=]\s*)([^\s"']+)/gi,
    /(bearer\s+)([a-z0-9._\-~+/]+=*)/gi,
    /(-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----)/gi,
    /([A-Za-z0-9_\-]*secret[A-Za-z0-9_\-]*\s*[:=]\s*)([^\s"']+)/gi,
];

const REDACTION = '[REDACTED]';

export function redactSecrets(text: string): string {
    if (!text) return text;

    let sanitized = text;
    for (const pattern of SECRET_PATTERNS) {
        sanitized = sanitized.replace(pattern, (_match, p1: string) => `${p1}${REDACTION}`);
    }

    return sanitized;
}
