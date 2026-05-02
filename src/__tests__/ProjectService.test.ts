import { describe, it, expect } from 'vitest';
import { DataSource } from 'typeorm';
import { ProjectService } from '../services/ProjectService';
import { Project } from '../entities/Project';

const mockDataSource = new DataSource({
  type: 'sqlite',
  database: ':memory:',
  entities: [Project],
  synchronize: true,
});

describe('ProjectService', () => {
  let projectService: ProjectService;

  beforeAll(async () => {
    await mockDataSource.initialize();
    projectService = new ProjectService(mockDataSource);
  });

  afterAll(async () => {
    await mockDataSource.destroy();
  });

  it('should create a project', async () => {
    const projectData = { name: 'Test Project' };
    const project = await projectService.create(projectData);
    expect(project).toHaveProperty('id');
    expect(project.name).toBe('Test Project');
  });

  it('should list projects', async () => {
    await projectService.create({ name: 'Project 1' });
    await projectService.create({ name: 'Project 2' });
    const projects = await projectService.list();
    expect(projects.length).toBe(2);
  });
});
