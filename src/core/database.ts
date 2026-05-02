/**
 * Database Connection & Initialization
 */

import { DataSource } from 'typeorm';
import path from 'path';
import fs from 'fs';

const DATA_DIR = process.env.Vigil_DATA_DIR || path.join(/*turbopackIgnore: true*/ process.env.HOME || process.env.USERPROFILE || '.', '.Vigil');
const DB_PATH = path.join(/*turbopackIgnore: true*/ DATA_DIR, 'data.sqlite');

// Ensure data directory exists
if (!fs.existsSync(/*turbopackIgnore: true*/ DATA_DIR)) {
  fs.mkdirSync(/*turbopackIgnore: true*/ DATA_DIR, { recursive: true });
}

let dataSource: DataSource | null = null;
let initPromise: Promise<DataSource> | null = null;

async function loadEntities() {
  // Dynamic, sequential imports defer entity-module evaluation to runtime so that
  // the circular references between Project / Workspace / WorkspaceMember / etc.
  // resolve in a deterministic order and avoid ESM TDZ ("Cannot access 'Project'
  // before initialization") when this module is imported by Next.js route handlers.
  const { User } = await import('./entities/User');
  const { Workspace } = await import('./entities/Workspace');
  const { WorkspaceMember } = await import('./entities/WorkspaceMember');
  const { Project } = await import('./entities/Project');
  const { ChatHistory } = await import('./entities/ChatHistory');
  const { ContextEntry } = await import('./entities/ContextEntry');
  const { Decision } = await import('./entities/Decision');
  const { ApiKey } = await import('./entities/ApiKey');
  const { SyncConfig } = await import('./entities/SyncConfig');
  const { Agent } = await import('./entities/Agent');
  const { Task } = await import('./entities/Task');
  const { Workflow } = await import('./entities/Workflow');
  const { SecurityAnalysis } = await import('./entities/SecurityAnalysis');
  const { SecuritySchedule, SecurityWebhook } = await import('./entities/SecuritySchedule');
  const { ExecutionLog } = await import('./entities/ExecutionLog');
  const { OrchestratorPlanRecord } = await import('./entities/OrchestratorPlan');
  const { OrchestratorRunRecord } = await import('./entities/OrchestratorRun');
  const { PolicyDecisionAudit } = await import('./entities/PolicyDecisionAudit');
  const { Settings } = await import('./entities/Settings');

  return [
    User,
    Workspace,
    WorkspaceMember,
    Project,
    ChatHistory,
    ContextEntry,
    Decision,
    ApiKey,
    SyncConfig,
    Agent,
    Task,
    Workflow,
    SecurityAnalysis,
    SecuritySchedule,
    SecurityWebhook,
    ExecutionLog,
    OrchestratorPlanRecord,
    OrchestratorRunRecord,
    PolicyDecisionAudit,
    Settings,
  ];
}

export const getDatabase = async (): Promise<DataSource> => {
  if (dataSource && dataSource.isInitialized) {
    return dataSource;
  }
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const entities = await loadEntities();

    const ds = new DataSource({
      type: 'sqlite',
      database: DB_PATH,
      entities,
      synchronize: process.env.NODE_ENV !== 'production',
      logging: process.env.Vigil_DB_LOGGING === 'true',
    });

    await ds.initialize();
    dataSource = ds;

    return ds;
  })();

  try {
    return await initPromise;
  } catch (e) {
    initPromise = null;
    throw e;
  }
};

export { DataSource };
