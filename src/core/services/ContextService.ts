import { DataSource, Like } from 'typeorm';
import { ContextEntry } from '../entities/ContextEntry';
import { Project } from '../entities/Project';

export class ContextService {
  private repo;
  private projectRepo;

  constructor(private db: DataSource) {
    this.repo = db.getRepository(ContextEntry);
    this.projectRepo = db.getRepository(Project);
  }

  async listByProject(projectId: string, category?: string) {
    const where: any = { project: { id: projectId } };
    if (category) where.category = category;

    return this.repo.find({
      where,
      relations: ['project'],
      order: { priority: 'DESC', createdAt: 'DESC' },
    });
  }

  async get(id: string) {
    return this.repo.findOne({ where: { id }, relations: ['project'] });
  }

  async search(projectId: string, query: string) {
    return this.repo
      .createQueryBuilder('ctx')
      .leftJoinAndSelect('ctx.project', 'project')
      .where('ctx.projectId = :projectId', { projectId })
      .andWhere('(ctx.key LIKE :q OR ctx.value LIKE :q)', { q: `%${query}%` })
      .orderBy('ctx.priority', 'DESC')
      .getMany();
  }

  async create(input: {
    projectId: string;
    key: string;
    value: string;
    category?: string;
    priority?: number;
    metadata?: Record<string, any> | null;
  }) {
    const project = await this.projectRepo.findOne({ where: { id: input.projectId } });
    if (!project) throw new Error(`Project not found: ${input.projectId}`);

    const entry = this.repo.create({
      key: input.key,
      value: input.value,
      category: input.category || 'general',
      priority: input.priority || 1,
      metadata: input.metadata || undefined,
      project,
    });
    return this.repo.save(entry);
  }

  async update(id: string, input: {
    key?: string;
    value?: string;
    category?: string;
    priority?: number;
    metadata?: Record<string, any> | null;
  }) {
    const entry = await this.get(id);
    if (!entry) throw new Error(`Context entry not found: ${id}`);
    Object.assign(entry, input);
    return this.repo.save(entry);
  }

  async delete(id: string) {
    const entry = await this.get(id);
    if (!entry) throw new Error(`Context entry not found: ${id}`);
    await this.repo.remove(entry);
    return true;
  }
}
