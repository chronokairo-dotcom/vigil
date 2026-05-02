/**
 * Workflow Trigger Management CLI Commands
 * 
 * Commands for registering and managing workflow triggers
 */

import { Command } from 'commander';
import { getAdvancedFactory } from '../../api/server';

export function registerTriggerCommands(program: Command): void {
  const triggerCommand = program.command('trigger').description('Manage workflow triggers');

  /**
   * trigger register-event --workflow <id> --event <type> --filter '{...}'
   */
  triggerCommand
    .command('register-event')
    .description('Register event-based trigger')
    .requiredOption('--workflow <id>', 'Workflow ID')
    .requiredOption('--event <type>', 'Event type to listen for')
    .option('--filter <json>', 'Event filter as JSON')
    .action(async (options) => {
      try {
        const factory = getAdvancedFactory();
        if (!factory) {
          console.error('Error: Advanced features not initialized');
          process.exit(1);
        }

        const service = factory.getWorkflowTriggers();
        if (!service) {
          console.error('Error: Workflow trigger service not available');
          process.exit(1);
        }

        const filter = options.filter ? JSON.parse(options.filter) : undefined;
        const trigger = service.registerEventTrigger(
          options.workflow,
          options.event,
          filter
        );

        console.log('✓ Event trigger registered');
        console.log(`  ID: ${trigger.id}`);
        console.log(`  Event: ${options.event}`);
        console.log(`  Workflow: ${options.workflow}`);
      } catch (error) {
        console.error('Error registering event trigger:', error);
        process.exit(1);
      }
    });

  /**
   * trigger register-schedule --workflow <id> --cron <expression> --timezone <tz>
   */
  triggerCommand
    .command('register-schedule')
    .description('Register schedule-based trigger (cron)')
    .requiredOption('--workflow <id>', 'Workflow ID')
    .requiredOption('--cron <expression>', 'CRON expression')
    .option('--timezone <tz>', 'Timezone', 'UTC')
    .action(async (options) => {
      try {
        const factory = getAdvancedFactory();
        if (!factory) {
          console.error('Error: Advanced features not initialized');
          process.exit(1);
        }

        const service = factory.getWorkflowTriggers();
        if (!service) {
          console.error('Error: Workflow trigger service not available');
          process.exit(1);
        }

        const trigger = service.registerScheduleTrigger(
          options.workflow,
          options.cron,
          options.timezone
        );

        console.log('✓ Schedule trigger registered');
        console.log(`  ID: ${trigger.id}`);
        console.log(`  CRON: ${options.cron}`);
        console.log(`  Timezone: ${options.timezone}`);
      } catch (error) {
        console.error('Error registering schedule trigger:', error);
        process.exit(1);
      }
    });

  /**
   * trigger register-webhook --workflow <id> --secret <secret>
   */
  triggerCommand
    .command('register-webhook')
    .description('Register webhook trigger')
    .requiredOption('--workflow <id>', 'Workflow ID')
    .option('--secret <secret>', 'Webhook secret for HMAC validation')
    .action(async (options) => {
      try {
        const factory = getAdvancedFactory();
        if (!factory) {
          console.error('Error: Advanced features not initialized');
          process.exit(1);
        }

        const service = factory.getWorkflowTriggers();
        if (!service) {
          console.error('Error: Workflow trigger service not available');
          process.exit(1);
        }

        const trigger = service.registerWebhookTrigger(
          options.workflow,
          options.secret
        );

        console.log('✓ Webhook trigger registered');
        console.log(`  ID: ${trigger.id}`);
        console.log(`  Webhook URL: POST /api/services/triggers/webhook/${trigger.id}`);
      } catch (error) {
        console.error('Error registering webhook trigger:', error);
        process.exit(1);
      }
    });

  /**
   * trigger list --workflow <id>
   */
  triggerCommand
    .command('list')
    .description('List triggers for workflow')
    .requiredOption('--workflow <id>', 'Workflow ID')
    .action(async (options) => {
      try {
        const factory = getAdvancedFactory();
        if (!factory) {
          console.error('Error: Advanced features not initialized');
          process.exit(1);
        }

        const service = factory.getWorkflowTriggers();
        if (!service) {
          console.error('Error: Workflow trigger service not available');
          process.exit(1);
        }

        const triggers = service.getWorkflowTriggers(options.workflow);

        console.log(`Triggers for workflow: ${options.workflow}`);
        triggers.forEach((trigger) => {
          console.log(`  [${trigger.type}] ${trigger.id}`);
          console.log(`    Enabled: ${trigger.enabled}`);
        });
      } catch (error) {
        console.error('Error listing triggers:', error);
        process.exit(1);
      }
    });

  /**
   * trigger get --id <triggerId>
   */
  triggerCommand
    .command('get')
    .description('Get trigger details')
    .requiredOption('--id <triggerId>', 'Trigger ID')
    .action(async (options) => {
      try {
        const factory = getAdvancedFactory();
        if (!factory) {
          console.error('Error: Advanced features not initialized');
          process.exit(1);
        }

        const service = factory.getWorkflowTriggers();
        if (!service) {
          console.error('Error: Workflow trigger service not available');
          process.exit(1);
        }

        const trigger = service.getTrigger(options.id);
        if (!trigger) {
          console.error('Error: Trigger not found');
          process.exit(1);
        }

        console.log(`Trigger: ${options.id}`);
        console.log(`  Type: ${trigger.type}`);
        console.log(`  Workflow: ${trigger.workflowId}`);
        console.log(`  Enabled: ${trigger.enabled}`);
        console.log(`  Config: ${JSON.stringify(trigger.config, null, 2)}`);
      } catch (error) {
        console.error('Error getting trigger:', error);
        process.exit(1);
      }
    });

  /**
   * trigger enable --id <triggerId>
   */
  triggerCommand
    .command('enable')
    .description('Enable trigger')
    .requiredOption('--id <triggerId>', 'Trigger ID')
    .action(async (options) => {
      try {
        const factory = getAdvancedFactory();
        if (!factory) {
          console.error('Error: Advanced features not initialized');
          process.exit(1);
        }

        const service = factory.getWorkflowTriggers();
        if (!service) {
          console.error('Error: Workflow trigger service not available');
          process.exit(1);
        }

        service.enableTrigger(options.id);
        console.log(`✓ Trigger enabled: ${options.id}`);
      } catch (error) {
        console.error('Error enabling trigger:', error);
        process.exit(1);
      }
    });

  /**
   * trigger disable --id <triggerId>
   */
  triggerCommand
    .command('disable')
    .description('Disable trigger')
    .requiredOption('--id <triggerId>', 'Trigger ID')
    .action(async (options) => {
      try {
        const factory = getAdvancedFactory();
        if (!factory) {
          console.error('Error: Advanced features not initialized');
          process.exit(1);
        }

        const service = factory.getWorkflowTriggers();
        if (!service) {
          console.error('Error: Workflow trigger service not available');
          process.exit(1);
        }

        service.disableTrigger(options.id);
        console.log(`✓ Trigger disabled: ${options.id}`);
      } catch (error) {
        console.error('Error disabling trigger:', error);
        process.exit(1);
      }
    });

  /**
   * trigger delete --id <triggerId>
   */
  triggerCommand
    .command('delete')
    .description('Delete trigger')
    .requiredOption('--id <triggerId>', 'Trigger ID')
    .action(async (options) => {
      try {
        const factory = getAdvancedFactory();
        if (!factory) {
          console.error('Error: Advanced features not initialized');
          process.exit(1);
        }

        const service = factory.getWorkflowTriggers();
        if (!service) {
          console.error('Error: Workflow trigger service not available');
          process.exit(1);
        }

        service.deleteTrigger(options.id);
        console.log(`✓ Trigger deleted: ${options.id}`);
      } catch (error) {
        console.error('Error deleting trigger:', error);
        process.exit(1);
      }
    });
}
