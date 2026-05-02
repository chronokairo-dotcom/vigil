import { Logger } from '../utils/Logger';
import { DataSource } from 'typeorm';
import { SecurityAnalysisService } from './SecurityAnalysisService';
import { AdvancedSecurityAnalysisService } from './AdvancedSecurityAnalysisService';
import { IAIProvider } from '../providers/ai-provider';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Project Security Scanner
 * 
 * Connects security analysis services to real project files
 * and performs comprehensive security scans.
 */
export class ProjectSecurityScanner {
  private logger = Logger.getInstance('ProjectSecurityScanner');
  private securityService: SecurityAnalysisService;
  private advancedSecurityService: AdvancedSecurityAnalysisService;

  constructor(
    private db: DataSource,
    private aiProvider: IAIProvider
  ) {
    this.securityService = new SecurityAnalysisService(db);
    this.advancedSecurityService = new AdvancedSecurityAnalysisService(aiProvider);
  }

  /**
   * Perform basic security scan on project files
   */
  async scanProject(
    projectId: string,
    projectName: string,
    workspaceId: string,
    options: {
      deepScan?: boolean;
      filePatterns?: string[];
      excludePatterns?: string[];
    } = {}
  ): Promise<{
    id: string;
    vulnerabilityCount: number;
    severity: 'critical' | 'high' | 'medium' | 'low';
    durationMs: number;
    scanMethod: string;
    scannerVersion: string;
  }> {
    const startTime = Date.now();
    const { deepScan = false, filePatterns = ['**/*.{ts,tsx,js,jsx,json}'], excludePatterns = ['node_modules', '.git', 'dist'] } = options;

    this.logger.info(`Starting ${deepScan ? 'deep' : 'basic'} security scan`, {
      projectId,
      projectName,
      workspaceId,
    });

    try {
      // Get project path from project metadata
      const projectPath = await this.getProjectPath(projectId);
      if (!projectPath) {
        throw new Error(`Project path not found for project ${projectId}`);
      }

      // Find files to scan
      const files = await this.findProjectFiles(projectPath, filePatterns, excludePatterns);
      this.logger.info(`Found ${files.length} files to scan`);

      let vulnerabilities: any[] = [];
      let recommendations: any[] = [];
      let scanMethod = 'basic';
      let scannerVersion = '1.0.0';

      if (deepScan) {
        // Perform advanced AI-powered analysis
        this.logger.info('Performing deep security analysis with AI');
        scanMethod = 'advanced-ai';
        scannerVersion = '2.0.0';

        for (const file of files.slice(0, 10)) { // Limit to 10 files for deep scan
          try {
            const content = await fs.readFile(file.path, 'utf-8');
            const relativePath = path.relative(projectPath, file.path);
            
            const analysis = await this.advancedSecurityService.analyzeCode(content, file.language, {
              filename: relativePath,
              framework: await this.detectFramework(content, file.language),
            });

            // Convert advanced analysis results to security service format
            vulnerabilities.push(...this.convertAdvancedVulnerabilities(analysis.vulnerabilities, relativePath));
            recommendations.push(...this.convertAdvancedRecommendations(analysis.recommendations));
          } catch (error) {
            this.logger.warn(`Failed to analyze file ${file.path}`, { error });
          }
        }
      } else {
        // Perform basic pattern-based scanning
        this.logger.info('Performing basic pattern-based security analysis');
        
        for (const file of files) {
          try {
            const content = await fs.readFile(file.path, 'utf-8');
            const relativePath = path.relative(projectPath, file.path);
            
            const fileVulnerabilities = this.performBasicSecurityScan(content, file.language, relativePath);
            vulnerabilities.push(...fileVulnerabilities);
          } catch (error) {
            this.logger.warn(`Failed to scan file ${file.path}`, { error });
          }
        }

        // Generate basic recommendations
        recommendations = this.generateBasicRecommendations(vulnerabilities);
      }

      const durationMs = Date.now() - startTime;

      // Save analysis to database
      const analysis = await this.securityService.create({
        workspaceId,
        targetId: projectId,
        targetName: projectName,
        type: 'code',
        vulnerabilities,
        recommendations,
        scanMethod,
        durationMs,
        scannerVersion,
      });

      this.logger.info(`Security scan completed`, {
        analysisId: analysis.id,
        vulnerabilityCount: vulnerabilities.length,
        severity: analysis.severity,
        durationMs,
      });

      return {
        id: analysis.id,
        vulnerabilityCount: vulnerabilities.length,
        severity: analysis.severity,
        durationMs,
        scanMethod,
        scannerVersion,
      };

    } catch (error) {
      this.logger.error('Security scan failed', { error });
      throw error;
    }
  }

