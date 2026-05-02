import { Logger } from '../utils/Logger';
import { DataSource } from 'typeorm';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface PackageInfo {
  name: string;
  version: string;
  type: 'production' | 'development';
  vulnerabilities?: number;
  outdated?: boolean;
  size?: string;
}

export interface ServiceInfo {
  name: string;
  status: 'running' | 'stopped' | 'unknown';
  pid?: number;
  port?: number;
  memory?: string;
  cpu?: string;
  uptime?: string;
}

export interface NetworkInfo {
  interface: string;
  ip: string;
  mac: string;
  status: 'up' | 'down';
  type: 'ethernet' | 'wifi' | 'loopback';
}

export interface PortInfo {
  port: number;
  protocol: 'tcp' | 'udp';
  state: 'listening' | 'established' | 'time_wait';
  process?: string;
  pid?: number;
}

export interface SystemAnalysisResult {
  packages: {
    total: number;
    production: number;
    development: number;
    vulnerabilities: number;
    outdated: number;
    details: PackageInfo[];
  };
  services: ServiceInfo[];
  network: {
    interfaces: NetworkInfo[];
    openPorts: PortInfo[];
    hostname: string;
    dns?: string[];
  };
  system: {
    platform: string;
    arch: string;
    nodeVersion: string;
    uptime: string;
    totalMemory: string;
    freeMemory: string;
    cpuCores: number;
  };
  analyzedAt: string;
}

/**
 * System Analysis Service
 * 
 * Analyzes system packages, services, and network configuration
 */
export class SystemAnalysisService {
  private logger = Logger.getInstance('SystemAnalysisService');

  constructor(private db: DataSource) {}

  /**
   * Perform comprehensive system analysis
   */
  async analyzeSystem(projectPath?: string): Promise<SystemAnalysisResult> {
    this.logger.info('Starting system analysis');

    const startTime = Date.now();

    try {
      const [packages, services, network, system] = await Promise.all([
        this.analyzePackages(projectPath),
        this.analyzeServices(),
        this.analyzeNetwork(),
        this.analyzeSystemInfo(),
      ]);

      const result: SystemAnalysisResult = {
        packages,
        services,
        network,
        system,
        analyzedAt: new Date().toISOString(),
      };

      this.logger.info(`System analysis completed in ${Date.now() - startTime}ms`);
      return result;
    } catch (error) {
      this.logger.error('System analysis failed', { error });
      throw error;
    }
  }

  /**
   * Analyze project packages
   */
  private async analyzePackages(projectPath?: string): Promise<SystemAnalysisResult['packages']> {
    const packages: PackageInfo[] = [];
    let vulnerabilities = 0;
    let outdated = 0;

    if (!projectPath) {
      // Analyze Vigil itself
      projectPath = process.cwd();
    }

    const packageJsonPath = path.join(projectPath, 'package.json');
    const packageLockPath = path.join(projectPath, 'package-lock.json');

    try {
      // Check if package.json exists
      try {
        await fs.access(packageJsonPath);
      } catch {
        this.logger.warn('package.json not found', { path: packageJsonPath });
        return {
          total: 0,
          production: 0,
          development: 0,
          vulnerabilities: 0,
          outdated: 0,
          details: [],
        };
      }

      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(content);

      const deps = pkg.dependencies || {};
      const devDeps = pkg.devDependencies || {};

      // Production dependencies
      for (const [name, version] of Object.entries(deps)) {
        const vulnCount = await this.checkPackageVulnerabilities(name, version as string);
        const isOutdated = await this.checkPackageOutdated(name, version as string);
        
        if (vulnCount > 0) vulnerabilities++;
        if (isOutdated) outdated++;

        packages.push({
          name,
          version: version as string,
          type: 'production',
          vulnerabilities: vulnCount,
          outdated: isOutdated,
        });
      }

      // Development dependencies
      for (const [name, version] of Object.entries(devDeps)) {
        const vulnCount = await this.checkPackageVulnerabilities(name, version as string);
        const isOutdated = await this.checkPackageOutdated(name, version as string);
        
        if (vulnCount > 0) vulnerabilities++;
        if (isOutdated) outdated++;

        packages.push({
          name,
          version: version as string,
          type: 'development',
          vulnerabilities: vulnCount,
          outdated: isOutdated,
        });
      }

      // Try to get package sizes from package-lock.json
      try {
        const lockContent = await fs.readFile(packageLockPath, 'utf-8');
        const lockPkg = JSON.parse(lockContent);
        
        if (lockPkg.packages) {
          for (const pkg of packages) {
            const lockEntry = Object.values(lockPkg.packages).find(
              (entry: any) => entry.name === pkg.name && entry.version === pkg.version
            );
            if (lockEntry && (lockEntry as any).integrity) {
              pkg.size = 'N/A'; // Size info not directly available in lock file
            }
          }
        }
      } catch {
        // Lock file not available or error reading it
      }
    } catch (error) {
      this.logger.warn('Failed to analyze packages', { error });
    }

    return {
      total: packages.length,
      production: packages.filter(p => p.type === 'production').length,
      development: packages.filter(p => p.type === 'development').length,
      vulnerabilities,
      outdated,
      details: packages,
    };
  }

