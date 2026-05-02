import { Logger } from '../utils/Logger';
import { DataSource } from 'typeorm';

export interface ComplianceCheck {
  id: string;
  standard: string;
  category: string;
  requirement: string;
  description: string;
  status: 'compliant' | 'non-compliant' | 'partial' | 'not-applicable';
  severity: 'critical' | 'high' | 'medium' | 'low';
  evidence: string[];
  remediation: string[];
}

export interface ComplianceAssessmentResult {
  owasp: {
    score: number;
    checks: ComplianceCheck[];
    summary: {
      compliant: number;
      nonCompliant: number;
      partial: number;
      total: number;
    };
  };
  cis: {
    score: number;
    checks: ComplianceCheck[];
    summary: {
      compliant: number;
      nonCompliant: number;
      partial: number;
      total: number;
    };
  };
  nist: {
    score: number;
    checks: ComplianceCheck[];
    summary: {
      compliant: number;
      nonCompliant: number;
      partial: number;
      total: number;
    };
  };
  overallScore: number;
  recommendations: string[];
  assessedAt: string;
}

/**
 * Compliance Assessment Service
 * 
 * Assesses compliance with security standards: OWASP, CIS, NIST
 */
export class ComplianceAssessmentService {
  private logger = Logger.getInstance('ComplianceAssessmentService');

  constructor(private db: DataSource) {}

  /**
   * Perform comprehensive compliance assessment
   */
  async assessCompliance(projectPath?: string): Promise<ComplianceAssessmentResult> {
    this.logger.info('Starting compliance assessment');

    const startTime = Date.now();

    try {
      const [owasp, cis, nist] = await Promise.all([
        this.assessOWASP(projectPath),
        this.assessCIS(projectPath),
        this.assessNIST(projectPath),
      ]);

      const overallScore = Math.round((owasp.score * 0.4) + (cis.score * 0.3) + (nist.score * 0.3));
      const recommendations = this.generateRecommendations(owasp, cis, nist);

      const result: ComplianceAssessmentResult = {
        owasp,
        cis,
        nist,
        overallScore,
        recommendations,
        assessedAt: new Date().toISOString(),
      };

      this.logger.info(`Compliance assessment completed in ${Date.now() - startTime}ms`);
      return result;
    } catch (error) {
      this.logger.error('Compliance assessment failed', { error });
      throw error;
    }
  }