  /**
   * Get project path from database
   */
  private async getProjectPath(projectId: string): Promise<string | null> {
    try {
      const { Project } = await import('../entities/Project');
      const repo = this.db.getRepository(Project);
      const project = await repo.findOne({ where: { id: projectId } });
      if (!project) return null;
      const metadata = project.metadata as Record<string, any> | null;
      return metadata?.localPath || metadata?.path || null;
    } catch (error) {
      this.logger.error('Failed to get project path', { error });
      return null;
    }
  }

  /**
   * Find files in project matching patterns
   */
  private async findProjectFiles(
    projectPath: string,
    includePatterns: string[],
    excludePatterns: string[]
  ): Promise<Array<{ path: string; language: string }>> {
    const files: Array<{ path: string; language: string }> = [];

    try {
      const entries = await fs.readdir(projectPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(projectPath, entry.name);
        
        // Skip excluded patterns
        if (excludePatterns.some(pattern => fullPath.includes(pattern))) {
          continue;
        }

        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          const subFiles = await this.findProjectFiles(fullPath, includePatterns, excludePatterns);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          // Check if file matches include patterns
          const relativePath = path.relative(projectPath, fullPath);
          const language = this.detectLanguage(fullPath);
          
          if (language && this.matchesPattern(relativePath, includePatterns)) {
            files.push({ path: fullPath, language });
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to scan directory ${projectPath}`, { error });
    }

    return files;
  }

  /**
   * Detect programming language from file extension
   */
  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.go': 'go',
      '.rs': 'rust',
      '.java': 'java',
      '.cs': 'csharp',
      '.php': 'php',
      '.rb': 'ruby',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
    };
    return languageMap[ext] || 'unknown';
  }

  /**
   * Check if file path matches any pattern
   */
  private matchesPattern(filePath: string, patterns: string[]): boolean {
    return patterns.some(pattern => {
      // Simple glob pattern matching
      const regex = new RegExp(
        pattern.replace(/\*\*/g, '.*')
               .replace(/\*/g, '[^/]*')
               .replace(/\?/g, '[^/]')
      );
      return regex.test(filePath);
    });
  }

  /**
   * Perform basic pattern-based security scanning
   */
  private performBasicSecurityScan(content: string, language: string, filePath: string): any[] {
    const vulnerabilities: any[] = [];
    const lines = content.split('\n');

    // Language-specific security patterns
    const patterns = this.getLanguagePatterns(language);

    lines.forEach((line, index) => {
      patterns.forEach(pattern => {
        if (pattern.pattern.test(line)) {
          vulnerabilities.push({
            id: `${language}-${Date.now()}-${index}`,
            type: pattern.type || 'pattern',
            severity: pattern.severity,
            title: pattern.name,
            description: pattern.description,
            location: { file: filePath, line: index + 1, column: 0 },
            evidence: line.trim(),
            remediationSteps: pattern.remediationSteps || [`Review and fix the security issue in ${filePath} at line ${index + 1}`],
            references: pattern.references || [],
          });
        }
      });
    });

    return vulnerabilities;
  }

  /**
   * Get language-specific security patterns
   */
  private getLanguagePatterns(language: string): Array<{
    name: string;
    pattern: RegExp;
    severity: 'critical' | 'high' | 'medium' | 'low';
    description: string;
    type?: string;
    remediationSteps?: string[];
    references?: string[];
  }> {
    const commonPatterns = [
      {
        name: 'Hardcoded Secret',
        pattern: /(password|secret|key|token|api_key|apikey|private_key|privatekey)\s*[:=]\s*['"`][^'"`]{8,}['"`]/i,
        severity: 'high' as const,
        description: 'Potential hardcoded secret detected',
        type: 'crypto',
        remediationSteps: ['Use environment variables or secret management', 'Never commit secrets to version control'],
        references: ['CWE-798'],
      },
      {
        name: 'Hardcoded IP Address',
        pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,
        severity: 'low' as const,
        description: 'Hardcoded IP address detected',
        type: 'configuration',
        remediationSteps: ['Use configuration files or environment variables'],
        references: [],
      },
    ];

    const jsTsPatterns = [
      ...commonPatterns,
      {
        name: 'SQL Injection',
        pattern: /(execute|query)\s*\(\s*['"`].*\+.*['"`]|query\s*\(\s*\$\{.*\}\s*\)/i,
        severity: 'critical' as const,
        description: 'Potential SQL injection vulnerability via string concatenation',
        type: 'injection',
        remediationSteps: ['Use parameterized queries or prepared statements', 'Use ORM with built-in escaping'],
        references: ['CWE-89', 'OWASP A03'],
      },
      {
        name: 'XSS Vulnerability',
        pattern: /(innerHTML|outerHTML)\s*=.*(innerHTML|outerHTML|document\.write|dangerouslySetInnerHTML)/i,
        severity: 'high' as const,
        description: 'Potential cross-site scripting vulnerability',
        type: 'xss',
        remediationSteps: ['Use textContent instead of innerHTML', 'Sanitize user input before rendering', 'Use DOMPurify or similar libraries'],
        references: ['CWE-79', 'OWASP A03'],
      },
      {
        name: 'Eval Usage',
        pattern: /eval\s*\(/i,
        severity: 'critical' as const,
        description: 'Use of eval() function is dangerous',
        type: 'injection',
        remediationSteps: ['Avoid eval() - use alternative approaches', 'Use JSON.parse() for JSON parsing', 'Use Function constructor with caution'],
        references: ['CWE-95'],
      },
      {
        name: 'Unsafe Regex',
        pattern: /RegExp\s*\(\s*['"`][^'"`]*['"`]\s*\)|new\s+RegExp\s*\(/i,
        severity: 'medium' as const,
        description: 'Potential unsafe regular expression (ReDoS risk)',
        type: 'logic',
        remediationSteps: ['Validate regex patterns', 'Use regex libraries with timeout protection', 'Avoid catastrophic backtracking patterns'],
        references: ['CWE-1333'],
      },
      {
        name: 'document.write Usage',
        pattern: /document\.write\s*\(/i,
        severity: 'high' as const,
        description: 'document.write can overwrite entire document',
        type: 'xss',
        remediationSteps: ['Use DOM manipulation methods instead', 'Avoid document.write in modern applications'],
        references: ['CWE-79'],
      },
      {
        name: 'setTimeout with String',
        pattern: /setTimeout\s*\(\s*['"`]/i,
        severity: 'medium' as const,
        description: 'setTimeout with string argument is equivalent to eval()',
        type: 'injection',
        remediationSteps: ['Use function reference instead of string', 'Pass function as first argument'],
        references: ['CWE-95'],
      },
      {
        name: 'setInterval with String',
        pattern: /setInterval\s*\(\s*['"`]/i,
        severity: 'medium' as const,
        description: 'setInterval with string argument is equivalent to eval()',
        type: 'injection',
        remediationSteps: ['Use function reference instead of string', 'Pass function as first argument'],
        references: ['CWE-95'],
      },
      {
        name: 'Unsafe File Upload',
        pattern: /(upload|saveFile|writeFile)\s*\([^)]*\.(?:exe|sh|bat|php|jsp|asp)/i,
        severity: 'high' as const,
        description: 'Potential unsafe file upload handling',
        type: 'injection',
        remediationSteps: ['Validate file types', 'Rename uploaded files', 'Store files outside web root'],
        references: ['CWE-434', 'OWASP A03'],
      },
      {
        name: 'Direct Object Access',
        pattern: /req\.(body|query|params)\.[a-zA-Z_][a-zA-Z0-9_]*/i,
        severity: 'medium' as const,
        description: 'Direct access to request parameters without validation',
        type: 'injection',
        remediationSteps: ['Validate and sanitize all inputs', 'Use input validation libraries', 'Implement schema validation'],
        references: ['CWE-20', 'OWASP A03'],
      },
      {
        name: 'Missing Content-Type',
        pattern: /res\.send\s*\([^)]*\)/i,
        severity: 'low' as const,
        description: 'Response without explicit Content-Type header',
        type: 'configuration',
        remediationSteps: ['Always set Content-Type header', 'Use proper MIME types'],
        references: ['CWE-987'],
      },
      {
        name: 'Crypto Weak Algorithm',
        pattern: /(md5|sha1|sha-1)\s*\(/i,
        severity: 'medium' as const,
        description: 'Weak cryptographic algorithm detected',
        type: 'crypto',
        remediationSteps: ['Use SHA-256 or stronger', 'Use Argon2 or bcrypt for passwords'],
        references: ['CWE-327'],
      },
      {
        name: 'Random Math.random',
        pattern: /Math\.random\s*\(\)/i,
        severity: 'medium' as const,
        description: 'Math.random() is not cryptographically secure',
        type: 'crypto',
        remediationSteps: ['Use crypto.randomBytes() or webcrypto API', 'Use proper CSPRNG for security-critical operations'],
        references: ['CWE-338'],
      },
      {
        name: 'Prototype Pollution',
        pattern: /(merge|extend|assign)\s*\([^)]*\.\.\.|Object\.(assign|merge)\s*\([^)]*\.\.\.\)/i,
        severity: 'high' as const,
        description: 'Potential prototype pollution vulnerability',
        type: 'injection',
        remediationSteps: ['Validate objects before merging', 'Use libraries that prevent prototype pollution', 'Sanitize object keys'],
        references: ['CWE-1321', 'OWASP A08'],
      },
      {
        name: 'Command Injection',
        pattern: /(exec|spawn)\s*\(\s*[^)]*\+|child_process\.(exec|spawn)\s*\(\s*[^)]*\+/i,
        severity: 'critical' as const,
        description: 'Potential command injection vulnerability',
        type: 'injection',
        remediationSteps: ['Use parameterized commands', 'Validate and sanitize all inputs', 'Use execFile or spawn with array arguments'],
        references: ['CWE-78', 'OWASP A03'],
      },
      {
        name: 'Debug Mode Enabled',
        pattern: /(debug|DEBUG)\s*[:=]\s*true/i,
        severity: 'medium' as const,
        description: 'Debug mode may expose sensitive information',
        type: 'configuration',
        remediationSteps: ['Disable debug in production', 'Use environment-based configuration'],
        references: ['CWE-489'],
      },
    ];

    const pythonPatterns = [
      ...commonPatterns,
      {
        name: 'SQL Injection',
        pattern: /execute\s*\(\s*['"`].*\+.*['"`]|cursor\.execute\s*\(\s*['"`].*\%|cursor\.execute\s*\(\s*f['"`].*\{/i,
        severity: 'critical' as const,
        description: 'Potential SQL injection vulnerability',
        type: 'injection',
        remediationSteps: ['Use parameterized queries with placeholders', 'Use ORM with built-in escaping', 'Never concatenate SQL strings'],
        references: ['CWE-89', 'OWASP A03'],
      },
      {
        name: 'Eval Usage',
        pattern: /eval\s*\(/i,
        severity: 'critical' as const,
        description: 'Use of eval() function is dangerous',
        type: 'injection',
        remediationSteps: ['Avoid eval() - use ast.literal_eval() for literals', 'Use proper parsing libraries'],
        references: ['CWE-95'],
      },
      {
        name: 'Exec Usage',
        pattern: /exec\s*\(/i,
        severity: 'critical' as const,
        description: 'Use of exec() function is dangerous',
        type: 'injection',
        remediationSteps: ['Avoid exec() - use alternative approaches', 'Use function dispatch or class-based approaches'],
        references: ['CWE-95'],
      },
      {
        name: 'Pickle Unsafe Load',
        pattern: /pickle\.load\s*\(/i,
        severity: 'critical' as const,
        description: 'Pickle deserialization can execute arbitrary code',
        type: 'injection',
        remediationSteps: ['Use JSON or other safe serialization formats', 'If pickle is required, validate data first', 'Use hmac signing for pickle data'],
        references: ['CWE-502', 'OWASP A08'],
      },
      {
        name: 'Shell Command Injection',
        pattern: /os\.system\s*\(\s*[^)]*\+|subprocess\.(call|run|Popen)\s*\(\s*shell\s*=\s*True/i,
        severity: 'critical' as const,
        description: 'Potential command injection vulnerability',
        type: 'injection',
        remediationSteps: ['Use subprocess with list arguments', 'Avoid shell=True', 'Validate and sanitize all inputs'],
        references: ['CWE-78', 'OWASP A03'],
      },
      {
        name: 'Weak Hash Algorithm',
        pattern: /(md5|sha1|sha-1)\s*\(/i,
        severity: 'medium' as const,
        description: 'Weak cryptographic algorithm detected',
        type: 'crypto',
        remediationSteps: ['Use SHA-256 or stronger', 'Use hashlib.sha256 or hashlib.sha3_256'],
        references: ['CWE-327'],
      },
      {
        name: 'Random Module',
        pattern: /random\.(random|randint|choice)\s*\(/i,
        severity: 'medium' as const,
        description: 'random module is not cryptographically secure',
        type: 'crypto',
        remediationSteps: ['Use secrets module for security-critical operations', 'Use secrets.randbelow() or secrets.choice()'],
        references: ['CWE-338'],
      },
      {
        name: 'YAML Unsafe Load',
        pattern: /yaml\.load\s*\(/i,
        severity: 'high' as const,
        description: 'YAML load can execute arbitrary code',
        type: 'injection',
        remediationSteps: ['Use yaml.safe_load() instead', 'Validate YAML structure before loading'],
        references: ['CWE-502'],
      },
      {
        name: 'Template String Injection',
        pattern: /Template\s*\(\s*[^)]*\$\{/i,
        severity: 'medium' as const,
        description: 'Template strings can lead to injection',
        type: 'injection',
        remediationSteps: ['Validate template inputs', 'Use safe template libraries like Jinja2 with autoescape'],
        references: ['CWE-94'],
      },
      {
        name: 'SSL Verification Disabled',
        pattern: /verify\s*=\s*False|ssl\.create_default_context\s*\(\s*check_hostname\s*=\s*False/i,
        severity: 'high' as const,
        description: 'SSL certificate verification disabled',
        type: 'configuration',
        remediationSteps: ['Always verify SSL certificates', 'Use proper certificate bundles', 'Only disable in development'],
        references: ['CWE-295'],
      },
      {
        name: 'Hardcoded Flask Secret',
        pattern: /app\.config\[?['"`]SECRET_KEY['"`]\]?\s*=\s*['"`][^'"`]+['"`]/i,
        severity: 'high' as const,
        description: 'Hardcoded Flask secret key',
        type: 'crypto',
        remediationSteps: ['Use environment variables', 'Generate strong random keys', 'Never commit secrets'],
        references: ['CWE-798'],
      },
      {
        name: 'Debug Mode Flask',
        pattern: /app\.run\s*\(\s*debug\s*=\s*True/i,
        severity: 'medium' as const,
        description: 'Flask debug mode enabled',
        type: 'configuration',
        remediationSteps: ['Disable debug in production', 'Use environment-based configuration'],
        references: ['CWE-489'],
      },
    ];

    const javaPatterns = [
      ...commonPatterns,
      {
        name: 'SQL Injection',
        pattern: /execute\s*\(\s*['"`].*\+.*['"`]|Statement\.execute\s*\(/i,
        severity: 'critical' as const,
        description: 'Potential SQL injection vulnerability',
        type: 'injection',
        remediationSteps: ['Use PreparedStatement with parameterized queries', 'Use ORM frameworks like Hibernate', 'Never concatenate SQL strings'],
        references: ['CWE-89', 'OWASP A03'],
      },
      {
        name: 'Command Injection',
        pattern: /Runtime\.getRuntime\(\)\.exec\s*\(/i,
        severity: 'critical' as const,
        description: 'Potential command injection vulnerability',
        type: 'injection',
        remediationSteps: ['Use ProcessBuilder with proper input validation', 'Avoid Runtime.exec() with user input', 'Validate and sanitize all inputs'],
        references: ['CWE-78', 'OWASP A03'],
      },
      {
        name: 'Weak Hash Algorithm',
        pattern: /MessageDigest\.getInstance\s*\(\s*['"`](MD5|SHA-1|SHA1)['"`]/i,
        severity: 'medium' as const,
        description: 'Weak cryptographic algorithm detected',
        type: 'crypto',
        remediationSteps: ['Use SHA-256 or stronger', 'Use MessageDigest.getInstance("SHA-256")'],
        references: ['CWE-327'],
      },
      {
        name: 'Weak Random',
        pattern: /new\s+Random\s*\(\)|Math\.random\s*\(\)/i,
        severity: 'medium' as const,
        description: 'Random class is not cryptographically secure',
        type: 'crypto',
        remediationSteps: ['Use SecureRandom for security-critical operations', 'Use java.security.SecureRandom'],
        references: ['CWE-338'],
      },
      {
        name: 'Unsafe Deserialization',
        pattern: /ObjectInputStream\s*\(|readObject\s*\(/i,
        severity: 'critical' as const,
        description: 'Unsafe deserialization can execute arbitrary code',
        type: 'injection',
        remediationSteps: ['Use safe serialization formats like JSON', 'Validate data before deserialization', 'Use digital signatures'],
        references: ['CWE-502', 'OWASP A08'],
      },
      {
        name: 'XPath Injection',
        pattern: /XPath\.evaluate\s*\(\s*['"`].*\+.*['"`]/i,
        severity: 'high' as const,
        description: 'Potential XPath injection vulnerability',
        type: 'injection',
        remediationSteps: ['Use parameterized XPath queries', 'Validate and sanitize inputs', 'Use XPath compiled expressions'],
        references: ['CWE-91'],
      },
      {
        name: 'LDAP Injection',
        pattern: /search\s*\(\s*['"`].*\+.*['"`]/i,
        severity: 'high' as const,
        description: 'Potential LDAP injection vulnerability',
        type: 'injection',
        remediationSteps: ['Use parameterized LDAP queries', 'Validate and sanitize inputs', 'Use proper encoding'],
        references: ['CWE-90'],
      },
      {
        name: 'Path Traversal',
        pattern: /new\s+File\s*\(\s*[^)]*\+|Paths\.get\s*\(\s*[^)]*\+/i,
        severity: 'high' as const,
        description: 'Potential path traversal vulnerability',
        type: 'injection',
        remediationSteps: ['Validate and normalize file paths', 'Use allow-lists for file access', 'Never use user input directly in file paths'],
        references: ['CWE-22', 'OWASP A01'],
      },
      {
        name: 'Weak SSL Context',
        pattern: /TrustManager|X509TrustManager|SSLContext\.getInstance\s*\(\s*['"`]TLS['"`]/i,
        severity: 'medium' as const,
        description: 'Potential weak SSL/TLS configuration',
        type: 'configuration',
        remediationSteps: ['Use proper SSL/TLS configuration', 'Implement proper certificate validation', 'Use up-to-date TLS versions'],
        references: ['CWE-295'],
      },
      {
        name: 'Hardcoded Password',
        pattern: /password\s*=\s*['"`][^'"`]+['"`]/i,
        severity: 'high' as const,
        description: 'Hardcoded password detected',
        type: 'crypto',
        remediationSteps: ['Use secure credential storage', 'Use environment variables or secret management', 'Never hardcode passwords'],
        references: ['CWE-798'],
      },
    ];

    const goPatterns = [
      ...commonPatterns,
      {
        name: 'SQL Injection',
        pattern: /Exec\s*\(\s*[^)]*\+|Query\s*\(\s*[^)]*\+/i,
        severity: 'critical' as const,
        description: 'Potential SQL injection vulnerability',
        type: 'injection',
        remediationSteps: ['Use parameterized queries', 'Use prepared statements', 'Use ORM with built-in escaping'],
        references: ['CWE-89', 'OWASP A03'],
      },
      {
        name: 'Command Injection',
        pattern: /exec\.Command\s*\(\s*[^)]*\+/i,
        severity: 'critical' as const,
        description: 'Potential command injection vulnerability',
        type: 'injection',
        remediationSteps: ['Use exec.Command with array arguments', 'Validate and sanitize all inputs', 'Avoid string concatenation in commands'],
        references: ['CWE-78', 'OWASP A03'],
      },
      {
        name: 'Weak Hash Algorithm',
        pattern: /md5\.New\(\)|sha1\.New\(\)/i,
        severity: 'medium' as const,
        description: 'Weak cryptographic algorithm detected',
        type: 'crypto',
        remediationSteps: ['Use SHA-256 or stronger', 'Use crypto/sha256'],
        references: ['CWE-327'],
      },
      {
        name: 'Weak Random',
        pattern: /rand\.|math\/rand/i,
        severity: 'medium' as const,
        description: 'math/rand is not cryptographically secure',
        type: 'crypto',
        remediationSteps: ['Use crypto/rand for security-critical operations', 'Use rand.Read() or rand.Int()'],
        references: ['CWE-338'],
      },
      {
        name: 'Unsafe Deserialization',
        pattern: /gob\.Decode|json\.Unmarshal\s*\(/i,
        severity: 'medium' as const,
        description: 'Unsafe deserialization can be dangerous',
        type: 'injection',
        remediationSteps: ['Validate data before deserialization', 'Use safe serialization formats', 'Implement input validation'],
        references: ['CWE-502'],
      },
    ];

    const genericPatterns = [
      ...commonPatterns,
      {
        name: 'TODO Comment',
        pattern: /TODO|FIXME|HACK|XXX/i,
        severity: 'low' as const,
        description: 'Development comment that may indicate incomplete code',
        type: 'logic',
        remediationSteps: ['Review and complete the TODO item', 'Remove or update the comment'],
        references: [],
      },
      {
        name: 'Commented Code',
        pattern: /^\s*\/\/.*\w+.*\(|^\s*#.*\w+.*\(/i,
        severity: 'low' as const,
        description: 'Commented code may indicate dead code or security bypass',
        type: 'logic',
        remediationSteps: ['Remove commented code', 'Ensure it was not a security bypass'],
        references: [],
      },
    ];

    switch (language) {
      case 'typescript':
      case 'javascript':
        return jsTsPatterns;
      case 'python':
        return pythonPatterns;
      case 'java':
        return javaPatterns;
      case 'go':
        return goPatterns;
      default:
        return genericPatterns;
    }
  }

  /**
   * Detect framework from code content
   */
  private async detectFramework(content: string, language: string): Promise<string> {
    if (language === 'typescript' || language === 'javascript') {
      if (content.includes('react') || content.includes('JSX')) return 'react';
      if (content.includes('express')) return 'express';
      if (content.includes('next')) return 'nextjs';
      if (content.includes('vue')) return 'vue';
      if (content.includes('angular')) return 'angular';
    }
    return 'unknown';
  }

  /**
   * Convert advanced vulnerabilities to security service format
   */
  private convertAdvancedVulnerabilities(advancedVulns: any[], filePath: string): any[] {
    return advancedVulns.map(vuln => ({
      id: vuln.id,
      type: vuln.type,
      severity: vuln.severity,
      title: vuln.title,
      description: vuln.description,
      location: vuln.lineNumbers ? { 
        file: filePath, 
        line: vuln.lineNumbers[0], 
        column: 0 
      } : undefined,
      evidence: vuln.codeSnippet,
      remediationSteps: [`Address ${vuln.title} in ${filePath}`],
      references: vuln.cveId ? [`CVE-${vuln.cveId}`] : [],
      cvss: vuln.cvssScore,
    }));
  }

  /**
   * Convert advanced recommendations to security service format
   */
  private convertAdvancedRecommendations(advancedRecs: any[]): any[] {
    return advancedRecs.map(rec => ({
      priority: rec.priority,
      title: rec.title,
      description: rec.description,
      steps: rec.steps,
      timeEstimateHours: rec.estimatedEffort === 'minimal' ? 1 : 
                          rec.estimatedEffort === 'low' ? 4 :
                          rec.estimatedEffort === 'medium' ? 8 : 16,
    }));
  }

  /**
   * Generate basic recommendations from vulnerabilities
   */
  private generateBasicRecommendations(vulnerabilities: any[]): any[] {
    const recommendations: any[] = [];
    const severityCount = vulnerabilities.reduce((acc, vuln) => {
      acc[vuln.severity] = (acc[vuln.severity] || 0) + 1;
      return acc;
    }, {});

    if (severityCount.critical > 0) {
      recommendations.push({
        priority: 'high',
        title: 'Address Critical Security Issues',
        description: `Found ${severityCount.critical} critical vulnerabilities that require immediate attention`,
        steps: [
          'Review and fix all critical vulnerabilities',
          'Implement secure coding practices',
          'Run security scans regularly',
        ],
        timeEstimateHours: severityCount.critical * 2,
      });
    }

    if (severityCount.high > 0) {
      recommendations.push({
        priority: 'medium',
        title: 'Fix High-Severity Vulnerabilities',
        description: `Found ${severityCount.high} high-severity vulnerabilities`,
        steps: [
          'Prioritize high-severity fixes',
          'Update dependencies if needed',
          'Add input validation and sanitization',
        ],
        timeEstimateHours: severityCount.high * 1,
      });
    }

    return recommendations;
  }
}