  /**
   * Check package for known vulnerabilities
   */
  private async checkPackageVulnerabilities(name: string, version: string): Promise<number> {
    // Known vulnerable packages database (simplified)
    const knownVulnerable: Record<string, string[]> = {
      'lodash': ['<4.17.21'],
      'axios': ['<1.6.0'],
      'express-jwt': ['<6.0.0'],
      'jsonwebtoken': ['<9.0.0'],
      'normalize-url': ['<4.5.1'],
      'node-fetch': ['<2.6.7'],
      'tar': ['<6.1.11'],
      'moment': ['<2.29.4'],
      'underscore': ['<1.13.6'],
      'minimist': ['<1.2.6'],
      'async': ['<2.6.4'],
      'ws': ['<7.4.6'],
      'node-forge': ['<1.3.0'],
    };

    const vulnerableVersions = knownVulnerable[name];
    if (!vulnerableVersions) return 0;

    // Simple version check (not semver compliant for simplicity)
    const cleanVersion = version.replace(/^[\^~]/, '');
    for (const range of vulnerableVersions) {
      if (range.startsWith('<') && this.versionCompare(cleanVersion, range.substring(1)) < 0) {
        return 1;
      }
    }

    return 0;
  }

  /**
   * Check if package is outdated
   */
  private async checkPackageOutdated(name: string, version: string): Promise<boolean> {
    // This would typically call npm outdated, but for simplicity we'll use a heuristic
    // In production, you'd want to actually check the npm registry
    return false;
  }