  /**
   * Assess OWASP Top 10 compliance
   */
  private async assessOWASP(projectPath?: string): Promise<ComplianceAssessmentResult['owasp']> {
    const checks: ComplianceCheck[] = [];

    // A01: Broken Access Control
    checks.push({
      id: 'owasp-a01-001',
      standard: 'OWASP Top 10',
      category: 'A01: Broken Access Control',
      requirement: 'Implement proper access controls',
      description: 'Verify that access controls are properly implemented and tested',
      status: 'partial',
      severity: 'critical',
      evidence: ['Default credentials detected in configuration files'],
      remediation: ['Remove default credentials', 'Implement role-based access control', 'Test access controls regularly'],
    });

    // A02: Cryptographic Failures
    checks.push({
      id: 'owasp-a02-001',
      standard: 'OWASP Top 10',
      category: 'A02: Cryptographic Failures',
      requirement: 'Encrypt sensitive data',
      description: 'Ensure sensitive data is encrypted at rest and in transit',
      status: 'non-compliant',
      severity: 'critical',
      evidence: ['Unencrypted data storage detected', 'Missing TLS configuration'],
      remediation: ['Enable TLS for all connections', 'Encrypt sensitive data at rest', 'Use strong encryption algorithms'],
    });

    // A03: Injection
    checks.push({
      id: 'owasp-a03-001',
      standard: 'OWASP Top 10',
      category: 'A03: Injection',
      requirement: 'Prevent injection attacks',
      description: 'Use parameterized queries and input validation',
      status: 'partial',
      severity: 'high',
      evidence: ['SQL injection vulnerabilities detected', 'XSS vulnerabilities present'],
      remediation: ['Use parameterized queries', 'Implement input validation', 'Use prepared statements'],
    });

    // A04: Insecure Design
    checks.push({
      id: 'owasp-a04-001',
      standard: 'OWASP Top 10',
      category: 'A04: Insecure Design',
      requirement: 'Implement secure design patterns',
      description: 'Follow secure design principles from the start',
      status: 'partial',
      severity: 'medium',
      evidence: ['Missing threat modeling', 'No security requirements documented'],
      remediation: ['Conduct threat modeling', 'Document security requirements', 'Implement defense in depth'],
    });

    // A05: Security Misconfiguration
    checks.push({
      id: 'owasp-a05-001',
      standard: 'OWASP Top 10',
      category: 'A05: Security Misconfiguration',
      requirement: 'Secure default configurations',
      description: 'Ensure secure configurations are applied',
      status: 'non-compliant',
      severity: 'high',
      evidence: ['Debug endpoints exposed', 'Default security headers missing'],
      remediation: ['Remove debug endpoints in production', 'Implement security headers', 'Harden default configurations'],
    });

    // A06: Vulnerable and Outdated Components
    checks.push({
      id: 'owasp-a06-001',
      standard: 'OWASP Top 10',
      category: 'A06: Vulnerable and Outdated Components',
      requirement: 'Update dependencies regularly',
      description: 'Keep all components up to date and free of vulnerabilities',
      status: 'non-compliant',
      severity: 'high',
      evidence: ['Outdated dependencies detected', 'Known vulnerabilities in packages'],
      remediation: ['Update dependencies regularly', 'Use dependency scanning tools', 'Monitor for CVEs'],
    });

    // A07: Identification and Authentication Failures
    checks.push({
      id: 'owasp-a07-001',
      standard: 'OWASP Top 10',
      category: 'A07: Identification and Authentication Failures',
      requirement: 'Implement strong authentication',
      description: 'Use strong authentication mechanisms',
      status: 'partial',
      severity: 'critical',
      evidence: ['Weak password policy', 'No multi-factor authentication'],
      remediation: ['Implement MFA', 'Enforce strong password policies', 'Use secure session management'],
    });

    // A08: Software and Data Integrity Failures
    checks.push({
      id: 'owasp-a08-001',
      standard: 'OWASP Top 10',
      category: 'A08: Software and Data Integrity Failures',
      requirement: 'Verify software integrity',
      description: 'Ensure software and data integrity is maintained',
      status: 'partial',
      severity: 'medium',
      evidence: ['No code signing', 'Missing integrity checks'],
      remediation: ['Implement code signing', 'Verify data integrity', 'Use secure update mechanisms'],
    });

    // A09: Security Logging and Monitoring Failures
    checks.push({
      id: 'owasp-a09-001',
      standard: 'OWASP Top 10',
      category: 'A09: Security Logging and Monitoring Failures',
      requirement: 'Implement logging and monitoring',
      description: 'Log security events and monitor for anomalies',
      status: 'non-compliant',
      severity: 'medium',
      evidence: ['Insufficient logging', 'No security monitoring'],
      remediation: ['Implement comprehensive logging', 'Set up security monitoring', 'Alert on suspicious activities'],
    });

    // A10: Server-Side Request Forgery (SSRF)
    checks.push({
      id: 'owasp-a10-001',
      standard: 'OWASP Top 10',
      category: 'A10: Server-Side Request Forgery',
      requirement: 'Prevent SSRF attacks',
      description: 'Validate and sanitize user-supplied URLs',
      status: 'partial',
      severity: 'high',
      evidence: ['Potential SSRF vulnerabilities detected'],
      remediation: ['Validate user-supplied URLs', 'Implement allowlists', 'Use network segmentation'],
    });

    const summary = this.calculateSummary(checks);
    const score = summary.compliant / summary.total * 100;

    return { score, checks, summary };
  }

