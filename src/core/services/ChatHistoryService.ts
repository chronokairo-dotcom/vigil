import { DataSource } from 'typeorm';
import { ChatHistory } from '../entities/ChatHistory';

export interface SaveHistoryInput {
  channelId: string;
  message: string;
  sender?: string;
  metadata?: Record<string, any> | null;
  // Legacy compatibility fields still used by older API surfaces
  channel?: string;
  messages?: any[];
  pipelineId?: string;
  projectId?: string;
  workspace?: string;
}

export interface HistoryFilter {
  limit?: number;
  offset?: number;
  search?: string;
  channel?: string;
  dateFilter?: string;
  projectId?: string;
  pipelineId?: string;
  fromDate?: Date;
  toDate?: Date;
}

export interface BackupInfo {
  id: string;
  createdAt: Date;
  size: number;
}

export interface RecoveryResult {
  success: boolean;
  message: string;
}

export class ChatHistoryService {
  constructor(private db: DataSource) { }

  async saveHistory(input: SaveHistoryInput): Promise<void> {
    const repo = this.db.getRepository(ChatHistory);
    const channelId = input.channelId || input.channel || 'default';
    const message = input.message ?? (Array.isArray(input.messages) ? JSON.stringify(input.messages) : '');
    const entry = repo.create({
      channelId,
      message,
      sender: input.sender ?? 'user',
      metadata: input.metadata ?? null,
    });
    await repo.save(entry);
  }

  async getHistory(filter?: HistoryFilter): Promise<ChatHistory[]> {
    const repo = this.db.getRepository(ChatHistory);
    const query = repo.createQueryBuilder('chat').orderBy('chat.createdAt', 'DESC');

    if (filter?.channel) {
      query.andWhere('chat.channelId = :channel', { channel: filter.channel });
    }
    if (filter?.fromDate) {
      query.andWhere('chat.createdAt >= :fromDate', { fromDate: filter.fromDate });
    }
    if (filter?.toDate) {
      query.andWhere('chat.createdAt <= :toDate', { toDate: filter.toDate });
    }
    if (filter?.search) {
      query.andWhere('(chat.message LIKE :search OR chat.channelId LIKE :search)', {
        search: `%${filter.search}%`,
      });
    }
    if (typeof filter?.limit === 'number') {
      query.take(filter.limit);
    }
    if (typeof filter?.offset === 'number') {
      query.skip(filter.offset);
    }

    return query.getMany();
  }

  async listHistories(filter?: HistoryFilter): Promise<ChatHistory[]> {
    return this.getHistory(filter);
  }

  async getHistoryById(id: string): Promise<ChatHistory | null> {
    return this.db.getRepository(ChatHistory).findOne({ where: { id } });
  }

  async getHistoryByChannel(channel: string): Promise<ChatHistory[]> {
    return this.getHistory({ channel });
  }

  async getHistoryByPipeline(_pipelineId: string): Promise<ChatHistory[]> {
    // Pipeline link is legacy and not represented in current entity schema.
    return this.getHistory();
  }

  async appendMessage(channelId: string, message: string, pipelineId?: string): Promise<ChatHistory> {
    const repo = this.db.getRepository(ChatHistory);
    const entry = repo.create({
      channelId,
      message,
      sender: 'assistant',
      metadata: pipelineId ? { pipelineId } : null,
    });
    return repo.save(entry);
  }

  async deleteHistory(id: string): Promise<boolean> {
    const existing = await this.getHistoryById(id);
    if (!existing) return false;
    await this.db.getRepository(ChatHistory).remove(existing);
    return true;
  }

  async clearMessages(idOrChannel: string): Promise<ChatHistory[]> {
    const repo = this.db.getRepository(ChatHistory);
    const byId = await repo.findOne({ where: { id: idOrChannel } });
    if (byId) {
      await repo.remove(byId);
      return [];
    }

    const byChannel = await repo.find({ where: { channelId: idOrChannel } });
    if (byChannel.length > 0) {
      await repo.remove(byChannel);
    }
    return [];
  }

  listBackups(_pipelineId?: string): string[] {
    return [];
  }

  async createBackup(id: string): Promise<{ backupPath: string; sourceId: string }> {
    return { backupPath: `backup:${id}`, sourceId: id };
  }

  async createFullBackup(): Promise<string[]> {
    return [];
  }

  async restoreLatestBackup(_pipelineId?: string): Promise<{ restored: boolean }> {
    return { restored: false };
  }

  async restoreFromBackup(_backupPath: string): Promise<{ restored: boolean }> {
    return { restored: false };
  }

  cleanupOldBackups(_daysOld: number): number {
    return 0;
  }

  async syncWithJsonl(_channel?: string, _pipelineId?: string): Promise<{ synced: boolean }> {
    return { synced: false };
  }

  async importFromJsonl(
    _filePath: string,
    _channel?: string,
    _pipelineId?: string,
  ): Promise<{ imported: number }> {
    return { imported: 0 };
  }

  async exportToJsonl(_historyId: string, _outputPath: string): Promise<boolean> {
    return false;
  }

  async getHistoryPaginated(
    options: { limit: number; offset: number; search?: string; channel?: string; dateFilter?: string }
  ): Promise<{ items: ChatHistory[]; total: number }> {
    const repo = this.db.getRepository(ChatHistory);

    // Build query conditions
    const queryBuilder = repo.createQueryBuilder('chat')
      .orderBy('chat.createdAt', 'DESC')
      .take(options.limit)
      .skip(options.offset);

    // Add search filter
    if (options.search) {
      queryBuilder.andWhere(
        '(chat.message ILIKE :search OR chat.channelId ILIKE :search)',
        { search: `%${options.search}%` }
      );
    }

    // Add channel filter
    if (options.channel) {
      queryBuilder.andWhere('chat.channelId = :channel', { channel: options.channel });
    }

    // Add date filter
    if (options.dateFilter) {
      const now = new Date();
      let startDate: Date;

      switch (options.dateFilter) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        default:
          startDate = new Date(0); // Beginning of time
      }

      queryBuilder.andWhere('chat.createdAt >= :startDate', { startDate });
    }

    const [items, total] = await queryBuilder.getManyAndCount();
    return { items, total };
  }

  async deleteEntry(id: string): Promise<void> {
    const repo = this.db.getRepository(ChatHistory);
    const entry = await repo.findOneBy({ id });
    if (!entry) {
      throw new Error(`ChatHistory entry not found: ${id}`);
    }
    await repo.remove(entry);
  }

  async backup(): Promise<BackupInfo> {
    return { id: 'stub', createdAt: new Date(), size: 0 };
  }

  async recover(): Promise<RecoveryResult> {
    return { success: true, message: 'Stub' };
  }
}
