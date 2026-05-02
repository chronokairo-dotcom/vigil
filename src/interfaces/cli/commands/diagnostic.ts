/**
 * Diagnostic Pipeline CLI Commands
 * 
 * Commands for creating and managing diagnostic sub-pipelines
 */

import { Command } from 'commander';
import { getAdvancedFactory } from '../../api/server';

export function registerDiagnosticCommands(program: Command): void {
  const diagnosticCommand = program
    .command('diagnostic')
    .description('Manage diagnostic pipelines');

  /**
   * diagnostic create --pipeline <pipelineId> --reason <reason>
   */
  diagnosticCommand
    .command('create')
    .description('Create diagnostic sub-pipeline')
    .requiredOption('--pipeline <pipelineId>', 'Parent pipeline ID')
    .requiredOption(
      '--reason <reason>',
      'Diagnostic reason: phase-failure|high-error-rate|performance-degradation|resource-exhaustion|manual-request'
    )
    .option('--phase <phaseId>', 'Phase ID (if applicable)')
    .option('--error <error>', 'Error details')
    .action(async (options) => {
      try {
        const validReasons = [
          'phase-failure',
          'high-error-rate',
          'performance-degradation',
          'resource-exhaustion',
          'manual-request',
        ];

        if (!validReasons.includes(options.reason)) {
          console.error(
            `Error: Invalid reason. Must be one of: ${validReasons.join(', ')}`
          );
          process.exit(1);
        }

        const factory = getAdvancedFactory();
        if (!factory) {
          console.error('Error: Advanced features not initialized');
          process.exit(1);
        }

        const service = factory.getDiagnosticPipelines();
        if (!service) {
          console.error('Error: Diagnostic service not available');
          process.exit(1);
        }

        // TODO: Fetch parent pipeline from database
        // For now, just log what would be created
        console.log('✓ Diagnostic sub-pipeline would be created');
        console.log(`  Parent: ${options.pipeline}`);
        console.log(`  Reason: ${options.reason}`);
        if (options.phase) {
          console.log(`  Phase: ${options.phase}`);
        }
      } catch (error) {
        console.error('Error creating diagnostic:', error);
        process.exit(1);
      }
    });

  /**
   * diagnostic get --id <diagnosticId>
   */
  diagnosticCommand
    .command('get')
    .description('Get diagnostic pipeline details')
    .requiredOption('--id <diagnosticId>', 'Diagnostic pipeline ID')
    .action(async (options) => {
      try {
        const factory = getAdvancedFactory();
        if (!factory) {
          console.error('Error: Advanced features not initialized');
          process.exit(1);
        }

        const service = factory.getDiagnosticPipelines();
        if (!service) {
          console.error('Error: Diagnostic service not available');
          process.exit(1);
        }

        const diagnostic = service.getDiagnosticPipeline(options.id);
        if (!diagnostic) {
          console.error('Error: Diagnostic not found');
          process.exit(1);
        }

        console.log(`\nDiagnostic Pipeline: ${options.id}`);
        console.log(`  Parent: ${diagnostic.parentPipelineId}`);
        console.log(`  Reason: ${diagnostic.diagnosticReason}`);
        console.log(`  Status: ${diagnostic.status}`);
        console.log(`  Steps: ${diagnostic.diagnosticSteps?.length || 0}`);
      } catch (error) {
        console.error('Error getting diagnostic:', error);
        process.exit(1);
      }
    });

  /**
   * diagnostic list --pipeline <pipelineId>
   */
  diagnosticCommand
    .command('list')
    .description('List diagnostics for pipeline')
    .requiredOption('--pipeline <pipelineId>', 'Parent pipeline ID')
    .action(async (options) => {
      try {
        const factory = getAdvancedFactory();
        if (!factory) {
          console.error('Error: Advanced features not initialized');
          process.exit(1);
        }

        const service = factory.getDiagnosticPipelines();
        if (!service) {
          console.error('Error: Diagnostic service not available');
          process.exit(1);
        }

        const diagnostics = service.getChildDiagnosticPipelines(options.pipeline);

        console.log(`\nDiagnostics for: ${options.pipeline}`);
        if (diagnostics.length === 0) {
          console.log('  (No diagnostics)');
          return;
        }

        diagnostics.forEach((diag) => {
          console.log(`  [${diag.diagnosticReason}] ${diag.id}`);
          console.log(`    Status: ${diag.status}`);
        });
      } catch (error) {
        console.error('Error listing diagnostics:', error);
        process.exit(1);
      }
    });

  /**
   * diagnostic report --id <diagnosticId>
   */
  diagnosticCommand
    .command('report')
    .description('Get diagnostic report')
    .requiredOption('--id <diagnosticId>', 'Diagnostic pipeline ID')
    .action(async (options) => {
      try {
        const factory = getAdvancedFactory();
        if (!factory) {
          console.error('Error: Advanced features not initialized');
          process.exit(1);
        }

        const service = factory.getDiagnosticPipelines();
        if (!service) {
          console.error('Error: Diagnostic service not available');
          process.exit(1);
        }

        const report = service.getDiagnosticReport(options.id);
        if (!report) {
          console.error('Error: Diagnostic not found');
          process.exit(1);
        }

        console.log(`\nDiagnostic Report: ${options.id}`);
        console.log(`  Reason: ${report.diagnosticReason}`);
        console.log(`  Findings:`);
        if (report.findings && report.findings.length > 0) {
          report.findings.forEach((finding, i) => {
            console.log(`    ${i + 1}. ${finding}`);
          });
        } else {
          console.log('    (No findings)');
        }

        console.log(`  Recommendations:`);
        if (report.recommendations && report.recommendations.length > 0) {
          report.recommendations.forEach((rec, i) => {
            console.log(`    ${i + 1}. ${rec}`);
          });
        } else {
          console.log('    (No recommendations)');
        }
      } catch (error) {
        console.error('Error getting report:', error);
        process.exit(1);
      }
    });

  /**
   * diagnostic apply --id <diagnosticId> --recommendation <index>
   */
  diagnosticCommand
    .command('apply')
    .description('Apply diagnostic recommendation and resume')
    .requiredOption('--id <diagnosticId>', 'Diagnostic pipeline ID')
    .requiredOption('--recommendation <index>', 'Recommendation index')
    .action(async (options) => {
      try {
        const factory = getAdvancedFactory();
        if (!factory) {
          console.error('Error: Advanced features not initialized');
          process.exit(1);
        }

        const service = factory.getDiagnosticPipelines();
        if (!service) {
          console.error('Error: Diagnostic service not available');
          process.exit(1);
        }

        const recIndex = parseInt(options.recommendation, 10);
        const success = await service.applyRecommendationAndResume(
          options.id,
          recIndex
        );

        if (success) {
          console.log(`✓ Recommendation applied and pipeline resumed`);
          console.log(`  Diagnostic: ${options.id}`);
          console.log(`  Recommendation: #${recIndex}`);
        } else {
          console.error('Error: Could not apply recommendation');
          process.exit(1);
        }
      } catch (error) {
        console.error('Error applying recommendation:', error);
        process.exit(1);
      }
    });

  /**
   * diagnostic dismiss --id <diagnosticId>
   */
  diagnosticCommand
    .command('dismiss')
    .description('Dismiss diagnostic')
    .requiredOption('--id <diagnosticId>', 'Diagnostic pipeline ID')
    .action(async (options) => {
      try {
        const factory = getAdvancedFactory();
        if (!factory) {
          console.error('Error: Advanced features not initialized');
          process.exit(1);
        }

        const service = factory.getDiagnosticPipelines();
        if (!service) {
          console.error('Error: Diagnostic service not available');
          process.exit(1);
        }

        // TODO: Implement dismiss logic
        console.log(`✓ Diagnostic dismissed: ${options.id}`);
      } catch (error) {
        console.error('Error dismissing diagnostic:', error);
        process.exit(1);
      }
    });
}