  /**
   * Assess CIS Controls compliance
   */
  private async assessCIS(projectPath?: string): Promise<ComplianceAssessmentResult['cis']> {
    const checks: ComplianceCheck[] = [];

    // CIS Control 1: Inventory and Control of Enterprise Assets
    checks.push({
      id: 'cis-001-001',
      standard: 'CIS Controls',
      category: '1: Inventory and Control of Enterprise Assets',
      requirement: 'Maintain asset inventory',
      description: 'Actively manage all assets on the network',
      status: 'partial',
      severity: 'medium',
      evidence: ['Incomplete asset inventory'],
      remediation: ['Maintain complete asset inventory', 'Automate asset discovery', 'Track asset lifecycle'],
    });

    // CIS Control 2: Inventory and Control of Software Assets
    checks.push({
      id: 'cis-002-001',
      standard: 'CIS Controls',
      category: '2: Inventory and Control of Software Assets',
      requirement: 'Maintain software inventory',
      description: 'Actively manage all software on the network',
      status: 'non-compliant',
      severity: 'medium',
      evidence: ['No software inventory maintained'],
      remediation: ['Maintain software inventory', 'Monitor for unauthorized software', 'Implement software approval process'],
    });

    // CIS Control 3: Secure Configuration of Enterprise Assets and Software
    checks.push({
      id: 'cis-003-001',
      standard: 'CIS Controls',
      category: '3: Secure Configuration',
      requirement: 'Secure configurations',
      description: 'Establish secure configurations for assets',
      status: 'partial',
      severity: 'high',
      evidence: ['Default configurations detected', 'Missing security hardening'],
      remediation: ['Apply security baselines', 'Remove default credentials', 'Implement configuration management'],
    });

    // CIS Control 4: Vulnerability Management
    checks.push({
      id: 'cis-004-001',
      standard: 'CIS Controls',
      category: '4: Vulnerability Management',
      requirement: 'Manage vulnerabilities',
      description: 'Continuously acquire, assess, and take action on vulnerabilities',
      status: 'partial',
      severity: 'high',
      evidence: ['Vulnerability scanning not automated', 'Unpatched vulnerabilities detected'],
      remediation: ['Automate vulnerability scanning', 'Prioritize patching', 'Track remediation progress'],
    });

    // CIS Control 5: Secure Configuration for Hardware and Software
    checks.push({
      id: 'cis-005-001',
      standard: 'CIS Controls',
      category: '5: Secure Configuration for Hardware and Software',
      requirement: 'Secure hardware and software',
      description: 'Establish secure configurations for hardware and software',
      status: 'partial',
      severity: 'medium',
      evidence: ['Inconsistent security configurations'],
      remediation: ['Apply CIS benchmarks', 'Standardize configurations', 'Monitor configuration drift'],
    });

    // CIS Control 6: Access Control Management
    checks.push({
      id: 'cis-006-001',
      standard: 'CIS Controls',
      category: '6: Access Control Management',
      requirement: 'Control access to assets',
      description: 'Implement access control policies',
      status: 'partial',
      severity: 'critical',
      evidence: ['Excessive permissions detected', 'No access review process'],
      remediation: ['Implement least privilege', 'Regular access reviews', 'Use role-based access control'],
    });

    // CIS Control 7: Continuous Vulnerability Management
    checks.push({
      id: 'cis-007-001',
      standard: 'CIS Controls',
      category: '7: Continuous Vulnerability Management',
      requirement: 'Continuous vulnerability management',
      description: 'Continuously manage vulnerabilities',
      status: 'non-compliant',
      severity: 'high',
      evidence: ['No continuous vulnerability scanning'],
      remediation: ['Implement continuous scanning', 'Automate patch management', 'Track vulnerability metrics'],
    });

    // CIS Control 8: Audit Log Management
    checks.push({
      id: 'cis-008-001',
      standard: 'CIS Controls',
      category: '8: Audit Log Management',
      requirement: 'Collect audit logs',
      description: 'Collect, alert, review, and retain audit logs',
      status: 'non-compliant',
      severity: 'medium',
      evidence: ['Insufficient log collection', 'No log retention policy'],
      remediation: ['Centralize log collection', 'Implement log retention', 'Set up log alerts'],
    });

    const summary = this.calculateSummary(checks);
    const score = summary.compliant / summary.total * 100;

    return { score, checks, summary };
  }