  /**
   * Simple version comparison
   */
  private versionCompare(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 !== p2) return p1 - p2;
    }
    return 0;
  }

  /**
   * Analyze running services
   */
  private async analyzeServices(): Promise<ServiceInfo[]> {
    const services: ServiceInfo[] = [];

    try {
      // Check for common services based on platform
      const platform = os.platform();
      
      if (platform === 'linux' || platform === 'darwin') {
        // Try to get running processes
        try {
          const { stdout } = await execAsync('ps aux');
          const lines = stdout.split('\n').slice(1); // Skip header
          
          // Look for common service names
          const serviceNames = [
            'nginx', 'apache', 'httpd', 'mysql', 'postgres', 'postgresql',
            'redis', 'mongodb', 'docker', 'node', 'pm2', 'systemd'
          ];
          
          for (const serviceName of serviceNames) {
            const matchingLines = lines.filter(line => 
              line.toLowerCase().includes(serviceName.toLowerCase())
            );
            
            if (matchingLines.length > 0) {
              const line = matchingLines[0];
              const parts = line.trim().split(/\s+/);
              const pid = parseInt(parts[1]);
              const cpu = parts[2];
              const mem = parts[3];
              
              services.push({
                name: serviceName,
                status: 'running',
                pid,
                cpu: `${cpu}%`,
                memory: `${mem}%`,
              });
            }
          }
        } catch {
          // ps command failed, skip service analysis
        }
      } else if (platform === 'win32') {
        // Windows service check
        try {
          const { stdout } = await execAsync('tasklist');
          const lines = stdout.split('\n');
          
          const serviceNames = ['node.exe', 'nginx.exe', 'mysqld.exe', 'dockerd.exe'];
          
          for (const serviceName of serviceNames) {
            const matchingLines = lines.filter(line => 
              line.toLowerCase().includes(serviceName.toLowerCase())
            );
            
            if (matchingLines.length > 0) {
              const line = matchingLines[0];
              const parts = line.trim().split(/\s+/);
              const pid = parseInt(parts[1]);
              
              services.push({
                name: serviceName.replace('.exe', ''),
                status: 'running',
                pid,
              });
            }
          }
        } catch {
          // tasklist command failed
        }
      }

      // Always add Node.js if this is a Node process
      services.push({
        name: 'node',
        status: 'running',
        pid: process.pid,
        memory: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
      });
    } catch (error) {
      this.logger.warn('Failed to analyze services', { error });
    }

    return services;
  }

  /**
   * Analyze network configuration
   */
  private async analyzeNetwork(): Promise<SystemAnalysisResult['network']> {
    const interfaces: NetworkInfo[] = [];
    const openPorts: PortInfo[] = [];

    try {
      // Get network interfaces
      const networkInterfaces = os.networkInterfaces();
      
      for (const [ifaceName, addresses] of Object.entries(networkInterfaces)) {
        if (!addresses) continue;
        
        for (const addr of addresses) {
          if (addr.family === 'IPv4' && !addr.internal) {
            interfaces.push({
              interface: ifaceName,
              ip: addr.address,
              mac: addr.mac,
              status: 'up',
              type: ifaceName.toLowerCase().includes('wi') || ifaceName.toLowerCase().includes('wlan') 
                ? 'wifi' 
                : 'ethernet',
            });
          }
        }
      }

      // Add loopback
      interfaces.push({
        interface: 'lo',
        ip: '127.0.0.1',
        mac: '00:00:00:00:00:00',
        status: 'up',
        type: 'loopback',
      });

      // Try to get open ports
      const platform = os.platform();
      if (platform === 'linux' || platform === 'darwin') {
        try {
          const { stdout } = await execAsync('netstat -tuln 2>/dev/null || ss -tuln 2>/dev/null');
          const lines = stdout.split('\n');
          
          for (const line of lines) {
            if (line.includes('LISTEN')) {
              const parts = line.trim().split(/\s+/);
              const addressPart = parts.find(p => p.includes(':'));
              
              if (addressPart) {
                const portMatch = addressPart.match(/:(\d+)/);
                if (portMatch) {
                  const port = parseInt(portMatch[1]);
                  const protocol = line.toLowerCase().includes('tcp') ? 'tcp' : 'udp';
                  
                  openPorts.push({
                    port,
                    protocol,
                    state: 'listening',
                  });
                }
              }
            }
          }
        } catch {
          // netstat/ss command failed
        }
      }

    } catch (error) {
      this.logger.warn('Failed to analyze network', { error });
    }

    // Get DNS configuration
    let dns: string[] | undefined;
    try {
      const resolvConf = await fs.readFile('/etc/resolv.conf', 'utf-8');
      const dnsLines = resolvConf.split('\n')
        .filter(line => line.trim().startsWith('nameserver'))
        .map(line => line.trim().split(/\s+/)[1]);
      dns = dnsLines.filter(Boolean);
    } catch {
      // /etc/resolv.conf not available
    }

    return {
      interfaces,
      openPorts,
      hostname: os.hostname(),
      dns,
    };
  }

  /**
   * Analyze system information
   */
  private async analyzeSystemInfo(): Promise<SystemAnalysisResult['system']> {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    return {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      uptime: this.formatUptime(os.uptime()),
      totalMemory: this.formatBytes(totalMemory),
      freeMemory: this.formatBytes(freeMemory),
      cpuCores: os.cpus().length,
    };
  }

  /**
   * Format uptime
   */
  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  /**
   * Format bytes
   */
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
      bytes /= 1024;
      i++;
    }
    return `${bytes.toFixed(1)} ${units[i]}`;
  }
}
