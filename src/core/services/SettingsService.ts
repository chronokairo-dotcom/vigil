import { DataSource, Repository } from 'typeorm';
import { Settings } from '../entities/Settings';
import { featureFlags, FeatureFlags } from '../../config/featureFlags';

export interface SettingValue {
  key: string;
  value: string;
  type: 'boolean' | 'string' | 'number' | 'json';
  description?: string;
  isSystemSetting?: boolean;
}

export class SettingsService {
  private settingsRepo: Repository<Settings>;

  constructor(private db: DataSource) {
    this.settingsRepo = db.getRepository(Settings);
  }

  async getSetting(workspaceId: string, key: string): Promise<Settings | null> {
    return this.settingsRepo.findOne({ where: { workspaceId, key } });
  }

  async getSettingsByWorkspace(workspaceId: string): Promise<Settings[]> {
    return this.settingsRepo.find({
      where: { workspaceId },
      order: { key: 'ASC' }
    });
  }

  async getAllSettings(): Promise<Settings[]> {
    return this.settingsRepo.find({ order: { workspaceId: 'ASC', key: 'ASC' } });
  }

  async setSetting(
    workspaceId: string,
    key: string,
    value: string,
    type: 'boolean' | 'string' | 'number' | 'json',
    description?: string,
    isSystemSetting: boolean = false
  ): Promise<Settings> {
    let setting = await this.getSetting(workspaceId, key);

    if (setting) {
      setting.value = value;
      setting.type = type;
      if (description) setting.description = description;
      setting.updatedAt = new Date();
    } else {
      setting = this.settingsRepo.create({
        workspaceId,
        key,
        value,
        type,
        description,
        isSystemSetting,
      });
    }

    return this.settingsRepo.save(setting);
  }

  async deleteSetting(workspaceId: string, key: string): Promise<void> {
    await this.settingsRepo.delete({ workspaceId, key });
  }

  async getFeatureFlags(workspaceId?: string): Promise<FeatureFlags> {
    const flags: FeatureFlags = { ...featureFlags };

    // Override with workspace-specific settings if provided
    if (workspaceId) {
      const workspaceFlags = await this.getSettingsByWorkspace(workspaceId);

      for (const setting of workspaceFlags) {
        if (setting.type === 'boolean' && setting.key in flags) {
          (flags as any)[setting.key] = setting.value === 'true';
        }
      }
    }

    return flags;
  }

  async setFeatureFlag(
    workspaceId: string,
    key: keyof FeatureFlags,
    value: boolean
  ): Promise<void> {
    await this.setSetting(
      workspaceId,
      key,
      value.toString(),
      'boolean',
      this.getFlagDescription(key),
      true
    );
  }

  async getAIProviderSettings(workspaceId: string): Promise<Record<string, any>> {
    const settings = await this.getSettingsByWorkspace(workspaceId);
    const aiSettings: Record<string, any> = {};

    for (const setting of settings) {
      if (setting.key.startsWith('ai.provider.')) {
        const providerKey = setting.key.replace('ai.provider.', '');
        let parsedValue: unknown = setting.value;

        if (setting.type === 'boolean') {
          parsedValue = setting.value === 'true';
        } else if (setting.type === 'number') {
          parsedValue = parseFloat(setting.value);
        } else if (setting.type === 'json') {
          try {
            parsedValue = JSON.parse(setting.value);
          } catch {
            // Keep as string if JSON parsing fails
          }
        }

        aiSettings[providerKey] = parsedValue;
      }
    }

    return aiSettings;
  }

  async setAIProviderSetting(
    workspaceId: string,
    provider: string,
    key: string,
    value: any,
    type: 'boolean' | 'string' | 'number' | 'json' = 'string'
  ): Promise<void> {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    await this.setSetting(
      workspaceId,
      `ai.provider.${provider}.${key}`,
      stringValue,
      type,
      `AI provider setting: ${provider}.${key}`,
      false
    );
  }

  async initializeDefaultSettings(workspaceId: string): Promise<void> {
    // Initialize default feature flags for workspace
    for (const [key, value] of Object.entries(featureFlags)) {
      const existing = await this.getSetting(workspaceId, key);
      if (!existing) {
        await this.setSetting(
          workspaceId,
          key,
          value.toString(),
          'boolean',
          this.getFlagDescription(key as keyof FeatureFlags),
          true
        );
      }
    }
  }

  private getFlagDescription(key: keyof FeatureFlags): string {
    const descriptions: Record<keyof FeatureFlags, string> = {
      enableStreaming: 'Enable streaming responses for chat',
      enableMultimodalAgents: 'Enable agents that can process images and other media',
      enableSleepConsolidation: 'Enable memory consolidation during sleep cycles',
      enableVectorMemory: 'Enable vector-based memory storage and retrieval',
      enableApprovalFlow: 'Enable approval workflow for sensitive operations',
      enableMetricsCollection: 'Enable collection of system metrics',
      enableAutonomousModification: 'Allow agent to modify files autonomously',
      enableDeepRetrieval: 'Enable deep search and multi-step memory retrieval',
      enableJitEngine: 'Enable Just-In-Time execution for rapid task processing',
    };
    return descriptions[key] || `Feature flag: ${key}`;
  }
}
