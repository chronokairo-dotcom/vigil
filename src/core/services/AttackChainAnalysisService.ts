import { Logger } from '../utils/Logger';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

export interface AttackChainNode {
  id: string;
  vulnerabilityId: string;
  title: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  description: string;
  location?: string;
}

export interface AttackChainEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  condition: string;
  likelihood: number;
  description: string;
}

export interface AttackChain {
  id: string;
  name: string;
  description: string;
  nodes: AttackChainNode[];
  edges: AttackChainEdge[];
  startNode: string;
  endNode: string;
  totalSteps: number;
  overallRisk: 'critical' | 'high' | 'medium' | 'low';
  impact: string[];
  likelihood: number;
  confidence: number;
}

export interface AttackChainAnalysisResult {
  chains: AttackChain[];
  summary: {
    totalChains: number;
    criticalChains: number;
    highRiskChains: number;
    mediumRiskChains: number;
    lowRiskChains: number;
    longestChain: number;
    averageChainLength: number;
  };
  commonPatterns: string[];
  recommendations: string[];
  analyzedAt: string;
}

/**
 * Attack Chain Analysis Service
 * 
 * Analyzes how vulnerabilities can be chained together to form attack paths
 */
export class AttackChainAnalysisService {
  private logger = Logger.getInstance('AttackChainAnalysisService');

  constructor(private db: DataSource) {}

  /**
   * Perform attack chain analysis
   */
  async analyzeAttackChains(vulnerabilities: any[]): Promise<AttackChainAnalysisResult> {
    this.logger.info('Starting attack chain analysis');

    const startTime = Date.now();

    try {
      const chains: AttackChain[] = [];

      // Group vulnerabilities by category
      const groupedVulns = this.groupVulnerabilities(vulnerabilities);

      // Generate attack chains based on common patterns
      chains.push(...this.generateChainsFromVulnerabilities(vulnerabilities, groupedVulns));

      // Calculate summary statistics
      const summary = this.calculateSummary(chains);

      // Identify common patterns
      const commonPatterns = this.identifyCommonPatterns(chains);

      // Generate recommendations
      const recommendations = this.generateChainRecommendations(chains);

      const result: AttackChainAnalysisResult = {
        chains,
        summary,
        commonPatterns,
        recommendations,
        analyzedAt: new Date().toISOString(),
      };

      this.logger.info(`Attack chain analysis completed in ${Date.now() - startTime}ms`);
      return result;
    } catch (error) {
      this.logger.error('Attack chain analysis failed', { error });
      throw error;
    }
  }

  /**
   * Group vulnerabilities by category
   */
  private groupVulnerabilities(vulnerabilities: any[]): Map<string, any[]> {
    const grouped = new Map<string, any[]>();

    for (const vuln of vulnerabilities) {
      const category = vuln.category || vuln.type || 'general';
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(vuln);
    }

    return grouped;
  }

