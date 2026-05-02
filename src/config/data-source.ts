import { DataSource } from 'typeorm';
import { Project } from '../core/entities/Project';
import { SecurityAnalysis } from '../core/entities/SecurityAnalysis';
import { SecuritySchedule, SecurityWebhook } from '../core/entities/SecuritySchedule';

export const AppDataSource = new DataSource({
  type: 'sqlite',
  database: 'database.sqlite',
  synchronize: true,
  logging: false,
  entities: [Project, SecurityAnalysis, SecuritySchedule, SecurityWebhook],
  migrations: [],
  subscribers: [],
});
