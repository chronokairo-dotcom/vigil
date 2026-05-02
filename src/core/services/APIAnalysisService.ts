import { Logger } from '../utils/Logger';
import { DataSource } from 'typeorm';

export interface EndpointInfo {
  path: string;
  method: string;
  authRequired: boolean;
  rateLimit?: string;
  status: 'secure' | 'vulnerable' | 'unknown';
  vulnerabilities: string[];
}

export interface AuthConfig {
  type: 'jwt' | 'oauth' | 'basic' | 'api-key' | 'none' | 'unknown';
  strength: 'strong' | 'weak' | 'none';
  details: string[];
}

export interface RateLimitConfig {
  enabled: boolean;
  requestsPerMinute?: number;
  requestsPerHour?: number;
  burstLimit?: number;
  strategy: 'fixed' | 'sliding' | 'token-bucket' | 'none';
  details?: string[];
}

export interface APIAnalysisResult {
  targetUrl: string;
  endpoints: EndpointInfo[];
  auth: AuthConfig;
  rateLimit: RateLimitConfig;
  securityHeaders: {
    present: string[];
    missing: string[];
  };
  tlsConfig: {
    enabled: boolean;
    version?: string;
    cipherSuites?: string[];
    issues: string[];
  };
  summary: {
    totalEndpoints: number;
    secureEndpoints: number;
    vulnerableEndpoints: number;
    authScore: number;
    rateLimitScore: number;
    overallScore: number;
  };
  analyzedAt: string;
}

/**
 * API Analysis Service
 * 
 * Analyzes API security including authentication, endpoints, and rate limiting
 */
export class APIAnalysisService {
  private logger = Logger.getInstance('APIAnalysisService');

  constructor(private db: DataSource) {}

  /**
   * Perform comprehensive API analysis
   */
  async analyzeAPI(targetUrl: string): Promise<APIAnalysisResult> {
    this.logger.info(`Starting API analysis for ${targetUrl}`);

    const startTime = Date.now();

    try {
      const [endpoints, auth, rateLimit, securityHeaders, tlsConfig] = await Promise.all([
        this.analyzeEndpoints(targetUrl),
        this.analyzeAuth(targetUrl),
        this.analyzeRateLimit(targetUrl),
        this.analyzeSecurityHeaders(targetUrl),
        this.analyzeTLSConfig(targetUrl),
      ]);

      const summary = this.calculateSummary(endpoints, auth, rateLimit);

      const result: APIAnalysisResult = {
        targetUrl,
        endpoints,
        auth,
        rateLimit,
        securityHeaders,
        tlsConfig,
        summary,
        analyzedAt: new Date().toISOString(),
      };

      this.logger.info(`API analysis completed in ${Date.now() - startTime}ms`);
      return result;
    } catch (error) {
      this.logger.error('API analysis failed', { error });
      throw error;
    }
  }