  /**
   * Generate attack chains from vulnerabilities
   */
  private generateChainsFromVulnerabilities(vulnerabilities: any[], grouped: Map<string, any[]>): AttackChain[] {
    const chains: AttackChain[] = [];

    // Chain 1: Reconnaissance → Authentication Bypass → Privilege Escalation → Data Exfiltration
    const reconVulns = grouped.get('auth-bypass') || [];
    const privEscVulns = grouped.get('privilege-escalation') || [];
    const dataExfilVulns = grouped.get('data-exfiltration') || [];

    if (reconVulns.length > 0 && privEscVulns.length > 0) {
      chains.push(this.createChain(
        'Authentication to Data Exfiltration',
        'Chain vulnerabilities from authentication bypass to data exfiltration',
        [
          this.createNode(reconVulns[0], 'Initial Access'),
          this.createNode(privEscVulns[0], 'Privilege Escalation'),
          ...(dataExfilVulns.length > 0 ? [this.createNode(dataExfilVulns[0], 'Data Exfiltration')] : []),
        ],
        'critical'
      ));
    }

    // Chain 2: SQL Injection → Data Access → Credential Theft → Lateral Movement
    const sqlVulns = grouped.get('sql-injection') || [];
    const injectionVulns = grouped.get('injection') || [];

    if (sqlVulns.length > 0 || injectionVulns.length > 0) {
      const baseVuln = sqlVulns[0] || injectionVulns[0];
      chains.push(this.createChain(
        'SQL Injection to Lateral Movement',
        'Exploit SQL injection to access data and move laterally',
        [
          this.createNode(baseVuln, 'SQL Injection'),
          this.createSimulatedNode('Data Access', 'medium', 'Access sensitive database records'),
          this.createSimulatedNode('Credential Theft', 'high', 'Extract credentials from database'),
          this.createSimulatedNode('Lateral Movement', 'critical', 'Use credentials to access other systems'),
        ],
        'critical'
      ));
    }

    // Chain 3: XSS → Session Hijacking → CSRF → Account Takeover
    const xssVulns = grouped.get('xss') || [];

    if (xssVulns.length > 0) {
      chains.push(this.createChain(
        'XSS to Account Takeover',
        'Chain XSS vulnerabilities to achieve account takeover',
        [
          this.createNode(xssVulns[0], 'Cross-Site Scripting'),
          this.createSimulatedNode('Session Hijacking', 'high', 'Steal user session cookies'),
          this.createSimulatedNode('CSRF', 'medium', 'Perform actions on behalf of user'),
          this.createSimulatedNode('Account Takeover', 'critical', 'Gain full account control'),
        ],
        'high'
      ));
    }

    // Chain 4: SSRF → Internal Network Access → Service Exploitation → RCE
    const ssrfVulns = grouped.get('ssrf') || [];
    const rceVulns = grouped.get('rce') || [];

    if (ssrfVulns.length > 0) {
      chains.push(this.createChain(
        'SSRF to Remote Code Execution',
        'Chain SSRF to achieve remote code execution',
        [
          this.createNode(ssrfVulns[0], 'Server-Side Request Forgery'),
          this.createSimulatedNode('Internal Network Access', 'high', 'Access internal services'),
          this.createSimulatedNode('Service Exploitation', 'high', 'Exploit vulnerable internal service'),
          ...(rceVulns.length > 0 ? [this.createNode(rceVulns[0], 'Remote Code Execution')] : [this.createSimulatedNode('Remote Code Execution', 'critical', 'Achieve code execution')]),
        ],
        'critical'
      ));
    }

    // Chain 5: Path Traversal → File Read → Configuration Disclosure → System Compromise
    const pathTraversalVulns = grouped.get('path-traversal') || [];

    if (pathTraversalVulns.length > 0) {
      chains.push(this.createChain(
        'Path Traversal to System Compromise',
        'Chain path traversal to compromise system',
        [
          this.createNode(pathTraversalVulns[0], 'Path Traversal'),
          this.createSimulatedNode('File Read', 'medium', 'Read sensitive files'),
          this.createSimulatedNode('Configuration Disclosure', 'high', 'Access configuration files'),
          this.createSimulatedNode('System Compromise', 'critical', 'Compromise entire system'),
        ],
        'high'
      ));
    }

    // Chain 6: Deserialization → RCE → Privilege Escalation → Persistence
    const deserializationVulns = grouped.get('deserialization') || [];

    if (deserializationVulns.length > 0) {
      chains.push(this.createChain(
        'Deserialization to Persistence',
        'Chain deserialization vulnerabilities to establish persistence',
        [
          this.createNode(deserializationVulns[0], 'Unsafe Deserialization'),
          this.createSimulatedNode('Remote Code Execution', 'critical', 'Execute arbitrary code'),
          this.createSimulatedNode('Privilege Escalation', 'high', 'Escalate privileges'),
          this.createSimulatedNode('Persistence', 'critical', 'Establish persistent access'),
        ],
        'critical'
      ));
    }

    // Chain 7: Weak Authentication → Brute Force → Account Compromise → Data Breach
    const authVulns = grouped.get('auth-bypass') || [];

    if (authVulns.length > 0) {
      chains.push(this.createChain(
        'Weak Authentication to Data Breach',
        'Chain weak authentication to cause data breach',
        [
          this.createNode(authVulns[0], 'Weak Authentication'),
          this.createSimulatedNode('Brute Force', 'medium', 'Brute force credentials'),
          this.createSimulatedNode('Account Compromise', 'high', 'Compromise user accounts'),
          this.createSimulatedNode('Data Breach', 'critical', 'Exfiltrate sensitive data'),
        ],
        'high'
      ));
    }

    return chains;
  }

  /**
   * Create an attack chain
   */
  private createChain(
    name: string,
    description: string,
    nodes: AttackChainNode[],
    overallRisk: 'critical' | 'high' | 'medium' | 'low'
  ): AttackChain {
    const edges: AttackChainEdge[] = [];

    // Create edges between consecutive nodes
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({
        id: uuidv4(),
        fromNodeId: nodes[i].id,
        toNodeId: nodes[i + 1].id,
        condition: 'Successful exploitation',
        likelihood: 0.7,
        description: `If ${nodes[i].title} is exploited, can lead to ${nodes[i + 1].title}`,
      });
    }

    const criticalCount = nodes.filter(n => n.severity === 'critical').length;
    const likelihood = Math.min(0.95, 0.5 + (criticalCount * 0.15));
    const confidence = Math.min(0.9, 0.6 + (nodes.length * 0.05));

