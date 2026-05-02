/**
 * Metrics Monitoring CLI Commands
 * 
 * Commands for viewing metrics, alerts, and performance data
 */

import { Command } from 'commander';
import { getAdvancedFactory } from '../../api/server';

export function registerMetricsCommands(program: Command): void {
  const metricsCommand = program.command('metrics').description('View system metrics');

  /**
   * metrics get [period]
   */
  metricsCommand
    .command('get [period]')
    .description('Get metrics for time period')
    .action(async (period = 'hour', options) => {
      try {
        const factory = getAdvancedFactory();
        if (!factory) {
          console.error('Error: Advanced features not initialized');
          process.exit(1);
        }

        const service = factory.getMetrics();
        if (!service) {
          console.error('Error: Metrics service not available');
          process.exit(1);
        }

        const metrics = service.getMetrics(period as 'hour' | 'day' | 'week');

        console.log(`\nMetrics (${period}):`);
        console.log(`  Total Tasks: ${metrics.totalTasks}`);
        console.log(`  Success Count: ${metrics.successCount}`);
        console.log(`  Failure Count: ${metrics.failureCount}`);
        console.log(`  Success Rate: ${metrics.successRate.toFixed(2)}%`);
        console.log(`  Error Rate: ${metrics.errorRate.toFixed(2)}%`);
        console.log(`  Avg Duration: ${metrics.avgDuration.toFixed(0)}ms`);
        console.log(`  Avg Tokens: ${metrics.avgTokensUsed?.toFixed(0) || 'N/A'}`);

        if (metrics.byAgent) {
          console.log('\n  By Agent:');
          Object.entries(metrics.byAgent).forEach(([role, stats]) => {
            console.log(
              `    ${role}: ${stats.count} (${((stats.count / metrics.totalTasks) * 100).toFixed(1)}%)`
            );
          });
        }
      } catch (error) {
        console.error('Error getting metrics:', error);
        process.exit(1);
      }
    });

  /**
   * metrics pipeline --id <pipelineId>
   */
  metricsCommand
    .command('pipeline')
    .description('Get metrics for specific pipeline')
    .requiredOption('--id <pipelineId>', 'Pipeline ID')
    .action(async (options) => {
      try {
        const factory = getAdvancedFactory();
        if (!factory) {
          console.error('Error: Advanced features not initialized');
          process.exit(1);
        }

        const service = factory.getMetrics();
        if (!service) {
          console.error('Error: Metrics service not available');
          process.exit(1);
        }

        const metrics = service.getPipelineMetrics(options.id);

        console.log(`\nPipeline Metrics: ${options.id}`);
        console.log(`  Total Tasks: ${metrics.totalTasks}`);
        console.log(`  Success Rate: ${metrics.successRate.toFixed(2)}%`);
        console.log(`  Avg Duration: ${metrics.avgDuration.toFixed(0)}ms`);
      } catch (error) {
        console.error('Error getting pipeline metrics:', error);
        process.exit(1);
      }
    });

  /**
   * metrics alerts
   */
  metricsCommand
    .command('alerts')
    .description('Show active alerts')
    .action(async (options) => {
      try {
        const factory = getAdvancedFactory();
        if (!factory) {
          console.error('Error: Advanced features not initialized');
          process.exit(1);
        }

        const service = factory.getMetrics();
        if (!service) {
          console.error('Error: Metrics service not available');
          process.exit(1);
        }

        const alerts = service.getActiveAlerts();

        if (alerts.length === 0) {
          console.log('No active alerts');
          return;
        }

        console.log(`\nActive Alerts (${alerts.length}):`);
        alerts.forEach((alert) => {
          console.log(`  [${alert.type.toUpperCase()}] ${alert.message}`);
          console.log(`    ID: ${alert.id}`);
          console.log(`    Severity: ${alert.severity}`);
          console.log(`    Created: ${alert.createdAt.toLocaleString()}`);
        });
      } catch (error) {
        console.error('Error getting alerts:', error);
        process.exit(1);
      }
    });

  /**
   * metrics alert-resolve --id <alertId>
   */
  metricsCommand
    .command('alert-resolve')
    .description('Resolve alert')
    .requiredOption('--id <alertId>', 'Alert ID')
    .action(async (options) => {
      try {
        const factory = getAdvancedFactory();
        if (!factory) {
          console.error('Error: Advanced features not initialized');
          process.exit(1);
        }

        const service = factory.getMetrics();
        if (!service) {
          console.error('Error: Metrics service not available');
          process.exit(1);
        }

        service.resolveAlert(options.id);
        console.log(`✓ Alert resolved: ${options.id}`);
      } catch (error) {
        console.error('Error resolving alert:', error);
        process.exit(1);
      }
    });

  /**
   * metrics export [period]
   */
  metricsCommand
    .command('export [period]')
    .description('Export metrics data')
    .action(async (period = 'day', options) => {
      try {
        const factory = getAdvancedFactory();
        if (!factory) {
          console.error('Error: Advanced features not initialized');
          process.exit(1);
        }

        const service = factory.getMetrics();
        if (!service) {
          console.error('Error: Metrics service not available');
          process.exit(1);
        }

        const data = service.exportMetricsData(period as 'hour' | 'day' | 'week');

        console.log('\nMetrics Export:');
        console.log(JSON.stringify(data, null, 2));
      } catch (error) {
        console.error('Error exporting metrics:', error);
        process.exit(1);
      }
    });

  /**
   * metrics check
   */
  metricsCommand
    .command('check')
    .description('Check all metrics and alert thresholds')
    .action(async (options) => {
      try {
        const factory = getAdvancedFactory();
        if (!factory) {
          console.error('Error: Advanced features not initialized');
          process.exit(1);
        }

        const service = factory.getMetrics();
        if (!service) {
          console.error('Error: Metrics service not available');
          process.exit(1);
        }

        service.checkAlerts();

        const metrics = service.getMetrics('hour');
        const alerts = service.getActiveAlerts();

        console.log('\n📊 Health Check:');
        console.log(`  Success Rate: ${metrics.successRate.toFixed(2)}%`);
        console.log(`  Error Rate: ${metrics.errorRate.toFixed(2)}%`);
        console.log(`  Active Alerts: ${alerts.length}`);

        if (alerts.length > 0) {
          console.log(`  ⚠️  Warning: ${alerts.length} alert(s) active`);
        } else {
          console.log('  ✓ All systems healthy');
        }
      } catch (error) {
        console.error('Error checking metrics:', error);
        process.exit(1);
      }
    });
}
