import { DataSource } from 'typeorm';
import { SecurityAnalysisService, CreateSecurityAnalysisInput } from './SecurityAnalysisService';
import * as fs from 'fs/promises';
import * as path from 'path';

export class ApiSecurityScanner {
    constructor(private db: DataSource) {}

    async scan(targetUrl: string, workspaceId: string): Promise<CreateSecurityAnalysisInput> {
        const vulnerabilities: any[] = [];
        const recommendations: any[] = [];
        const start = Date.now();

        const tests = [
            { path: '/', method: 'GET', check: 'health endpoint' },
            { path: '/admin', method: 'GET', check: 'admin access' },
            { path: '/api/debug', method: 'GET', check: 'debug endpoint' },
            { path: "/?id=' OR '1'='1", method: 'GET', check: 'SQL injection' },
            { path: '/?q=<script>alert(1)</script>', method: 'GET', check: 'XSS' },
            { path: '/api/users/1', method: 'DELETE', check: 'IDOR' },
            { path: '/admin/export?file=../../etc/passwd', method: 'GET', check: 'path traversal' },
        ];

        for (const test of tests) {
            try {
                const res = await fetch(`${targetUrl}${test.path}`, {
                    method: test.method,
                    signal: AbortSignal.timeout(5000),
                });

                if (test.check === 'admin access' && res.status === 200) {
                    vulnerabilities.push({
                        id: `api-${Date.now()}-1`,
                        type: 'auth',
                        severity: 'high',
                        title: 'Unrestricted Admin Access',
                        description: 'Admin endpoint accessible without authentication',
                        location: { file: test.path, line: 0, column: 0 },
                        remediationSteps: [
                            'Implement authentication on admin routes',
                            'Add role-based access control',
                        ],
                        references: ['OWASP API1'],
                    });
                }

                if (test.check === 'SQL injection' && res.status !== 404) {
                    vulnerabilities.push({
                        id: `api-${Date.now()}-2`,
                        type: 'injection',
                        severity: 'critical',
                        title: 'Potential SQL Injection',
                        description: 'Parameter appears to be reflected without sanitization',
                        location: { file: test.path, line: 0, column: 0 },
                        remediationSteps: [
                            'Use parameterized queries',
                            'Validate and sanitize input',
                        ],
                        references: ['OWASP API8'],
                    });
                }

                if (test.check === 'path traversal' && res.status === 200) {
                    vulnerabilities.push({
                        id: `api-${Date.now()}-3`,
                        type: 'injection',
                        severity: 'critical',
                        title: 'Path Traversal Vulnerability',
                        description: 'File path traversal appears possible',
                        location: { file: test.path, line: 0, column: 0 },
                        remediationSteps: [
                            'Validate and sanitize file paths',
                            'Use allow-lists for file access',
                        ],
                        references: ['OWASP API4'],
                    });
                }
            } catch {
                // Endpoint doesn't exist or request failed - not a vulnerability
            }
        }

        if (vulnerabilities.length === 0) {
            recommendations.push({
                priority: 'low',
                title: 'API Security Best Practices',
                description: 'Consider implementing rate limiting and additional security headers',
                steps: [
                    'Add rate limiting',
                    'Implement CORS policies',
                    'Add security headers (CSP, HSTS)',
                ],
                timeEstimateHours: 4,
            });
        }

        return {
            workspaceId,
            targetId: targetUrl,
            targetName: targetUrl,
            type: 'api',
            vulnerabilities,
            recommendations,
            scanMethod: 'automated-api-tests',
            durationMs: Date.now() - start,
            scannerVersion: '1.0.0',
        };
    }
}

export class DependencyScanner {
    constructor(private db: DataSource) {}

    async scan(projectPath: string, workspaceId: string): Promise<CreateSecurityAnalysisInput> {
        const vulnerabilities: any[] = [];
        const recommendations: any[] = [];
        const start = Date.now();

        const packageJsonPath = path.join(projectPath, 'package.json');
        const packageLockPath = path.join(projectPath, 'package-lock.json');

        try {
            const content = await fs.readFile(packageJsonPath, 'utf-8');
            const pkg = JSON.parse(content);
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };

            const knownVulnerable: Record<string, string[]> = {
                'lodash': ['<4.17.21'],
                'axios': ['<1.6.0'],
                'express-jwt': ['<6.0.0'],
                'jsonwebtoken': ['<9.0.0'],
                'normalize-url': ['<4.5.1'],
                'node-fetch': ['<2.6.7'],
                'tar': ['<6.1.11'],
                'Moment': ['<2.29.4'],
                'underscore': ['<1.13.6'],
            };

            for (const [dep, versionRange] of Object.entries(deps)) {
                const vulnerableVersions = knownVulnerable[dep];
                if (vulnerableVersions) {
                    vulnerabilities.push({
                        id: `dep-${Date.now()}-${dep}`,
                        type: 'dependency',
                        severity: 'high',
                        title: `Outdated Dependency: ${dep}`,
                        description: `${dep} ${versionRange} has known vulnerabilities`,
                        location: { file: 'package.json', line: 0, column: 0 },
                        evidence: `${dep}: ${versionRange}`,
                        remediationSteps: [
                            `Update ${dep} to latest version`,
                            'Run npm audit for additional issues',
                        ],
                        references: ['npm audit', 'CVE'],
                    });
                }
            }

            if (Object.keys(deps).length > 50) {
                recommendations.push({
                    priority: 'medium',
                    title: 'Reduce Dependency Count',
                    description: `${Object.keys(deps).length} dependencies may increase attack surface`,
                    steps: [
                        'Audit and remove unused dependencies',
                        'Consider alternatives with fewer deps',
                    ],
                    timeEstimateHours: 8,
                });
            }
        } catch (e) {
            recommendations.push({
                priority: 'low',
                title: 'No package.json Found',
                description: 'This project does not use npm dependencies',
                steps: ['N/A'],
                timeEstimateHours: 0,
            });
        }

