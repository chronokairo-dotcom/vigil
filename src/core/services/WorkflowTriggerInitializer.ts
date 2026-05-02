import { Logger } from '../utils/Logger';
import { DataSource } from 'typeorm';
import { WorkflowTriggerService } from './WorkflowTriggerService';
import { getEventBus } from '@/src/observation/EventBus';

/**
 * Workflow Trigger Initializer
 * 
 * Loads workflow triggers from the database and initializes them
 * with the WorkflowTriggerService on application startup.
 */
export class WorkflowTriggerInitializer {
  private logger = Logger.getInstance('WorkflowTriggerInitializer');
  private triggerService: WorkflowTriggerService;
  private eventBus = getEventBus('workflow-triggers');

  constructor(triggerService: WorkflowTriggerService) {
    this.triggerService = triggerService;
  }

  /**
   * Initialize all workflow triggers from the database
   */
  async initialize(db: DataSource): Promise<void> {
    try {
      this.logger.info('Initializing workflow triggers from database');

      // Load workflows with triggers from database
      const workflows = await this.loadWorkflowsWithTriggers(db);
      
      this.logger.info(`Found ${workflows.length} workflows to initialize triggers for`);

      // Initialize triggers for each workflow
      for (const workflow of workflows) {
        await this.initializeWorkflowTriggers(workflow);
      }

      // Connect to EventBus for real-time event triggers
      this.connectToEventBus();

      this.logger.info('Workflow triggers initialization completed');
    } catch (error) {
      this.logger.error('Failed to initialize workflow triggers', { error });
      throw error;
    }
  }

  /**
   * Load workflow records from database
   */
  private async loadWorkflowsWithTriggers(db: DataSource): Promise<any[]> {
    try {
      const { Workflow } = await import('@/src/core/entities/Workflow');
      const repo = db.getRepository(Workflow);
      return await repo.find({ where: { status: 'active' } });
    } catch (error) {
      this.logger.error('Failed to load workflows from database', { error });
      return [];
    }
  }

  /**
   * Initialize triggers for a workflow
   */
  private async initializeWorkflowTriggers(workflow: any): Promise<void> {
    try {
      const { id, triggers, schedule } = workflow;
      
      // Handle the main schedule (cron) column if present
      if (schedule) {
        try {
          this.triggerService.registerScheduleTrigger(id, schedule);
          this.logger.info(`Initialized schedule trigger for workflow ${id}`, { schedule });
        } catch (err) {
          this.logger.error(`Failed to initialize schedule trigger for workflow ${id}`, { error: err });
        }
      }

      // Handle individual triggers from the triggers array
      if (Array.isArray(triggers)) {
        for (const triggerConfig of triggers) {
          try {
            switch (triggerConfig.type) {
              case 'cron':
                this.triggerService.registerScheduleTrigger(
                  id,
                  triggerConfig.config.cronExpression,
                  triggerConfig.config.timezone
                );
                break;

              case 'event':
                this.triggerService.registerEventTrigger(
                  id,
                  triggerConfig.config.eventType,
                  triggerConfig.config.eventFilter
                );
                break;

              case 'webhook':
                this.triggerService.registerWebhookTrigger(
                  id,
                  triggerConfig.config.secret,
                  triggerConfig.config.ipWhitelist
                );
                break;

              default:
                this.logger.warn(`Unknown trigger type: ${triggerConfig.type}`, { workflowId: id });
            }
          } catch (err) {
            this.logger.error(`Failed to initialize trigger for workflow ${id}`, { 
              triggerType: triggerConfig.type, 
              error: err 
            });
          }
        }
      }
    } catch (error) {
      this.logger.error(`Failed to initialize triggers for workflow ${workflow.id}`, { error });
    }
  }

  /**
   * Connect to EventBus for real-time event handling
   */
  private connectToEventBus(): void {
    // Listen for system events that might trigger workflows
    this.eventBus.on('fs:change', (event) => {
      this.logger.debug('File system change detected', { event });
      // The WorkflowTriggerService will handle this internally
    });

    this.eventBus.on('task:completed', (event) => {
      this.logger.debug('Task completed event detected', { event });
      // Could be used to trigger workflows based on task completion
    });

    this.eventBus.on('agent:status', (event) => {
      this.logger.debug('Agent status change detected', { event });
      // Could be used to trigger workflows based on agent status
    });

    this.logger.info('Connected to EventBus for workflow trigger events');
  }

  /**
   * Get trigger service instance
   */
  getTriggerService(): WorkflowTriggerService {
    return this.triggerService;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    try {
      await this.triggerService.cleanup();
      this.logger.info('Workflow trigger initializer cleaned up');
    } catch (error) {
      this.logger.error('Failed to cleanup workflow trigger initializer', { error });
    }
  }
}
