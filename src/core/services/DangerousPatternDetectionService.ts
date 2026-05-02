import { Logger } from '../utils/Logger';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface DangerousPattern {
  id: string;
  name: string;
  description: string;
  pattern: RegExp;
  category: 'code-execution' | 'xss' | 'injection' | 'file-access' | 'crypto' | 'network' | 'system';
  severity: 'critical' | 'high' | 'medium' | 'low';
  language: string[];
  cwe?: string;
  remediation: string;
}

export interface PatternMatch {
  id: string;
  patternId: string;
  patternName: string;
  file: string;
  line: number;
  column: number;
  codeSnippet: string;
  context: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  confidence: number;
}

export interface DangerousPatternResult {
  patternsAnalyzed: number;
  matches: PatternMatch[];
  summary: {
    totalMatches: number;
    criticalMatches: number;
    highMatches: number;
    mediumMatches: number;
    lowMatches: number;
    filesScanned: number;
    filesWithMatches: number;
  };
  categoryBreakdown: Record<string, number>;
  topRiskyFiles: { file: string; matchCount: number }[];
  recommendations: string[];
  analyzedAt: string;
  analysisDuration: number;
}

/**
 * Dangerous Pattern Detection Service
 * 
 * Detects dangerous code patterns like eval(), innerHTML, subprocess, etc.
 */
export class DangerousPatternDetectionService {
  private logger = Logger.getInstance('DangerousPatternDetectionService');
  private patterns: DangerousPattern[] = [];

  constructor(private db: DataSource) {
    this.initializePatterns();
  }

  /**
   * Detect dangerous patterns in codebase
   */
  async detectDangerousPatterns(projectPath?: string): Promise<DangerousPatternResult> {
    this.logger.info('Starting dangerous pattern detection');

    const startTime = Date.now();

    try {
      if (!projectPath) {
        projectPath = process.cwd();
      }

      const matches: PatternMatch[] = [];
      const filesScanned: string[] = [];

      // Scan code files
      const codeFiles = await this.findCodeFiles(projectPath);
      
      for (const file of codeFiles) {
        const content = await fs.readFile(file, 'utf-8');
        const fileMatches = await this.scanFileForPatterns(file, content);
        matches.push(...fileMatches);
        if (fileMatches.length > 0) {
          filesScanned.push(file);
        }
      }

      // Calculate summary
      const summary = this.calculateSummary(matches, codeFiles.length, filesScanned.length);

      // Category breakdown
      const categoryBreakdown = this.calculateCategoryBreakdown(matches);

      // Top risky files
      const topRiskyFiles = this.getTopRiskyFiles(matches);

      // Generate recommendations
      const recommendations = this.generateRecommendations(matches, categoryBreakdown);

      const result: DangerousPatternResult = {
        patternsAnalyzed: this.patterns.length,
        matches,
        summary,
        categoryBreakdown,
        topRiskyFiles,
        recommendations,
        analyzedAt: new Date().toISOString(),
        analysisDuration: Date.now() - startTime,
      };

      this.logger.info(`Dangerous pattern detection completed in ${Date.now() - startTime}ms`);
      return result;
    } catch (error) {
      this.logger.error('Dangerous pattern detection failed', { error });
      throw error;
    }
  }

  /**
   * Scan a single file for dangerous patterns
   */
  private async scanFileForPatterns(filePath: string, content: string): Promise<PatternMatch[]> {
    const matches: PatternMatch[] = [];
    const lines = content.split('\n');
    const language = this.detectLanguage(filePath);

    for (const pattern of this.patterns) {
      if (!pattern.language.includes(language)) continue;

      const regex = pattern.pattern;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(regex);

        if (match) {
          const matchIndex = line.search(regex);
          matches.push({
            id: uuidv4(),
            patternId: pattern.id,
            patternName: pattern.name,
            file: path.basename(filePath),
            line: i + 1,
            column: matchIndex + 1,
            codeSnippet: line.trim(),
            context: this.extractContext(lines, i, 2),
            severity: pattern.severity,
            category: pattern.category,
            confidence: this.calculateConfidence(match, pattern),
          });
        }
      }
    }