  /**
   * Analyze API endpoints
   */
  private async analyzeEndpoints(targetUrl: string): Promise<EndpointInfo[]> {
    const endpoints: EndpointInfo[] = [];

    // Common API endpoints to check
    const commonEndpoints = [
      { path: '/', method: 'GET', authRequired: false },
      { path: '/api', method: 'GET', authRequired: false },
      { path: '/api/v1', method: 'GET', authRequired: false },
      { path: '/api/health', method: 'GET', authRequired: false },
      { path: '/api/status', method: 'GET', authRequired: false },
      { path: '/api/users', method: 'GET', authRequired: true },
      { path: '/api/users', method: 'POST', authRequired: true },
      { path: '/api/users/:id', method: 'GET', authRequired: true },
      { path: '/api/users/:id', method: 'PUT', authRequired: true },
      { path: '/api/users/:id', method: 'DELETE', authRequired: true },
      { path: '/api/auth/login', method: 'POST', authRequired: false },
      { path: '/api/auth/logout', method: 'POST', authRequired: true },
      { path: '/api/auth/register', method: 'POST', authRequired: false },
      { path: '/admin', method: 'GET', authRequired: true },
      { path: '/api/admin', method: 'GET', authRequired: true },
      { path: '/api/data', method: 'GET', authRequired: true },
    ];

    for (const endpoint of commonEndpoints) {
      try {
        const url = `${targetUrl}${endpoint.path}`;
        const response = await fetch(url, {
          method: endpoint.method,
          signal: AbortSignal.timeout(5000),
        });

        const vulnerabilities: string[] = [];
        let status: 'secure' | 'vulnerable' | 'unknown' = 'unknown';

        // Check if endpoint exists
        if (response.status === 404) {
          continue; // Endpoint doesn't exist
        }

        // Check authentication requirement
        if (endpoint.authRequired && response.status === 200) {
          vulnerabilities.push('Missing authentication');
          status = 'vulnerable';
        }

        // Check for information disclosure
        if (response.status === 500) {
          vulnerabilities.push('Server error - potential information disclosure');
          status = 'vulnerable';
        }

        // Check for debug endpoints
        if (endpoint.path.includes('debug') || endpoint.path.includes('test')) {
          vulnerabilities.push('Debug/test endpoint exposed');
          status = 'vulnerable';
        }

        // Check for admin endpoints
        if (endpoint.path.includes('admin') && response.status === 200) {
          vulnerabilities.push('Admin endpoint accessible');
          status = 'vulnerable';
        }

        if (status === 'unknown' && vulnerabilities.length === 0) {
          status = 'secure';
        }

        endpoints.push({
          path: endpoint.path,
          method: endpoint.method,
          authRequired: endpoint.authRequired,
          status,
          vulnerabilities,
        });
      } catch (error) {
        // Endpoint check failed, skip
        continue;
      }
    }

    return endpoints;
  }

  /**
   * Analyze authentication configuration
   */
  private async analyzeAuth(targetUrl: string): Promise<AuthConfig> {
    const details: string[] = [];
    let type: AuthConfig['type'] = 'unknown';
    let strength: AuthConfig['strength'] = 'none';

    try {
      // Check for JWT authentication
      const jwtTest = await fetch(`${targetUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'test', password: 'test' }),
        signal: AbortSignal.timeout(5000),
      });

      const authHeader = jwtTest.headers.get('authorization') || jwtTest.headers.get('Authorization');
      const setCookie = jwtTest.headers.get('set-cookie') || jwtTest.headers.get('Set-Cookie');

      if (authHeader?.startsWith('Bearer ')) {
        type = 'jwt';
        details.push('JWT authentication detected');
        strength = 'strong';
      } else if (setCookie) {
        type = 'jwt'; // Often JWT in cookies
        details.push('Cookie-based authentication detected');
        strength = 'strong';
      } else if (jwtTest.status === 401 || jwtTest.status === 403) {
        type = 'unknown';
        details.push('Authentication required but method unclear');
        strength = 'weak';
      } else {
        type = 'none';
        details.push('No authentication detected');
        strength = 'none';
      }

      // Check for OAuth
      const oauthTest = await fetch(`${targetUrl}/oauth`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (oauthTest.ok || oauthTest.status === 302) {
        type = 'oauth';
        details.push('OAuth flow detected');
        strength = 'strong';
      }

      // Check for API key
      const apiKeyTest = await fetch(`${targetUrl}/api/v1`, {
        method: 'GET',
        headers: { 'X-API-Key': 'test-key' },
        signal: AbortSignal.timeout(5000),
      });

      if (apiKeyTest.status === 401 || apiKeyTest.status === 403) {
        details.push('API key authentication possible');
        if (type === 'none') {
          type = 'api-key';
          strength = 'weak';
        }
      }

      // Check for Basic auth
      const basicTest = await fetch(`${targetUrl}/api`, {
        method: 'GET',
        headers: { 'Authorization': 'Basic dGVzdDp0ZXN0' },
        signal: AbortSignal.timeout(5000),
      });

      if (basicTest.status === 401) {
        details.push('Basic authentication possible');
        if (type === 'none') {
          type = 'basic';
          strength = 'weak';
        }
      }

    } catch (error) {
      details.push('Could not determine authentication method');
    }

    return { type, strength, details };
  }

  /**
   * Analyze rate limiting configuration
   */
  private async analyzeRateLimit(targetUrl: string): Promise<RateLimitConfig> {
    let enabled = false;
    let strategy: RateLimitConfig['strategy'] = 'none';
    const details: string[] = [];

    try {
      // Test rate limiting by making multiple requests
      const requests = [];
      for (let i = 0; i < 20; i++) {
        requests.push(
          fetch(`${targetUrl}/api/health`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000),
          })
        );
      }

      const responses = await Promise.all(requests);
      const rateLimitedResponses = responses.filter(r => r.status === 429);

      if (rateLimitedResponses.length > 0) {
        enabled = true;
        strategy = 'fixed'; // Assume fixed window if rate limited
        details.push(`Rate limiting detected (${rateLimitedResponses.length}/20 requests blocked)`);
      } else {
        details.push('No rate limiting detected');
      }

      // Check for rate limit headers
      const testResponse = await fetch(`${targetUrl}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      const rateLimitHeaders = [
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
        'RateLimit-Limit',
        'RateLimit-Remaining',
        'RateLimit-Reset',
      ];

      for (const header of rateLimitHeaders) {
        if (testResponse.headers.get(header)) {
          enabled = true;
          details.push(`Rate limit header present: ${header}`);
        }
      }

    } catch (error) {
      details.push('Could not test rate limiting');
    }

    return {
      enabled,
      strategy,
      details: details as any,
    };
  }

  /**
   * Analyze security headers
   */
  private async analyzeSecurityHeaders(targetUrl: string): Promise<{
    present: string[];
    missing: string[];
  }> {
    const present: string[] = [];
    const missing: string[] = [];

    const requiredHeaders = [
      'Strict-Transport-Security',
      'Content-Security-Policy',
      'X-Frame-Options',
      'X-Content-Type-Options',
      'X-XSS-Protection',
      'Referrer-Policy',
      'Permissions-Policy',
    ];

    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      for (const header of requiredHeaders) {
        if (response.headers.get(header)) {
          present.push(header);
        } else {
          missing.push(header);
        }
      }

      // Check for CORS headers
      if (response.headers.get('Access-Control-Allow-Origin')) {
        present.push('Access-Control-Allow-Origin');
      }

    } catch (error) {
      // Could not check headers
    }

    return { present, missing };
  }