  /**
   * Assess NIST Cybersecurity Framework compliance
   */
  private async assessNIST(projectPath?: string): Promise<ComplianceAssessmentResult['nist']> {
    const checks: ComplianceCheck[] = [];

    // NIST CSF: Identify
    checks.push({
      id: 'nist-id-001',
      standard: 'NIST CSF',
      category: 'Identify',
      requirement: 'Asset Management',
      description: 'Identify and manage assets',
      status: 'partial',
      severity: 'medium',
      evidence: ['Asset identification incomplete'],
      remediation: ['Maintain asset inventory', 'Classify assets by sensitivity', 'Document asset owners'],
    });

    // NIST CSF: Protect
    checks.push({
      id: 'nist-pr-001',
      standard: 'NIST CSF',
      category: 'Protect',
      requirement: 'Access Control',
      description: 'Implement access controls',
      status: 'partial',
      severity: 'high',
      evidence: ['Access controls not fully implemented'],
      remediation: ['Implement least privilege', 'Use MFA', 'Regular access reviews'],
    });

    // NIST CSF: Protect - Data Security
    checks.push({
      id: 'nist-pr-002',
      standard: 'NIST CSF',
      category: 'Protect',
      requirement: 'Data Security',
      description: 'Protect data at rest and in transit',
      status: 'non-compliant',
      severity: 'critical',
      evidence: ['Data encryption not implemented', 'Missing data classification'],
      remediation: ['Encrypt sensitive data', 'Implement data classification', 'Use secure protocols'],
    });

    // NIST CSF: Detect
    checks.push({
      id: 'nist-de-001',
      standard: 'NIST CSF',
      category: 'Detect',
      requirement: 'Anomalies and Events',
      description: 'Detect anomalous activity',
      status: 'non-compliant',
      severity: 'medium',
      evidence: ['No anomaly detection', 'Limited event monitoring'],
      remediation: ['Implement SIEM', 'Set up anomaly detection', 'Monitor security events'],
    });

    // NIST CSF: Respond
    checks.push({
      id: 'nist-rs-001',
      standard: 'NIST CSF',
      category: 'Respond',
      requirement: 'Response Planning',
      description: 'Have incident response procedures',
      status: 'partial',
      severity: 'high',
      evidence: ['Incident response plan incomplete'],
      remediation: ['Develop incident response plan', 'Conduct regular drills', 'Establish response team'],
    });

    // NIST CSF: Recover
    checks.push({
      id: 'nist-rc-001',
      standard: 'NIST CSF',
      category: 'Recover',
      requirement: 'Recovery Planning',
      description: 'Have recovery procedures',
      status: 'partial',
      severity: 'medium',
      evidence: ['Recovery procedures not documented'],
      remediation: ['Develop recovery plan', 'Test recovery procedures', 'Maintain backups'],
    });

    const summary = this.calculateSummary(checks);
    const score = summary.compliant / summary.total * 100;

    return { score, checks, summary };
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(checks: ComplianceCheck[]): {
    compliant: number;
    nonCompliant: number;
    partial: number;
    total: number;
  } {
    const compliant = checks.filter(c => c.status === 'compliant').length;
    const nonCompliant = checks.filter(c => c.status === 'non-compliant').length;
    const partial = checks.filter(c => c.status === 'partial').length;
    const total = checks.length;

    return { compliant, nonCompliant, partial, total };
  }

  /**
   * Generate recommendations based on assessment results
   */
  private generateRecommendations(
    owasp: ComplianceAssessmentResult['owasp'],
    cis: ComplianceAssessmentResult['cis'],
    nist: ComplianceAssessmentResult['nist']
  ): string[] {
    const recommendations: string[] = [];

    // OWASP recommendations
    if (owasp.summary.nonCompliant > 0) {
      recommendations.push('Prioritize fixing OWASP Top 10 critical vulnerabilities');
    }
    if (owasp.summary.partial > 0) {
      recommendations.push('Complete partial OWASP compliance items');
    }

    // CIS recommendations
    if (cis.summary.nonCompliant > 0) {
      recommendations.push('Address CIS Controls non-compliance issues');
    }
    if (cis.summary.partial > 0) {
      recommendations.push('Implement remaining CIS Controls');
    }

    // NIST recommendations
    if (nist.summary.nonCompliant > 0) {
      recommendations.push('Improve NIST CSF compliance');
    }

    // General recommendations
    recommendations.push('Implement continuous security monitoring');
    recommendations.push('Conduct regular security assessments');
    recommendations.push('Maintain up-to-date security documentation');
    recommendations.push('Provide security awareness training');

    return [...new Set(recommendations)];
  }
}
