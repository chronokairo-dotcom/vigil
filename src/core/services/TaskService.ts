import { DataSource, Repository } from 'typeorm';
import { Task, TaskStatus, TaskType, TaskStep, ReasoningContext } from '../entities/Task';
import { getEventBus } from '@/src/observation/EventBus';

export interface CreateTaskInput {
  workspaceId: string;
  agentId: string;
  type: TaskType;
  description: string;
  input: Record<string, any>;
  parentTaskId?: string;
}

export interface UpdateTaskInput {
  status?: TaskStatus;
  output?: Record<string, any>;
  error?: string;
  reasoning?: ReasoningContext;
}

export class TaskService {
  private repo: Repository<Task>;

  constructor(private db: DataSource) {
    this.repo = db.getRepository(Task);
  }

  async create(input: CreateTaskInput): Promise<Task> {
    const task = this.repo.create({
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      type: input.type,
      description: input.description,
      input: input.input,
      status: 'pending',
      history: [],
      parentTaskId: input.parentTaskId || null,
    });
    return this.repo.save(task);
  }

  async getById(id: string): Promise<Task | null> {
    return this.repo.findOne({ where: { id } });
  }

  async listByAgent(agentId: string, status?: TaskStatus): Promise<Task[]> {
    return this.repo.find({
      where: status ? { agentId, status } : { agentId },
      order: { createdAt: 'DESC' },
    });
  }

  async listTasksPaginated(options: {
    workspaceId?: string;
    agentId?: string;
    status?: TaskStatus;
    limit: number;
    offset: number;
  }): Promise<{ items: Task[]; total: number }> {
    const where: Record<string, any> = {};
    if (options.workspaceId) where.workspaceId = options.workspaceId;
    if (options.agentId) where.agentId = options.agentId;
    if (options.status) where.status = options.status;

    const [items, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: options.limit,
      skip: options.offset,
    });

    return { items, total };
  }

  async listByWorkspace(workspaceId: string, status?: TaskStatus): Promise<Task[]> {
    return this.repo.find({
      where: status ? { workspaceId, status } : { workspaceId },
      order: { createdAt: 'DESC' },
    });
  }

  async update(id: string, input: UpdateTaskInput): Promise<Task | null> {
    const updates: any = { ...input };
    if (input.status === 'completed' || input.status === 'failed') {
      updates.completedAt = new Date();
    }
    await this.repo.update(id, updates);
    return this.getById(id);
  }

  async start(id: string): Promise<Task | null> {
    await this.repo.update(id, {
      status: 'running',
      startedAt: new Date(),
    });
    const task = await this.getById(id);
    if (task) getEventBus().emit('task:update', { id, status: 'running', task });
    return task;
  }

  async complete(id: string, output: Record<string, any>): Promise<Task | null> {
    const task = await this.getById(id);
    if (!task) return null;

    const durationMs = task.startedAt
      ? new Date().getTime() - new Date(task.startedAt).getTime()
      : 0;

    await this.repo.update(id, {
      status: 'completed',
      output,
      completedAt: new Date(),
      durationMs,
    });
    const updated = await this.getById(id);
    if (updated) getEventBus().emit('task:update', { id, status: 'completed', task: updated });
    return updated;
  }

  async fail(id: string, error: string): Promise<Task | null> {
    const task = await this.getById(id);
    if (!task) return null;

    const durationMs = task.startedAt
      ? new Date().getTime() - new Date(task.startedAt).getTime()
      : 0;

    await this.repo.update(id, {
      status: 'failed',
      error,
      completedAt: new Date(),
      durationMs,
    });
    const updated = await this.getById(id);
    if (updated) getEventBus().emit('task:update', { id, status: 'failed', task: updated });
    return updated;
  }

  async addStep(id: string, step: TaskStep): Promise<void> {
    const task = await this.getById(id);
    if (!task) return;

    const history = [...task.history, step];
    await this.repo.update(id, { history });
    getEventBus().emit('task:step', { id, step });
  }

  async setReasoning(id: string, reasoning: ReasoningContext): Promise<void> {
    await this.repo.update(id, { reasoning });
    getEventBus().emit('task:reasoning', { id, reasoning });
  }

  async pause(id: string): Promise<Task | null> {
    await this.repo.update(id, { status: 'paused' });
    const task = await this.getById(id);
    if (task) getEventBus().emit('task:update', { id, status: 'paused', task });
    return task;
  }

  async resume(id: string): Promise<Task | null> {
    await this.repo.update(id, { status: 'running' });
    const task = await this.getById(id);
    if (task) getEventBus().emit('task:update', { id, status: 'running', task });
    return task;
  }

  async cancel(id: string): Promise<Task | null> {
    await this.repo.update(id, { status: 'cancelled' });
    const task = await this.getById(id);
    if (task) getEventBus().emit('task:update', { id, status: 'cancelled', task });
    return task;
  }

  async getStats(workspaceId: string): Promise<{
    totalTasks: number;
    completed: number;
    failed: number;
    running: number;
    pending: number;
    avgDurationMs: number;
  }> {
    const tasks = await this.listByWorkspace(workspaceId);

    const stats = {
      totalTasks: tasks.length,
      completed: tasks.filter((t) => t.status === 'completed').length,
      failed: tasks.filter((t) => t.status === 'failed').length,
      running: tasks.filter((t) => t.status === 'running').length,
      pending: tasks.filter((t) => t.status === 'pending').length,
      avgDurationMs: 0,
    };

    const completedTasks = tasks.filter((t) => t.status === 'completed' && t.durationMs);
    if (completedTasks.length > 0) {
      stats.avgDurationMs =
        completedTasks.reduce((sum, t) => sum + (t.durationMs || 0), 0) / completedTasks.length;
    }

    return stats;
  }
}