    return {
      id: uuidv4(),
      name,
      description,
      nodes,
      edges,
      startNode: nodes[0].id,
      endNode: nodes[nodes.length - 1].id,
      totalSteps: nodes.length,
      overallRisk,
      impact: this.assessChainImpact(nodes),
      likelihood,
      confidence,
    };
  }

  /**
   * Create a node from a vulnerability
   */
  private createNode(vuln: any, stepName: string): AttackChainNode {
    return {
      id: vuln.id || uuidv4(),
      vulnerabilityId: vuln.id || uuidv4(),
      title: stepName,
      type: vuln.type || 'unknown',
      severity: vuln.severity || 'medium',
      category: vuln.category || 'general',
      description: vuln.description || stepName,
      location: vuln.location?.file,
    };
  }

  /**
   * Create a simulated node
   */
  private createSimulatedNode(
    title: string,
    severity: 'critical' | 'high' | 'medium' | 'low',
    description: string
  ): AttackChainNode {
    return {
      id: uuidv4(),
      vulnerabilityId: uuidv4(),
      title,
      type: 'simulated',
      severity,
      category: 'chain-step',
      description,
    };
  }

  /**
   * Assess chain impact
   */
  private assessChainImpact(nodes: AttackChainNode[]): string[] {
    const impacts: string[] = [];

    for (const node of nodes) {
      if (node.severity === 'critical') {
        if (node.title.includes('Data')) impacts.push('Data breach');
        if (node.title.includes('Code')) impacts.push('Remote code execution');
        if (node.title.includes('Privilege')) impacts.push('Privilege escalation');
        if (node.title.includes('Account')) impacts.push('Account takeover');
      }
    }

    if (impacts.length === 0) {
      impacts.push('Security compromise');
    }

    return [...new Set(impacts)];
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(chains: AttackChain[]): AttackChainAnalysisResult['summary'] {
    const totalChains = chains.length;
    const criticalChains = chains.filter(c => c.overallRisk === 'critical').length;
    const highRiskChains = chains.filter(c => c.overallRisk === 'high').length;
    const mediumRiskChains = chains.filter(c => c.overallRisk === 'medium').length;
    const lowRiskChains = chains.filter(c => c.overallRisk === 'low').length;

    const chainLengths = chains.map(c => c.totalSteps);
    const longestChain = Math.max(...chainLengths, 0);
    const averageChainLength = chainLengths.length > 0 
      ? Math.round(chainLengths.reduce((a, b) => a + b, 0) / chainLengths.length)
      : 0;

    return {
      totalChains,
      criticalChains,
      highRiskChains,
      mediumRiskChains,
      lowRiskChains,
      longestChain,
      averageChainLength,
    };
  }

  /**
   * Identify common patterns in chains
   */
  private identifyCommonPatterns(chains: AttackChain[]): string[] {
    const patterns: string[] = [];

    const nodeTypes = chains.flatMap(c => c.nodes.map(n => n.category));
    const typeCounts = new Map<string, number>();

    for (const type of nodeTypes) {
      typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    }

    // Identify most common patterns
    for (const [type, count] of typeCounts) {
      if (count >= 2) {
        patterns.push(`${type} appears in ${count} chains`);
      }
    }

    // Add general patterns
    if (chains.some(c => c.nodes.some(n => n.category === 'auth-bypass'))) {
      patterns.push('Authentication bypass is a common entry point');
    }
    if (chains.some(c => c.nodes.some(n => n.category === 'privilege-escalation'))) {
      patterns.push('Privilege escalation frequently occurs in chains');
    }
    if (chains.some(c => c.nodes.some(n => n.category === 'data-exfiltration'))) {
      patterns.push('Data exfiltration is a common end goal');
    }

    return [...new Set(patterns)];
  }

  /**
   * Generate chain-based recommendations
   */
  private generateChainRecommendations(chains: AttackChain[]): string[] {
    const recommendations: string[] = [];

    // Critical chains
    const criticalChains = chains.filter(c => c.overallRisk === 'critical');
    if (criticalChains.length > 0) {
      recommendations.push(`Address ${criticalChains.length} critical attack chains immediately`);
      recommendations.push('Implement defense in depth to break critical chains');
    }

    // Long chains
    const longChains = chains.filter(c => c.totalSteps >= 4);
    if (longChains.length > 0) {
      recommendations.push('Break long attack chains by adding security controls at multiple points');
    }

    // Common entry points
    const entryPoints = chains.map(c => c.nodes[0].category);
    const commonEntries = this.getMostCommon(entryPoints);
    for (const entry of commonEntries) {
      recommendations.push(`Strengthen defenses against ${entry} vulnerabilities`);
    }

    // General recommendations
    recommendations.push('Implement security monitoring to detect multi-stage attacks');
    recommendations.push('Use anomaly detection to identify unusual attack patterns');
    recommendations.push('Conduct regular red team exercises to test attack chains');
    recommendations.push('Implement automated attack path analysis in CI/CD');

    return [...new Set(recommendations)];
  }

  /**
   * Get most common items
   */
  private getMostCommon(items: string[]): string[] {
    const counts = new Map<string, number>();
    for (const item of items) {
      counts.set(item, (counts.get(item) || 0) + 1);
    }

    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(e => e[0]);

    return sorted;
  }
}