    return matches;
  }

  /**
   * Extract context around a match
   */
  private extractContext(lines: string[], lineIndex: number, contextLines: number): string {
    const start = Math.max(0, lineIndex - contextLines);
    const end = Math.min(lines.length, lineIndex + contextLines + 1);
    return lines.slice(start, end).join('\n');
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(match: RegExpMatchArray, pattern: DangerousPattern): number {
    // Base confidence
    let confidence = 80;

    // Increase confidence if match is specific
    if (match[0].length > 10) confidence += 10;
    
    // Decrease confidence if it's in comments
    if (match[0].includes('//') || match[0].includes('#')) confidence -= 30;

    return Math.min(100, Math.max(0, confidence));
  }

  /**
   * Detect language from file extension
   */
  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap: Record<string, string> = {
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.go': 'go',
      '.rs': 'rust',
      '.rb': 'ruby',
      '.php': 'php',
      '.cs': 'csharp',
      '.cpp': 'cpp',
      '.c': 'c',
    };

    return languageMap[ext] || 'javascript';
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(matches: PatternMatch[], totalFiles: number, filesWithMatches: number): DangerousPatternResult['summary'] {
    const totalMatches = matches.length;
    const criticalMatches = matches.filter(m => m.severity === 'critical').length;
    const highMatches = matches.filter(m => m.severity === 'high').length;
    const mediumMatches = matches.filter(m => m.severity === 'medium').length;
    const lowMatches = matches.filter(m => m.severity === 'low').length;

    return {
      totalMatches,
      criticalMatches,
      highMatches,
      mediumMatches,
      lowMatches,
      filesScanned: totalFiles,
      filesWithMatches,
    };
  }

  /**
   * Calculate category breakdown
   */
  private calculateCategoryBreakdown(matches: PatternMatch[]): Record<string, number> {
    const breakdown: Record<string, number> = {};

    for (const match of matches) {
      breakdown[match.category] = (breakdown[match.category] || 0) + 1;
    }

    return breakdown;
  }

  /**
   * Get top risky files
   */
  private getTopRiskyFiles(matches: PatternMatch[]): { file: string; matchCount: number }[] {
    const fileCounts = new Map<string, number>();

    for (const match of matches) {
      fileCounts.set(match.file, (fileCounts.get(match.file) || 0) + 1);
    }

    return Array.from(fileCounts.entries())
      .map(([file, count]) => ({ file, matchCount: count }))
      .sort((a, b) => b.matchCount - a.matchCount)
      .slice(0, 5);
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(matches: PatternMatch[], categoryBreakdown: Record<string, number>): string[] {
    const recommendations: string[] = [];

    // Code execution
    if (categoryBreakdown['code-execution'] > 0) {
      recommendations.push('Replace eval() and similar functions with safer alternatives');
      recommendations.push('Use strict Content Security Policy to prevent code execution');
    }

    // XSS
    if (categoryBreakdown['xss'] > 0) {
      recommendations.push('Use DOMPurify or similar libraries for HTML sanitization');
      recommendations.push('Prefer textContent over innerHTML when possible');
      recommendations.push('Implement proper output encoding');
    }

    // Injection
    if (categoryBreakdown['injection'] > 0) {
      recommendations.push('Use parameterized queries for database access');
      recommendations.push('Implement input validation and sanitization');
      recommendations.push('Use prepared statements');
    }

    // File access
    if (categoryBreakdown['file-access'] > 0) {
      recommendations.push('Validate and sanitize file paths');
      recommendations.push('Use allowlists for file operations');
      recommendations.push('Implement proper file permission checks');
    }

    // Crypto
    if (categoryBreakdown['crypto'] > 0) {
      recommendations.push('Use vetted cryptographic libraries');
      recommendations.push('Avoid hardcoded keys and secrets');
      recommendations.push('Implement proper key management');
    }

    // Network
    if (categoryBreakdown['network'] > 0) {
      recommendations.push('Validate URLs before making requests');
      recommendations.push('Implement allowlists for external connections');
      recommendations.push('Use HTTPS for all network communications');
    }

    // System
    if (categoryBreakdown['system'] > 0) {
      recommendations.push('Avoid direct system command execution');
      recommendations.push('Use safe alternatives to subprocess calls');
      recommendations.push('Implement proper input sanitization for commands');
    }

    // General recommendations
    recommendations.push('Enable static analysis in CI/CD pipeline');
    recommendations.push('Conduct regular code reviews for dangerous patterns');
    recommendations.push('Use linters with security rules (ESLint security plugins, etc.)');

    return [...new Set(recommendations)];
  }

  /**
   * Find code files in project
   */
  private async findCodeFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rs', '.rb', '.php', '.cs', '.cpp', '.c'];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory() && !entry.name.includes('node_modules') && !entry.name.includes('.git') && !entry.name.includes('dist')) {
          files.push(...await this.findCodeFiles(fullPath));
        } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    } catch {
      // Ignore errors
    }

    return files;
  }

  /**
   * Initialize dangerous patterns
   */
  private initializePatterns(): void {
    this.patterns = [
      // Code Execution Patterns
      {
        id: 'dp-001',
        name: 'eval() Function',
        description: 'Dynamic code execution using eval()',
        pattern: /eval\s*\(/g,
        category: 'code-execution',
        severity: 'critical',
        language: ['javascript', 'typescript'],
        cwe: 'CWE-95',
        remediation: 'Replace eval() with safer alternatives like JSON.parse() or direct function calls',
      },
      {
        id: 'dp-002',
        name: 'Function() Constructor',
        description: 'Dynamic code execution using Function constructor',
        pattern: /new\s+Function\s*\(/g,
        category: 'code-execution',
        severity: 'critical',
        language: ['javascript', 'typescript'],
        cwe: 'CWE-95',
        remediation: 'Avoid Function constructor, use arrow functions or regular functions',
      },
      {
        id: 'dp-003',
        name: 'setTimeout with String',
        description: 'setTimeout with string argument (code execution)',
        pattern: /setTimeout\s*\(\s*['"]/g,
        category: 'code-execution',
        severity: 'high',
        language: ['javascript', 'typescript'],
        cwe: 'CWE-95',
        remediation: 'Pass function instead of string to setTimeout',
      },
      {
        id: 'dp-004',
        name: 'exec() or eval() in Python',
        description: 'Dynamic code execution in Python',
        pattern: /exec\s*\(|eval\s*\(/g,
        category: 'code-execution',
        severity: 'critical',
        language: ['python'],
        cwe: 'CWE-95',
        remediation: 'Avoid exec() and eval(), use ast.literal_eval() for safe evaluation',
      },
      {
        id: 'dp-005',
        name: 'subprocess with shell=True',
        description: 'Subprocess call with shell=True (command injection)',
        pattern: /subprocess\.(?:call|run|Popen)\([^)]*shell\s*=\s*True/g,
        category: 'code-execution',
        severity: 'critical',
        language: ['python'],
        cwe: 'CWE-78',
        remediation: 'Avoid shell=True, use list of arguments instead',
      },
      {
        id: 'dp-006',
        name: 'os.system()',
        description: 'System command execution',
        pattern: /os\.system\s*\(/g,
        category: 'code-execution',
        severity: 'critical',
        language: ['python'],
        cwe: 'CWE-78',
        remediation: 'Use subprocess module with proper argument list',
      },

      // XSS Patterns
      {
        id: 'dp-007',
        name: 'innerHTML Assignment',
        description: 'Direct innerHTML assignment (XSS risk)',
        pattern: /\.innerHTML\s*=/g,
        category: 'xss',
        severity: 'high',
        language: ['javascript', 'typescript'],
        cwe: 'CWE-79',
        remediation: 'Use textContent or sanitize HTML with DOMPurify',
      },
      {
        id: 'dp-008',
        name: 'document.write()',
        description: 'document.write() with user input (XSS risk)',
        pattern: /document\.write\s*\(/g,
        category: 'xss',
        severity: 'high',
        language: ['javascript', 'typescript'],
        cwe: 'CWE-79',
        remediation: 'Avoid document.write(), use DOM manipulation methods',
      },
      {
        id: 'dp-009',
        name: 'outerHTML Assignment',
        description: 'Direct outerHTML assignment (XSS risk)',
        pattern: /\.outerHTML\s*=/g,
        category: 'xss',
        severity: 'high',
        language: ['javascript', 'typescript'],
        cwe: 'CWE-79',
        remediation: 'Use DOM manipulation methods instead of outerHTML',
      },

      // Injection Patterns
      {
        id: 'dp-010',
        name: 'SQL Query Concatenation',
        description: 'SQL query with string concatenation (SQL injection)',
        pattern: /query\s*\(\s*['"`].*\+/g,
        category: 'injection',
        severity: 'critical',
        language: ['javascript', 'typescript', 'python', 'java'],
        cwe: 'CWE-89',
        remediation: 'Use parameterized queries or prepared statements',
      },
      {
        id: 'dp-011',
        name: 'Template Literal in Query',
        description: 'SQL query with template literal (SQL injection)',
        pattern: /query\s*\(\s*`[^`]*\$\{/g,
        category: 'injection',
        severity: 'critical',
        language: ['javascript', 'typescript'],
        cwe: 'CWE-89',
        remediation: 'Use parameterized queries or ORM',
      },

      // File Access Patterns
      {
        id: 'dp-012',
        name: 'User Input in File Path',
        description: 'User input used in file operations (path traversal)',
        pattern: /fs\.(?:readFile|writeFile|unlink)\s*\([^)]*\$\{/g,
        category: 'file-access',
        severity: 'high',
        language: ['javascript', 'typescript'],
        cwe: 'CWE-22',
        remediation: 'Validate and sanitize file paths, use path.join()',
      },
      {
        id: 'dp-013',
        name: 'open() with User Input',
        description: 'File open with user input (path traversal)',
        pattern: /open\s*\([^)]*\$\{/g,
        category: 'file-access',
        severity: 'high',
        language: ['python'],
        cwe: 'CWE-22',
        remediation: 'Validate file paths, use os.path.abspath() and check if within allowed directory',
      },

      // Crypto Patterns
      {
        id: 'dp-014',
        name: 'Hardcoded API Key',
        description: 'Hardcoded API key or secret',
        pattern: /api[_-]?key\s*[:=]\s*['"`][^'"`]{10,}['"`]/gi,
        category: 'crypto',
        severity: 'critical',
        language: ['javascript', 'typescript', 'python', 'java', 'go'],
        cwe: 'CWE-798',
        remediation: 'Use environment variables or secret management',
      },
      {
        id: 'dp-015',
        name: 'Hardcoded Password',
        description: 'Hardcoded password',
        pattern: /password\s*[:=]\s*['"`][^'"`]{6,}['"`]/gi,
        category: 'crypto',
        severity: 'critical',
        language: ['javascript', 'typescript', 'python', 'java', 'go'],
        cwe: 'CWE-798',
        remediation: 'Use environment variables or secret management',
      },
      {
        id: 'dp-016',
        name: 'MD5 Hash',
        description: 'Use of weak MD5 hash',
        pattern: /md5\s*\(/gi,
        category: 'crypto',
        severity: 'medium',
        language: ['javascript', 'typescript', 'python'],
        cwe: 'CWE-327',
        remediation: 'Use SHA-256 or stronger hashing algorithms',
      },
      {
        id: 'dp-017',
        name: 'SHA1 Hash',
        description: 'Use of weak SHA1 hash',
        pattern: /sha1\s*\(/gi,
        category: 'crypto',
        severity: 'medium',
        language: ['javascript', 'typescript', 'python'],
        cwe: 'CWE-327',
        remediation: 'Use SHA-256 or stronger hashing algorithms',
      },

      // Network Patterns
      {
        id: 'dp-018',
        name: 'HTTP Request with User Input',
        description: 'HTTP request with user input in URL (SSRF)',
        pattern: /fetch\s*\([^)]*\$\{/g,
        category: 'network',
        severity: 'high',
        language: ['javascript', 'typescript'],
        cwe: 'CWE-918',
        remediation: 'Validate and allowlist URLs, use URL parsing',
      },
      {
        id: 'dp-019',
        name: 'requests.get with User Input',
        description: 'HTTP request with user input (SSRF)',
        pattern: /requests\.(?:get|post)\s*\([^)]*\$\{/g,
        category: 'network',
        severity: 'high',
        language: ['python'],
        cwe: 'CWE-918',
        remediation: 'Validate and allowlist URLs, use URL parsing',
      },

      // System Patterns
      {
        id: 'dp-020',
        name: 'child_process.exec',
        description: 'child_process.exec with user input (command injection)',
        pattern: /child_process\.exec\s*\(/g,
        category: 'system',
        severity: 'critical',
        language: ['javascript', 'typescript'],
        cwe: 'CWE-78',
        remediation: 'Use child_process.execFile with array of arguments',
      },
      {
        id: 'dp-021',
        name: 'Runtime.exec',
        description: 'Runtime.exec with user input (command injection)',
        pattern: /Runtime\.getRuntime\(\)\.exec\s*\(/g,
        category: 'system',
        severity: 'critical',
        language: ['java'],
        cwe: 'CWE-78',
        remediation: 'Use ProcessBuilder with proper argument array',
      },
    ];
  }
}