  /**
   * Analyze TLS configuration
   */
  private async analyzeTLSConfig(targetUrl: string): Promise<{
    enabled: boolean;
    version?: string;
    cipherSuites?: string[];
    issues: string[];
  }> {
    const issues: string[] = [];
    let enabled = false;
    let version: string | undefined;

    try {
      const url = new URL(targetUrl);
      enabled = url.protocol === 'https:';

      if (!enabled) {
        issues.push('HTTPS not enabled');
      } else {
        // Try to get TLS info (limited in browser environment)
        version = 'TLS 1.2+'; // Assume modern if HTTPS
      }

    } catch (error) {
      issues.push('Could not determine TLS configuration');
    }

    return {
      enabled,
      version,
      issues,
    };
  }

  /**
   * Calculate summary scores
   */
  private calculateSummary(
    endpoints: EndpointInfo[],
    auth: AuthConfig,
    rateLimit: RateLimitConfig
  ): APIAnalysisResult['summary'] {
    const totalEndpoints = endpoints.length;
    const secureEndpoints = endpoints.filter(e => e.status === 'secure').length;
    const vulnerableEndpoints = endpoints.filter(e => e.status === 'vulnerable').length;

    // Auth score (0-100)
    let authScore = 0;
    if (auth.type === 'jwt' || auth.type === 'oauth') authScore = 100;
    else if (auth.type === 'api-key') authScore = 60;
    else if (auth.type === 'basic') authScore = 40;
    else authScore = 0;

    // Rate limit score (0-100)
    let rateLimitScore = rateLimit.enabled ? 80 : 0;
    if (rateLimit.strategy === 'token-bucket') rateLimitScore = 100;
    else if (rateLimit.strategy === 'sliding') rateLimitScore = 90;

    // Overall score
    const endpointScore = totalEndpoints > 0 ? (secureEndpoints / totalEndpoints) * 100 : 50;
    const overallScore = Math.round((authScore * 0.4) + (rateLimitScore * 0.3) + (endpointScore * 0.3));

    return {
      totalEndpoints,
      secureEndpoints,
      vulnerableEndpoints,
      authScore,
      rateLimitScore,
      overallScore,
    };
  }
}
