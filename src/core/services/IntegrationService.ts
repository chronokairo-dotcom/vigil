import axios from 'axios';
import { Logger } from '../utils/Logger';
import { getEventBus } from '../events';

/**
 * Integration Service
 * 
 * Manages outgoing integrations with external services like Slack, Discord, and GitHub.
 */

export interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  type: 'slack' | 'discord' | 'generic';
  events: string[]; // e.g. ['pipeline:completed', 'security:vulnerability-found']
  enabled: boolean;
}

export interface GitHubConfig {
  repoOwner: string;
  repoName: string;
  token: string;
  enabled: boolean;
}

export class IntegrationService {
  private static instance: IntegrationService;
  private logger = Logger.getInstance();
  private bus = getEventBus('integrations');
  private webhooks: Map<string, WebhookConfig> = new Map();
  private githubConfigs: Map<string, GitHubConfig> = new Map();

  private constructor() {
    this.setupEventListeners();
  }

  public static getInstance(): IntegrationService {
    if (!IntegrationService.instance) {
      IntegrationService.instance = new IntegrationService();
    }
    return IntegrationService.instance;
  }

  /**
   * Register a new outgoing webhook
   */
  registerWebhook(config: Omit<WebhookConfig, 'id'>): string {
    const id = Math.random().toString(36).substring(7);
    const fullConfig = { ...config, id };
    this.webhooks.set(id, fullConfig);
    this.logger.info(`[Integrations] Registered webhook: ${config.name}`, { id, type: config.type });
    return id;
  }

  /**
   * List all registered webhooks
   */
  listWebhooks(): WebhookConfig[] {
    return Array.from(this.webhooks.values());
  }

  /**
   * Remove a webhook
   */
  removeWebhook(id: string): void {
    this.webhooks.delete(id);
  }

  /**
   * Set GitHub configuration for a workspace
   */
  setGitHubConfig(workspaceId: string, config: GitHubConfig): void {
    this.githubConfigs.set(workspaceId, config);
    this.logger.info(`[Integrations] Configured GitHub for workspace: ${workspaceId}`);
  }

  /**
   * Trigger a GitHub Actions workflow
   */
  async triggerGitHubWorkflow(workspaceId: string, workflowId: string, inputs: Record<string, any> = {}): Promise<void> {
    const config = this.githubConfigs.get(workspaceId);
    if (!config || !config.enabled) {
      throw new Error(`GitHub integration not configured or disabled for workspace: ${workspaceId}`);
    }

    try {
      await axios.post(
        `https://api.github.com/repos/${config.repoOwner}/${config.repoName}/actions/workflows/${workflowId}/dispatches`,
        { ref: 'main', inputs },
        {
          headers: {
            'Authorization': `token ${config.token}`,
            'Accept': 'application/vnd.github.v3+json',
          }
        }
      );
      this.logger.info(`[Integrations] Triggered GitHub workflow: ${workflowId}`);
    } catch (error: any) {
      this.logger.error(`[Integrations] Failed to trigger GitHub workflow`, { error: error.message });
      throw error;
    }
  }

  /**
   * Send a notification to all matching webhooks
   */
  async notify(eventName: string, payload: any): Promise<void> {
    const activeWebhooks = Array.from(this.webhooks.values()).filter(w => 
      w.enabled && (w.events.includes(eventName) || w.events.includes('*'))
    );

    if (activeWebhooks.length === 0) return;

    this.logger.debug(`[Integrations] Notifying ${activeWebhooks.length} webhooks for event: ${eventName}`);

    const promises = activeWebhooks.map(async webhook => {
      try {
        let formattedPayload = payload;

        if (webhook.type === 'slack') {
          formattedPayload = {
            text: `*VIGIL Event: ${eventName}*\n\`\`\`${JSON.stringify(payload, null, 2)}\`\`\``
          };
        } else if (webhook.type === 'discord') {
          formattedPayload = {
            content: `**VIGIL Event: ${eventName}**`,
            embeds: [{
              description: `\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
              color: 0x5865F2
            }]
          };
        }

        await axios.post(webhook.url, formattedPayload);
      } catch (error: any) {
        this.logger.error(`[Integrations] Failed to send webhook: ${webhook.name}`, { error: error.message });
      }
    });

    await Promise.all(promises);
  }

  /**
   * Listen to system events and trigger notifications
   */
  private setupEventListeners(): void {
    const systemBus = getEventBus();

    // Listen to all events and forward to notify
    // In a real system, we would filter specific events to avoid spam
    const importantEvents = [
      'pipeline:task:completed',
      'pipeline:task:failed',
      'agent:state',
      'security:scan:completed'
    ];

    for (const event of importantEvents) {
      systemBus.on(event as any, (data: any) => {
        this.notify(event, data).catch(err => {
          this.logger.error(`[Integrations] Error in event listener for ${event}`, { error: err.message });
        });
      });
    }
  }
}