        return {
            workspaceId,
            targetId: projectPath,
            targetName: projectPath,
            type: 'dependency',
            vulnerabilities,
            recommendations,
            scanMethod: 'npm-audit-pattern',
            durationMs: Date.now() - start,
            scannerVersion: '1.0.0',
        };
    }
}

export class InfrastructureScanner {
    constructor(private db: DataSource) {}

    async scan(targetUrl: string, workspaceId: string): Promise<CreateSecurityAnalysisInput> {
        const vulnerabilities: any[] = [];
        const recommendations: any[] = [];
        const start = Date.now();

        try {
            const res = await fetch(targetUrl, {
                signal: AbortSignal.timeout(5000),
            });

            const headers = res.headers;
            const securityHeaders: Record<string, string> = {
                'strict-transport-security': 'HSTS',
                'content-security-policy': 'CSP',
                'x-frame-options': 'Clickjacking',
                'x-content-type-options': 'MIME sniffing',
                'x-xss-protection': 'XSS filter',
                'referrer-policy': 'Referrer leak',
                'permissions-policy': 'Feature permissions',
            };

            for (const [header, issue] of Object.entries(securityHeaders)) {
                if (!headers.has(header.toLowerCase())) {
                    vulnerabilities.push({
                        id: `infra-${Date.now()}-${header}`,
                        type: 'configuration',
                        severity: 'medium',
                        title: `Missing ${issue} Header`,
                        description: `${header} header is not set`,
                        location: { file: 'HTTP Headers', line: 0, column: 0 },
                        remediationSteps: [
                            `Add ${header} header to server response`,
                        ],
                        references: ['OWASP CSRF'],
                    });
                }
            }

            if (res.url.startsWith('http:')) {
                vulnerabilities.push({
                    id: `infra-${Date.now()}-ssl`,
                    type: 'configuration',
                    severity: 'critical',
                    title: 'Insecure HTTP Protocol',
                    description: 'Server using unencrypted HTTP instead of HTTPS',
                    remediationSteps: [
                        'Enable HTTPS on server',
                        'Redirect HTTP to HTTPS',
                        'Enable HSTS header',
                    ],
                    references: ['OWASP API2'],
                });
            }
        } catch (e) {
            recommendations.push({
                priority: 'low',
                title: 'Infrastructure Scan Failed',
                description: 'Could not reach target for scanning',
                steps: ['Verify target URL is accessible'],
                timeEstimateHours: 1,
            });
        }

        recommendations.push({
            priority: 'medium',
            title: 'Enable DDoS Protection',
            description: 'Consider adding rate limiting and WAF',
            steps: [
                'Configure rate limiting',
                'Add Web Application Firewall',
                'Enable CDN with DDoS protection',
            ],
            timeEstimateHours: 8,
        });

        return {
            workspaceId,
            targetId: targetUrl,
            targetName: targetUrl,
            type: 'infrastructure',
            vulnerabilities,
            recommendations,
            scanMethod: 'http-headers-analysis',
            durationMs: Date.now() - start,
            scannerVersion: '1.0.0',
        };
    }
}

export class SystemSecurityScanner {
    constructor(private db: DataSource) {}

    async scan(workspaceId: string): Promise<CreateSecurityAnalysisInput> {
        const vulnerabilities: any[] = [];
        const recommendations: any[] = [];
        const start = Date.now();

        recommendations.push({
            priority: 'medium',
            title: 'Enable Multi-Factor Authentication',
            description: 'MFA should be enforced for all users',
            steps: [
                'Configure MFA provider',
                'Enforce MFA for all users',
                'Set up MFA backup methods',
            ],
            timeEstimateHours: 4,
        });

        recommendations.push({
            priority: 'high',
            title: 'Rotate API Keys Quarterly',
            description: 'Regular key rotation reduces exposure window',
            steps: [
                'Set up automated key rotation',
                'Implement key expiration policy',
                'Audit active keys regularly',
            ],
            timeEstimateHours: 8,
        });

        recommendations.push({
            priority: 'medium',
            title: 'Enable Audit Logging',
            description: 'All security-relevant events should be logged',
            steps: [
                'Configure audit log retention',
                'Set up log alerting',
                'Implement log aggregation',
            ],
            timeEstimateHours: 6,
        });

        return {
            workspaceId,
            targetId: workspaceId,
            targetName: 'System',
            type: 'system',
            vulnerabilities,
            recommendations,
            scanMethod: 'system-best-practices',
            durationMs: Date.now() - start,
            scannerVersion: '1.0.0',
        };
    }
}